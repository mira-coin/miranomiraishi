import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { io as connect } from "socket.io-client";

process.env.PORT = "0";
const { io, rooms, server } = await import("./server.mjs");

let baseUrl;
const clients = [];

function waitFor(socket, event, predicate = () => true, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`${event} timeout`));
    }, timeout);
    const handler = (payload) => {
      if (!predicate(payload)) return;
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(payload);
    };
    socket.on(event, handler);
  });
}

function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    socket.timeout(3000).emit(event, payload, (error, response) => {
      if (error) reject(error);
      else resolve(response);
    });
  });
}

async function makeClient() {
  const socket = connect(baseUrl, { transports: ["websocket"], forceNew: true });
  clients.push(socket);
  if (!socket.connected) await waitFor(socket, "connect");
  return socket;
}

before(async () => {
  if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  rooms.close();
  clients.forEach((socket) => socket.disconnect());
  await new Promise((resolve) => io.close(resolve));
});

test("ルーム作成・参加・秘密手札バトル・同時公開", async () => {
  const alice = await makeClient();
  const bob = await makeClient();

  const aliceRoomUpdates = [];
  alice.on("room:update", (state) => aliceRoomUpdates.push(state));

  const created = await emitAck(alice, "room:create", { name: "Alice", charKey: "mira", turns: 5 });
  assert.equal(created.ok, true);
  assert.match(created.code, /^[A-Z2-9]{6}$/);

  const joined = await emitAck(bob, "room:join", { code: created.code, name: "Bob", charKey: "you" });
  assert.equal(joined.ok, true);
  assert.notEqual(created.playerId, joined.playerId);
  await emitAck(bob, "room:ready", { ready: true });

  const firstAliceState = waitFor(alice, "game:state", (state) => state.phase === "preroll");
  const firstBobState = waitFor(bob, "game:state", (state) => state.phase === "preroll");
  const started = await emitAck(alice, "room:start");
  assert.equal(started.ok, true);
  const [aliceState, bobState] = await Promise.all([firstAliceState, firstBobState]);

  assert.equal(aliceState.you.id, created.playerId);
  assert.equal(bobState.you.id, joined.playerId);
  assert.equal(aliceState.you.hand.length, 5);
  assert.equal(bobState.you.hand.length, 0);
  assert.equal(aliceState.players.find((player) => player.id === created.playerId).maxHp, 8);
  assert.equal(aliceState.players.find((player) => player.id === joined.playerId).maxHp, 9);
  assert.ok(aliceState.players.every((player) => !("hand" in player)));
  assert.ok(bobState.players.every((player) => !("hand" in player)));

  const internal = rooms.rooms.get(created.code);
  internal.game.players[0].status.badluck = true;
  internal.game.players[1].pos = 1;

  const aliceBattleWait = waitFor(alice, "game:state", (state) => state.phase === "battle" && !state.battle.reveal);
  const bobBattleWait = waitFor(bob, "game:state", (state) => state.phase === "battle" && !state.battle.reveal);
  assert.equal((await emitAck(alice, "game:roll")).ok, true);
  const [aliceBattle, bobBattle] = await Promise.all([aliceBattleWait, bobBattleWait]);

  assert.equal(aliceBattle.battle.attackerId, created.playerId);
  assert.equal(bobBattle.battle.defenderId, joined.playerId);
  assert.equal(aliceBattle.you.hand.length, 5);
  assert.equal(bobBattle.you.hand.length, 5);
  assert.ok(aliceBattle.players.every((player) => !("hand" in player)));
  assert.ok(bobBattle.players.every((player) => !("hand" in player)));
  assert.notDeepEqual(aliceBattle.you.hand.map((card) => card.id), bobBattle.you.hand.map((card) => card.id));

  internal.game.players[0].hand[0].t = "g";
  internal.game.players[0].hand[0].v = 3;
  internal.game.players[1].hand[0].t = "c";
  internal.game.players[1].hand[0].v = 1;
  const bobHpBefore = internal.game.players[1].hp;
  const revealAWait = waitFor(alice, "game:state", (state) => !!state.battle?.reveal);
  const revealBWait = waitFor(bob, "game:state", (state) => !!state.battle?.reveal);
  assert.equal((await emitAck(alice, "battle:choose", { cardId: aliceBattle.you.hand[0].id })).ok, true);
  assert.equal((await emitAck(bob, "battle:choose", { cardId: bobBattle.you.hand[0].id })).ok, true);
  const [revealA, revealB] = await Promise.all([revealAWait, revealBWait]);
  assert.deepEqual(revealA.battle.reveal, revealB.battle.reveal);
  assert.equal(revealA.battle.reveal.winnerId, created.playerId);
  assert.equal(internal.game.players[1].hp, bobHpBefore - 2);
});

