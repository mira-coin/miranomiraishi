import crypto from "node:crypto";
import {
  BEATS, CARD_SPACE_POOL, CHARS, CHAR_KEYS, EVENTS, GOAL_REWARD,
  GOAL_FIRST_BONUS, GOAL_REPEAT_REWARD,
  ITEMS, SHOP_STOCK, TILES, stepBack,
} from "./data.mjs";

const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PLAYERS = 4;
const TURN_TIMEOUT = 45_000;
const RECONNECT_GRACE = 60_000;
const HAPPENING_EVENT_IDS = new Set(["EV012","EV013","EV015","EV017","EV018","EV020","EV028","EV029","EV030","EV031","EV032","EV033","EV034","EV035","EV036","EV041","EV044","EV045","EV046","EV049","EV052","EV053","EV058"]);

const randomInt = (max) => crypto.randomInt(0, max);
const pick = (array) => array[randomInt(array.length)];
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function roomCode() {
  return Array.from({ length: 6 }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join("");
}

function weightedPick(entries) {
  const total = entries.reduce((sum, entry) => sum + Number(entry.w || 0), 0);
  let value = Math.random() * total;
  for (const entry of entries) {
    value -= Number(entry.w || 0);
    if (value < 0) return entry;
  }
  return entries.at(-1);
}

function safeName(value) {
  return String(value || "旅人").trim().slice(0, 12) || "旅人";
}

function safeChar(value, taken = new Set()) {
  if (CHAR_KEYS.includes(value) && !taken.has(value)) return value;
  return CHAR_KEYS.find((key) => !taken.has(key)) || CHAR_KEYS[0];
}

function playerPublic(player) {
  return {
    id: player.id,
    name: player.name,
    charKey: player.charKey,
    img: CHARS[player.charKey].img,
    color: CHARS[player.charKey].color,
    connected: player.connected,
    ready: player.ready,
    isCpu: !!player.isCpu,
    hp: player.hp,
    maxHp: player.maxHp,
    coin: player.coin,
    vp: player.vp,
    pos: player.pos,
    laps: player.laps,
    handCount: player.hand?.length || 0,
    itemCount: player.items?.length || 0,
  };
}

function score(player) {
  return player.coin + player.vp * 10;
}

function dealHand(player) {
  const weights = CHARS[player.charKey].weights;
  const pool = [];
  for (const type of ["g", "c", "p"]) {
    for (let i = 0; i < Math.round(weights[type] * 10); i += 1) pool.push(type);
  }
  player.hand = Array.from({ length: 5 }, (_, index) => ({
    id: `${player.id}:${Date.now()}:${index}:${crypto.randomBytes(2).toString("hex")}`,
    t: pick(pool),
    v: 1 + randomInt(3),
    sealed: false,
  }));
}

function newGamePlayer(member, slot) {
  const char = CHARS[member.charKey];
  return {
    id: member.id,
    slot,
    name: member.name,
    charKey: member.charKey,
    hp: char.hp,
    maxHp: char.hp,
    coin: 60,
    vp: 0,
    pos: 0,
    laps: 0,
    hand: [],
    items: [],
    status: {},
    itemUsedThisTurn: false,
    isCpu: !!member.isCpu,
  };
}

export class RoomStore {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();
    this.sessions = new Map();
  }

  close() {
    for (const room of this.rooms.values()) {
      this.#clearTimer(room);
      room.members.forEach((member) => clearTimeout(member.disconnectTimer));
    }
    this.rooms.clear();
    this.sessions.clear();
  }

  create(socket, input = {}) {
    let code;
    do code = roomCode(); while (this.rooms.has(code));
    const member = this.#newMember(socket, input, new Set());
    member.ready = true;
    const room = {
      code,
      hostId: member.id,
      status: "lobby",
      turns: clamp(Number(input.turns) || 10, 5, 30),
      members: [member],
      game: null,
      timer: null,
      message: "ルームを作成しました",
      createdAt: Date.now(),
    };
    this.rooms.set(code, room);
    socket.join(code);
    this.#emitRoom(room);
    return { ok: true, code, token: member.token, playerId: member.id };
  }

  join(socket, input = {}) {
    const code = String(input.code || "").trim().toUpperCase();
    const room = this.rooms.get(code);
    if (!room) return { ok: false, error: "ルームが見つかりません" };
    if (room.status !== "lobby") return { ok: false, error: "このルームは対戦中です。再接続を利用してください" };
    if (room.members.length >= MAX_PLAYERS) return { ok: false, error: "ルームが満員です" };
    const taken = new Set(room.members.map((member) => member.charKey));
    const member = this.#newMember(socket, input, taken);
    room.members.push(member);
    socket.join(code);
    room.message = `${member.name}が参加しました`;
    this.#emitRoom(room);
    return { ok: true, code, token: member.token, playerId: member.id };
  }

  leave(socket) {
    const found = this.#findBySocket(socket.id);
    if (!found) return { ok: true };
    const { room, member } = found;
    socket.leave(room.code);
    clearTimeout(member.disconnectTimer);
    member.disconnectTimer = null;
    member.socketId = null;
    member.connected = false;
    if (member.token) this.sessions.delete(member.token);

    if (room.status === "playing" && room.game) {
      member.isCpu = true;
      member.connected = true;
      member.ready = true;
      member.token = null;
      const player = room.game.players.find((entry) => entry.id === member.id);
      if (player) player.isCpu = true;
      const humans = room.members.filter((entry) => !entry.isCpu);
      if (!humans.length) this.#deleteRoom(room);
      else {
        if (room.hostId === member.id) room.hostId = humans[0].id;
        room.message = `${member.name}が退出したためCPUが引き継ぎました`;
        this.#emitRoom(room);
        this.#emitGame(room);
        if (player && room.game.players[room.game.active]?.id === player.id && room.game.phase === "preroll") {
          this.#armTimer(room, () => this.#cpuTurn(room, player), 700);
        }
      }
      return { ok: true };
    }

    room.members = room.members.filter((entry) => entry.id !== member.id);
    const humans = room.members.filter((entry) => !entry.isCpu);
    if (!humans.length) this.#deleteRoom(room);
    else {
      if (room.hostId === member.id) room.hostId = humans[0].id;
      room.message = `${member.name}が退出しました`;
      this.#emitRoom(room);
    }
    return { ok: true };
  }

  addCpu(socket) {
    const found = this.#findBySocket(socket.id);
    if (!found) return { ok: false, error: "ルームに参加していません" };
    const { room, member } = found;
    if (room.status !== "lobby") return { ok: false, error: "CPUは対戦開始前だけ追加できます" };
    if (room.hostId !== member.id) return { ok: false, error: "ホストだけがCPUを追加できます" };
    if (room.members.length >= MAX_PLAYERS) return { ok: false, error: "ルームが満員です" };
    const taken = new Set(room.members.map((entry) => entry.charKey));
    const charKey = safeChar(null, taken);
    const cpu = {
      id: `cpu:${crypto.randomUUID()}`,
      token: null,
      socketId: null,
      connected: true,
      ready: true,
      name: `CPU・${CHARS[charKey].name}`,
      charKey,
      isCpu: true,
      disconnectTimer: null,
    };
    room.members.push(cpu);
    room.message = `${cpu.name}を追加しました`;
    this.#emitRoom(room);
    return { ok: true, cpuId: cpu.id };
  }

  removeCpu(socket, cpuId) {
    const found = this.#findBySocket(socket.id);
    if (!found) return { ok: false, error: "ルームに参加していません" };
    const { room, member } = found;
    if (room.status !== "lobby") return { ok: false, error: "CPUは対戦開始前だけ削除できます" };
    if (room.hostId !== member.id) return { ok: false, error: "ホストだけがCPUを削除できます" };
    const cpu = room.members.find((entry) => entry.id === cpuId && entry.isCpu);
    if (!cpu) return { ok: false, error: "CPUが見つかりません" };
    room.members = room.members.filter((entry) => entry.id !== cpu.id);
    room.message = `${cpu.name}を削除しました`;
    this.#emitRoom(room);
    return { ok: true };
  }

  resume(socket, token) {
    const session = this.sessions.get(String(token || ""));
    if (!session) return { ok: false, error: "復帰情報がありません" };
    const room = this.rooms.get(session.code);
    const member = room?.members.find((entry) => entry.id === session.playerId);
    if (!room || !member) return { ok: false, error: "ルームが終了しています" };
    member.socketId = socket.id;
    member.connected = true;
    clearTimeout(member.disconnectTimer);
    member.disconnectTimer = null;
    socket.join(room.code);
    room.message = `${member.name}が再接続しました`;
    this.#emitRoom(room);
    if (room.game) this.#emitGame(room);
    return { ok: true, code: room.code, playerId: member.id };
  }

  setReady(socket, ready) {
    const found = this.#findBySocket(socket.id);
    if (!found || found.room.status !== "lobby") return { ok: false };
    found.member.ready = !!ready;
    found.room.message = `${found.member.name}：${ready ? "準備OK" : "準備中"}`;
    this.#emitRoom(found.room);
    return { ok: true };
  }

  start(socket) {
    const found = this.#findBySocket(socket.id);
    if (!found) return { ok: false, error: "ルームに参加していません" };
    const { room, member } = found;
    if (room.hostId !== member.id) return { ok: false, error: "ホストだけが開始できます" };
    if (room.members.length < 2) return { ok: false, error: "2人以上必要です" };
    if (!room.members.every((entry) => entry.ready && entry.connected)) {
      return { ok: false, error: "全員の準備完了を待っています" };
    }
    room.status = "playing";
    room.game = {
      players: room.members.map(newGamePlayer),
      turn: 1,
      maxTurn: room.turns,
      active: 0,
      phase: "starting",
      prompt: null,
      battle: null,
      traps: {},
      log: [],
      finished: false,
      firstGoalClaimed: false,
      goalCelebration: null,
    };
    this.#log(room, "オンライン対戦スタート！");
    this.#beginTurn(room);
    return { ok: true };
  }

  roll(socket) {
    const found = this.#activeFromSocket(socket.id, "preroll");
    if (!found) return { ok: false, error: "今はダイスを振れません" };
    const { room, player } = found;
    this.#performRoll(room, player);
    return { ok: true };
  }

  #performRoll(room, player) {
    this.#clearTimer(room);
    const count = clamp(player.status.diceCount || 1, 1, 3);
    delete player.status.diceCount;
    const sides = player.status.slow ? 3 : 6;
    delete player.status.slow;
    const rolls = Array.from({ length: count }, () => player.status.badluck ? 1 : 1 + randomInt(sides));
    delete player.status.badluck;
    const boost = player.status.diceBoost || 0;
    delete player.status.diceBoost;
    let total = rolls.reduce((sum, value) => sum + value, 0) + boost;
    if (player.status.mud) {
      delete player.status.mud;
      total = Math.ceil(total / 2);
    }
    total = Math.max(1, total);
    room.game.phase = "moving";
    room.game.lastRoll = { playerId: player.id, rolls, boost, total };
    this.#log(room, `${player.name}のダイス：${rolls.join(" + ")}${boost ? ` + ${boost}` : ""} ＝ ${total}`);
    this.#move(room, player, total);
  }

  chooseBranch(socket, index) {
    const found = this.#activeFromSocket(socket.id, "branch");
    if (!found) return { ok: false, error: "分岐を選べません" };
    const { room, player } = found;
    const pending = room.game.prompt;
    const tile = TILES[pending.pos];
    const selected = clamp(Number(index) || 0, 0, tile.next.length - 1);
    this.#clearTimer(room);
    room.game.prompt = null;
    player.pos = tile.next[selected];
    const path = [player.pos];
    this.#continueMove(room, player, pending.remaining - 1, path);
    return { ok: true };
  }

  eventChoice(socket, index) {
    const found = this.#activeFromSocket(socket.id, "event");
    if (!found) return { ok: false, error: "イベントを選べません" };
    const { room, player } = found;
    const pending = room.game.prompt;
    const event = pending.event;
    this.#clearTimer(room);
    if (event.dicechallenge) {
      const guess = clamp((Number(index) || 0) + 1, 1, 6);
      const rolled = 1 + randomInt(6);
      if (guess === rolled) player.coin += 60;
      this.#log(room, `${event.nm}：出目は${rolled}。${guess === rolled ? "的中！+60コイン" : "残念、はずれ"}`);
    } else if (event.monster) {
      this.#monster(room, player);
    } else {
      const choice = event.ch[clamp(Number(index) || 0, 0, event.ch.length - 1)];
      const outcome = weightedPick(choice.out);
      if (outcome.fx?.monsterBattle) {
        room.game.prompt = null;
        this.#log(room, `${player.name}は正面から戦う道を選んだ！`);
        this.#monster(room, player);
        return { ok: true };
      }
      this.#applyFx(room, player, outcome.fx || {});
      this.#log(room, `イベント「${event.nm}」：${outcome.t}`);
    }
    room.game.prompt = null;
    this.#afterTile(room, player);
    return { ok: true };
  }

  shop(socket, itemKey) {
    const found = this.#activeFromSocket(socket.id, "shop");
    if (!found) return { ok: false, error: "買い物できません" };
    const { room, player } = found;
    this.#clearTimer(room);
    if (itemKey === "leave") {
      room.game.prompt = null;
      this.#afterTile(room, player);
      return { ok: true };
    }
    const product = SHOP_STOCK.find((entry) => entry.item === itemKey);
    if (!product) return { ok: false, error: "商品がありません" };
    if (player.coin < product.price) return { ok: false, error: "コインが足りません" };
    if (player.item…16893 tokens truncated…ocket.off(event, handler);
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