test("再接続トークンで同じ席へ復帰", async () => {
  const host = await makeClient();
  const created = await emitAck(host, "room:create", { name: "Reconnect", charKey: "yui", turns: 5 });
  assert.equal(created.ok, true);
  host.disconnect();

  const resumedClient = await makeClient();
  const updateWait = waitFor(resumedClient, "room:update", (room) => room.code === created.code);
  const resumed = await emitAck(resumedClient, "room:resume", { token: created.token });
  assert.equal(resumed.ok, true);
  assert.equal(resumed.playerId, created.playerId);
  const room = await updateWait;
  assert.equal(room.players[0].connected, true);
});

test("明示退出で復帰情報を破棄", async () => {
  const player = await makeClient();
  const created = await emitAck(player, "room:create", { name: "Leave", charKey: "mira", turns: 5 });
  assert.equal(created.ok, true);
  assert.equal((await emitAck(player, "room:leave")).ok, true);
  assert.equal(rooms.rooms.has(created.code), false);
  const resumed = await emitAck(player, "room:resume", { token: created.token });
  assert.equal(resumed.ok, false);
});

test("人間2人＋CPUで開始しCPUが自動でターン進行", async () => {
  const host = await makeClient();
  const guest = await makeClient();
  const created = await emitAck(host, "room:create", { name: "Host", charKey: "mira", turns: 5 });
  const joined = await emitAck(guest, "room:join", { code: created.code, name: "Guest", charKey: "you" });
  await emitAck(guest, "room:ready", { ready: true });

  const cpuAddedWait = waitFor(host, "room:update", (room) => room.code === created.code && room.players.some((player) => player.isCpu));
  assert.equal((await emitAck(host, "room:cpu:add")).ok, true);
  const cpuRoom = await cpuAddedWait;
  const cpuMember = cpuRoom.players.find((player) => player.isCpu);
  assert.ok(cpuMember);
  assert.equal(cpuRoom.players.length, 3);
  assert.equal(cpuRoom.canStart, true);

  const hostStartWait = waitFor(host, "game:state", (state) => state.phase === "preroll");
  assert.equal((await emitAck(host, "room:start")).ok, true);
  await hostStartWait;
  const internal = rooms.rooms.get(created.code);
  internal.game.players[0].pos = 0;
  internal.game.players[1].pos = 10;
  internal.game.players[2].pos = 18;
  internal.game.players.forEach((player) => { player.status.badluck = true; });

  const guestTurnWait = waitFor(guest, "game:state", (state) => state.activePlayerId === joined.playerId && state.phase === "preroll");
  assert.equal((await emitAck(host, "game:roll")).ok, true);
  await guestTurnWait;

  const cpuRollWait = waitFor(host, "game:state", (state) => state.lastRoll?.playerId === cpuMember.id, 5000);
  assert.equal((await emitAck(guest, "game:roll")).ok, true);
  const cpuState = await cpuRollWait;
  assert.equal(cpuState.players.find((player) => player.id === cpuMember.id).isCpu, true);
});

test("公式サイトOriginだけを許可する", async () => {
  const allowed = connect(baseUrl, {
    transports: ["websocket"],
    forceNew: true,
    extraHeaders: { Origin: "https://mira-official.miranomiraishi.chatgpt.site" },
  });
  clients.push(allowed);
  if (!allowed.connected) await waitFor(allowed, "connect");
  assert.equal(allowed.connected, true);

  const denied = connect(baseUrl, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    timeout: 1000,
    extraHeaders: { Origin: "https://example.invalid" },
  });
  clients.push(denied);
  const error = await waitFor(denied, "connect_error");
  assert.ok(error);
  assert.equal(denied.connected, false);
});