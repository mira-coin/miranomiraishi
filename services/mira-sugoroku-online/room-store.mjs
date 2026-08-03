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
      if ((Number(index) || 0) === 0) {
        this.#monster(room, player);
      } else {
        const toll = Math.min(10, player.coin);
        player.coin -= toll;
        player.pos = stepBack(player.pos, 1);
        this.#log(room, `${event.nm}：退路を選び、${toll}コインを落として1マス後退`);
      }
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
    if (player.items.length >= 5) return { ok: false, error: "カード袋がいっぱいです" };
    player.coin -= product.price;
    player.items.push(product.item);
    this.#log(room, `${player.name}は${ITEMS[product.item].nm}を購入`);
    room.game.prompt = null;
    this.#afterTile(room, player);
    return { ok: true };
  }

  useItem(socket, input = {}) {
    const found = this.#activeFromSocket(socket.id, "preroll");
    if (!found) return { ok: false, error: "今はカードを使えません" };
    const { room, player } = found;
    if (player.itemUsedThisTurn) return { ok: false, error: "このターンは使用済みです" };
    const index = player.items.indexOf(input.item);
    if (index < 0) return { ok: false, error: "カードを持っていません" };
    const key = player.items[index];
    const target = room.game.players.find((entry) => entry.id === input.targetId && entry.id !== player.id);
    if (["skip", "steal", "swap"].includes(key) && !target) return { ok: false, error: "対象を選んでください" };
    if (key === "dice2") player.status.diceCount = 2;
    else if (key === "dice3") player.status.diceCount = 3;
    else if (key === "legend") {
      player.status.diceCount = 3;
      player.status.barrier = true;
      player.coin += 10;
    }
    else if (key === "boost") player.status.diceBoost = 3;
    else if (key === "shield") player.status.barrier = true;
    else if (key === "gold") player.coin += 30;
    else if (key === "heal") player.hp = Math.min(player.maxHp, player.hp + 3);
    else if (key === "skip") target.status.skipTurns = (target.status.skipTurns || 0) + 1;
    else if (key === "steal") {
      const amount = Math.min(40, Math.floor(target.coin * 0.25));
      target.coin -= amount;
      player.coin += amount;
    } else if (key === "swap") [player.pos, target.pos] = [target.pos, player.pos];
    else if (key === "trap") room.game.traps[player.pos] = player.slot;
    else return { ok: false, error: "このカードは自動発動です" };
    player.items.splice(index, 1);
    player.itemUsedThisTurn = true;
    this.#log(room, `${player.name}が「${ITEMS[key].nm}」を使用`);
    this.#emitGame(room);
    return { ok: true };
  }

  battleChoose(socket, cardId) {
    const found = this.#findBySocket(socket.id);
    const battle = found?.room.game?.battle;
    if (!found || found.room.game.phase !== "battle" || !battle) return { ok: false, error: "バトル中ではありません" };
    if (![battle.attackerId, battle.defenderId].includes(found.member.id)) return { ok: false, error: "このバトルの参加者ではありません" };
    const player = found.room.game.players.find((entry) => entry.id === found.member.id);
    const card = player.hand.find((entry) => entry.id === cardId && !entry.sealed);
    if (!card) return { ok: false, error: "そのカードは選べません" };
    if (battle.choices[player.id]) return { ok: false, error: "選択済みです" };
    battle.choices[player.id] = card;
    this.#emitGame(found.room);
    if (battle.choices[battle.attackerId] && battle.choices[battle.defenderId]) this.#resolveBattle(found.room);
    return { ok: true };
  }

  disconnect(socketId) {
    const found = this.#findBySocket(socketId);
    if (!found) return;
    const { room, member } = found;
    member.connected = false;
    member.socketId = null;
    room.message = `${member.name}が切断しました（60秒間復帰可能）`;
    this.#emitRoom(room);
    if (room.game) this.#emitGame(room);
    member.disconnectTimer = setTimeout(() => {
      if (member.connected) return;
      if (room.status === "lobby") {
        room.members = room.members.filter((entry) => entry.id !== member.id);
        this.sessions.delete(member.token);
        if (!room.members.length) this.#deleteRoom(room);
        else {
          if (room.hostId === member.id) room.hostId = room.members[0].id;
          this.#emitRoom(room);
        }
      }
    }, RECONNECT_GRACE);
  }

  #newMember(socket, input, taken) {
    const member = {
      id: crypto.randomUUID(),
      token: crypto.randomBytes(24).toString("base64url"),
      socketId: socket.id,
      connected: true,
      ready: false,
      name: safeName(input.name),
      charKey: safeChar(input.charKey, taken),
      isCpu: false,
      disconnectTimer: null,
    };
    this.sessions.set(member.token, { playerId: member.id, code: null });
    queueMicrotask(() => {
      const found = this.#findByPlayer(member.id);
      if (found) this.sessions.set(member.token, { playerId: member.id, code: found.room.code });
    });
    return member;
  }

  #findBySocket(socketId) {
    for (const room of this.rooms.values()) {
      const member = room.members.find((entry) => entry.socketId === socketId);
      if (member) return { room, member };
    }
    return null;
  }

  #findByPlayer(playerId) {
    for (const room of this.rooms.values()) {
      const member = room.members.find((entry) => entry.id === playerId);
      if (member) return { room, member };
    }
    return null;
  }

  #activeFromSocket(socketId, phase) {
    const found = this.#findBySocket(socketId);
    const game = found?.room.game;
    if (!found || !game || game.finished || game.phase !== phase) return null;
    const player = game.players[game.active];
    if (player.id !== found.member.id) return null;
    return { ...found, player };
  }

  #roomPublic(room) {
    return {
      code: room.code,
      status: room.status,
      hostId: room.hostId,
      turns: room.turns,
      message: room.message,
      canStart: room.members.length >= 2 && room.members.every((entry) => entry.ready && entry.connected),
      players: room.members.map((member) => ({
        id: member.id,
        name: member.name,
        charKey: member.charKey,
        img: CHARS[member.charKey].img,
        color: CHARS[member.charKey].color,
        connected: member.connected,
        ready: member.ready,
        isCpu: !!member.isCpu,
      })),
    };
  }

  #gameView(room, viewerId) {
    const game = room.game;
    const me = game.players.find((player) => player.id === viewerId);
    const battle = game.battle;
    const prompt = game.prompt ? {
      ...this.#safePrompt(game.prompt),
      actorId: game.prompt.playerId || null,
      actionable: game.prompt.playerId === viewerId,
    } : null;
    const battleView = battle ? {
      id: battle.id,
      attackerId: battle.attackerId,
      defenderId: battle.defenderId,
      attackerLocked: !!battle.choices[battle.attackerId],
      defenderLocked: !!battle.choices[battle.defenderId],
      reveal: battle.reveal || null,
    } : null;
    return {
      room: this.#roomPublic(room),
      turn: game.turn,
      maxTurn: game.maxTurn,
      active: game.active,
      activePlayerId: game.players[game.active]?.id || null,
      phase: game.phase,
      players: game.players.map(playerPublic),
      you: me ? {
        id: me.id,
        hand: me.hand,
        items: me.items,
        itemUsedThisTurn: me.itemUsedThisTurn,
        status: me.status,
      } : null,
      // Events, shops and route choices are shared table scenes. Only the
      // active player's copy is actionable; nothing here contains a secret.
      prompt,
      lastRoll: game.lastRoll || null,
      movePath: game.movePath || [],
      battle: battleView,
      log: game.log.slice(-10),
      result: game.result || null,
      goalCelebration: game.goalCelebration || null,
    };
  }

  #safePrompt(prompt) {
    if (prompt.type === "event") {
      const event = prompt.event;
      return {
        type: "event",
        title: event.nm,
        text: event.txt,
        cg: event.cg ? `cg/${event.cg}` : null,
        music: HAPPENING_EVENT_IDS.has(event.id) ? "happening" : "event",
        choices: event.dicechallenge ? ["1", "2", "3", "4", "5", "6"] :
          event.monster ? ["⚔ 正面から戦う", "🏃 コインを落として逃げる"] : event.ch.map((choice) => choice.l),
      };
    }
    if (prompt.type === "shop") {
      return {
        type: "shop",
        products: SHOP_STOCK.map((entry) => ({
          item: entry.item,
          price: entry.price,
          name: ITEMS[entry.item].nm,
          emoji: ITEMS[entry.item].em,
          description: ITEMS[entry.item].desc,
        })),
      };
    }
    return { ...prompt };
  }

  #emitRoom(room) {
    this.io.to(room.code).emit("room:update", this.#roomPublic(room));
  }

  #emitGame(room) {
    for (const member of room.members) {
      if (!member.socketId) continue;
      this.io.to(member.socketId).emit("game:state", this.#gameView(room, member.id));
    }
  }

  #log(room, message) {
    room.game.log.push({ id: crypto.randomUUID(), at: Date.now(), message });
    if (room.game.log.length > 40) room.game.log.shift();
  }

  #clearTimer(room) {
    clearTimeout(room.timer);
    room.timer = null;
  }

  #armTimer(room, callback, delay = TURN_TIMEOUT) {
    this.#clearTimer(room);
    room.timer = setTimeout(callback, delay);
  }

  #beginTurn(room) {
    const game = room.game;
    if (game.turn > game.maxTurn) {
      this.#finishGame(room);
      return;
    }
    const player = game.players[game.active];
    if (!player) return;
    if (player.hp <= 0) {
      const loss = Math.round(player.coin * 0.15);
      player.coin = Math.max(0, player.coin - loss);
      player.hp = Math.ceil(player.maxHp / 2);
      player.pos = stepBack(player.pos, 3);
      this.#log(room, `${player.name}はダウンから復活。この手番は休み`);
      this.#nextTurn(room);
      return;
    }
    if (player.status.rest || player.status.skipTurns) {
      delete player.status.rest;
      if (player.status.skipTurns) {
        player.status.skipTurns -= 1;
        if (player.status.skipTurns <= 0) delete player.status.skipTurns;
      }
      this.#log(room, `${player.name}は1回休み`);
      this.#nextTurn(room);
      return;
    }
    if (player.status.poison) {
      player.hp -= 1;
      player.status.poison -= 1;
      if (player.status.poison <= 0) delete player.status.poison;
    }
    player.itemUsedThisTurn = false;
    dealHand(player);
    if (player.status.sealedNext && player.hand.length) {
      delete player.status.sealedNext;
      pick(player.hand).sealed = true;
    }
    game.phase = "preroll";
    game.prompt = { type: "roll", playerId: player.id };
    game.lastRoll = null;
    this.#log(room, `${player.name}のターン`);
    this.#emitRoom(room);
    this.#emitGame(room);
    if (player.isCpu) this.#armTimer(room, () => this.#cpuTurn(room, player), 700);
    else this.#armTimer(room, () => this.#autoRoll(room));
  }

  #autoRoll(room) {
    const game = room.game;
    if (game?.phase !== "preroll") return;
    const member = room.members.find((entry) => entry.id === game.players[game.active].id);
    if (!member?.socketId) {
      const player = game.players[game.active];
      this.#performRoll(room, player);
      return;
    }
    this.roll({ id: member.socketId });
  }

  #cpuTurn(room, player) {
    const game = room.game;
    if (!game || game.finished || game.phase !== "preroll" || game.players[game.active]?.id !== player.id) return;
    this.#cpuUseItem(room, player);
    this.#performRoll(room, player);
  }

  #cpuUseItem(room, player) {
    if (player.itemUsedThisTurn || !player.items.length) return;
    const has = (key) => player.items.indexOf(key);
    const rivals = room.game.players.filter((entry) => entry.id !== player.id);
    const leader = [...rivals].sort((a, b) => score(b) - score(a))[0];
    let key = null;
    if (player.hp <= Math.ceil(player.maxHp / 2) && has("heal") >= 0) key = "heal";
    else if (has("legend") >= 0) key = "legend";
    else if (has("dice3") >= 0) key = "dice3";
    else if (has("dice2") >= 0) key = "dice2";
    else if (has("boost") >= 0) key = "boost";
    else if (!player.status.barrier && has("shield") >= 0) key = "shield";
    else if (leader && has("steal") >= 0) key = "steal";
    else if (leader && has("skip") >= 0) key = "skip";
    else if (has("gold") >= 0) key = "gold";
    else if (leader && score(player) < score(leader) && has("swap") >= 0) key = "swap";
    else if (has("trap") >= 0 && TILES[player.pos].type !== "start") key = "trap";
    if (!key) return;

    if (key === "heal") player.hp = Math.min(player.maxHp, player.hp + 3);
    else if (key === "legend") {
      player.status.diceCount = 3;
      player.status.barrier = true;
      player.coin += 10;
    }
    else if (key === "dice3") player.status.diceCount = 3;
    else if (key === "dice2") player.status.diceCount = 2;
    else if (key === "boost") player.status.diceBoost = 3;
    else if (key === "shield") player.status.barrier = true;
    else if (key === "gold") player.coin += 30;
    else if (key === "steal" && leader) {
      const amount = Math.min(40, Math.floor(leader.coin * 0.25));
      leader.coin -= amount;
      player.coin += amount;
    } else if (key === "skip" && leader) leader.status.skipTurns = (leader.status.skipTurns || 0) + 1;
    else if (key === "swap" && leader) [player.pos, leader.pos] = [leader.pos, player.pos];
    else if (key === "trap") room.game.traps[player.pos] = player.slot;
    else return;

    player.items.splice(has(key), 1);
    player.itemUsedThisTurn = true;
    this.#log(room, `${player.name}が「${ITEMS[key].nm}」を使用`);
    this.#emitGame(room);
  }

  #move(room, player, steps) {
    this.#continueMove(room, player, steps, []);
  }

  #continueMove(room, player, remaining, path) {
    const game = room.game;
    while (remaining > 0) {
      const tile = TILES[player.pos];
      if (tile.next.length > 1) {
        game.phase = "branch";
        game.prompt = {
          type: "branch",
          playerId: player.id,
          pos: player.pos,
          remaining,
          routes: tile.routes || tile.next.map((_, index) => `ルート${index + 1}`),
        };
        game.movePath = path;
        this.#emitGame(room);
        this.#armTimer(room, () => {
          if (game.phase !== "branch" || game.prompt?.playerId !== player.id) return;
          game.prompt = null;
          player.pos = tile.next[0];
          this.#continueMove(room, player, remaining - 1, [player.pos]);
        }, player.isCpu ? 650 : TURN_TIMEOUT);
        return;
      }
      const next = tile.next[0];
      if (next === player.pos) break;
      player.pos = next;
      path.push(next);
      remaining -= 1;
      if (TILES[player.pos].type === "goal") {
        const firstArrival = !game.firstGoalClaimed;
        const base = player.laps === 0 ? GOAL_REWARD : GOAL_REPEAT_REWARD;
        const coin = base.coin + (firstArrival ? GOAL_FIRST_BONUS.coin : 0);
        const vp = base.vp + (firstArrival ? GOAL_FIRST_BONUS.vp : 0);
        player.coin += coin;
        player.vp += vp;
        player.laps += 1;
        if (firstArrival) {
          game.firstGoalClaimed = true;
          if (player.items.length >= 5) player.items.splice(0, 1);
          player.items.push(GOAL_FIRST_BONUS.item);
        }
        game.goalCelebration = {
          id: `${Date.now()}:${player.id}:${player.laps}`,
          playerId: player.id,
          name: player.name,
          laps: player.laps,
          first: firstArrival,
          coin,
          vp,
        };
        player.pos = 0;
        path.push(0);
        this.#log(room, `${player.name}が${player.laps}周目ゴール！+${coin}コイン、★+${vp}${firstArrival ? "／一番乗りで伝説カード獲得！" : ""}`);
        remaining = 0;
      }
    }
    game.movePath = path;
    this.#land(room, player);
  }

  #land(room, player) {
    const game = room.game;
    const tile = TILES[player.pos];
    game.phase = "tile";
    game.prompt = null;
    const trapOwner = game.traps[player.pos];
    if (trapOwner !== undefined && trapOwner !== player.slot) {
      this.#damage(player, 3);
      delete game.traps[player.pos];
      this.#log(room, `${player.name}が設置トラップを踏んだ！HP-3`);
    }
    if (tile.type === "coin") {
      const amount = 10 + randomInt(3) * 5;
      player.coin += amount;
      this.#log(room, `${player.name}はコインマスで+${amount}`);
    } else if (tile.type === "coinloss") {
      const amount = Math.min(player.coin, 10 + randomInt(3) * 5);
      player.coin -= amount;
      this.#log(room, `${player.name}はマイナスゴールドマスで-${amount}`);
    } else if (tile.type === "card") {
      if (player.items.length < 5) {
        const item = pick(CARD_SPACE_POOL);
        player.items.push(item);
        this.#log(room, `${player.name}は「${ITEMS[item].nm}」を入手`);
      } else player.coin += 15;
    } else if (tile.type === "heal") {
      player.hp = Math.min(player.maxHp, player.hp + 3);
      delete player.status.poison;
      delete player.status.mud;
      this.#log(room, `${player.name}はHPを3回復`);
    } else if (tile.type === "treasure") {
      const roll = Math.random();
      if (roll < 0.55) {
        const amount = 30 + randomInt(4) * 10;
        player.coin += amount;
        this.#log(room, `${player.name}は宝箱から${amount}コイン獲得`);
      } else if (roll < 0.85 && player.items.length < 5) {
        const item = pick(CARD_SPACE_POOL);
        player.items.push(item);
        this.#log(room, `${player.name}は宝箱から「${ITEMS[item].nm}」を獲得`);
      } else {
        player.vp += 1;
        this.#log(room, `${player.name}は宝箱から★+1`);
      }
    } else if (tile.type === "trap") {
      const roll = Math.random();
      if (roll < 0.5) this.#damage(player, 3);
      else if (roll < 0.8) player.pos = stepBack(player.pos, 2);
      else player.coin = Math.max(0, player.coin - 20);
      this.#log(room, `${player.name}にトラップマスの効果`);
    } else if (tile.type === "warp") {
      const forward = Math.random() < 0.6;
      const amount = 3 + randomInt(4);
      if (forward) {
        this.#continueMove(room, player, amount, []);
        return;
      }
      player.pos = stepBack(player.pos, amount);
      this.#log(room, `${player.name}は後方へワープ`);
    } else if (tile.type === "shop") {
      game.phase = "shop";
      game.prompt = { type: "shop", playerId: player.id };
      this.#emitGame(room);
      this.#armTimer(room, () => {
        if (player.isCpu) {
          const affordable = SHOP_STOCK.filter((entry) => entry.price <= player.coin && player.items.length < 5);
          const product = affordable.length && Math.random() < 0.7 ? pick(affordable) : null;
          if (product) {
            player.coin -= product.price;
            player.items.push(product.item);
            this.#log(room, `${player.name}は${ITEMS[product.item].nm}を購入`);
          }
        }
        game.prompt = null;
        this.#afterTile(room, player);
      }, player.isCpu ? 2_200 : TURN_TIMEOUT);
      return;
    } else if (tile.type === "event") {
      const event = pick(EVENTS);
      game.phase = "event";
      game.prompt = { type: "event", playerId: player.id, event };
      this.#emitGame(room);
      this.#armTimer(room, () => {
        if (game.phase !== "event" || game.prompt?.playerId !== player.id) return;
        const pending = game.prompt.event;
        if (pending.dicechallenge) {
          const rolled = 1 + randomInt(6);
          if (rolled === 1) player.coin += 60;
          this.#log(room, `${pending.nm}：自動選択の結果は${rolled}`);
        } else if (pending.monster) {
          if (Math.random() < 0.7) this.#monster(room, player);
          else {
            const toll = Math.min(10, player.coin);
            player.coin -= toll;
            player.pos = stepBack(player.pos, 1);
            this.#log(room, `${pending.nm}：${player.name}は退路を選んだ`);
          }
        }
        else {
          const outcome = weightedPick(pending.ch[0].out);
          if (outcome.fx?.monsterBattle) {
            game.prompt = null;
            this.#log(room, `${player.name}は正面から戦う道を選んだ！`);
            this.#monster(room, player);
            return;
          }
          this.#applyFx(room, player, outcome.fx || {});
          this.#log(room, `イベント「${pending.nm}」：${outcome.t}`);
        }
        game.prompt = null;
        this.#afterTile(room, player);
      }, player.isCpu ? 3_000 : TURN_TIMEOUT);
      return;
    } else if (tile.type === "battle") {
      this.#monster(room, player);
    }
    this.#afterTile(room, player);
  }

  #afterTile(room, player) {
    this.#clearTimer(room);
    const opponent = room.game.players.find((entry) =>
      entry.id !== player.id && entry.hp > 0 && entry.pos === player.pos &&
      !["start", "goal"].includes(TILES[player.pos].type));
    if (opponent) {
      this.#startBattle(room, player, opponent);
      return;
    }
    this.#nextTurn(room);
  }

  #startBattle(room, attacker, defender) {
    const game = room.game;
    if (!attacker.hand.length) dealHand(attacker);
    if (!defender.hand.length) dealHand(defender);
    game.phase = "battle";
    game.prompt = null;
    game.battle = {
      id: crypto.randomUUID(),
      attackerId: attacker.id,
      defenderId: defender.id,
      choices: {},
      reveal: null,
    };
    for (const participant of [attacker, defender]) {
      if (!participant.isCpu) continue;
      const usable = participant.hand.filter((card) => !card.sealed);
      game.battle.choices[participant.id] = pick(usable.length ? usable : participant.hand);
    }
    this.#log(room, `${attacker.name}と${defender.name}の秘密カードバトル！`);
    this.#emitGame(room);
    if (game.battle.choices[attacker.id] && game.battle.choices[defender.id]) {
      this.#armTimer(room, () => this.#resolveBattle(room), 800);
      return;
    }
    this.#armTimer(room, () => {
      for (const player of [attacker, defender]) {
        if (!game.battle.choices[player.id]) {
          const usable = player.hand.filter((card) => !card.sealed);
          game.battle.choices[player.id] = pick(usable.length ? usable : player.hand);
        }
      }
      this.#resolveBattle(room);
    });
  }

  #resolveBattle(room) {
    this.#clearTimer(room);
    const game = room.game;
    const battle = game.battle;
    if (!battle || battle.reveal) return;
    const attacker = game.players.find((player) => player.id === battle.attackerId);
    const defender = game.players.find((player) => player.id === battle.defenderId);
    const cardA = battle.choices[attacker.id];
    const cardB = battle.choices[defender.id];
    let result = cardA.t === cardB.t ? Math.sign(cardA.v - cardB.v) : (BEATS[cardA.t] === cardB.t ? 1 : -1);
    if (result === 0) {
      if (attacker.charKey === "you" && (attacker.hp < defender.hp || attacker.coin < defender.coin)) result = 1;
      else if (defender.charKey === "you" && (defender.hp < attacker.hp || defender.coin < attacker.coin)) result = -1;
    }
    const winner = result > 0 ? attacker : result < 0 ? defender : null;
    const loser = result > 0 ? defender : result < 0 ? attacker : null;
    let stolen = 0;
    if (winner) {
      stolen = Math.round(loser.coin * 0.2);
      loser.coin -= stolen;
      winner.coin += stolen;
      this.#damage(loser, 2);
      loser.pos = stepBack(loser.pos, winner.charKey === "yuuri" ? 2 : 1);
      this.#log(room, `${winner.name}が勝利！${loser.name}に2ダメージ、${stolen}コイン獲得`);
    } else this.#log(room, "カードバトルは引き分け");
    battle.reveal = {
      attackerCard: cardA,
      defenderCard: cardB,
      winnerId: winner?.id || null,
      stolen,
    };
    this.#emitGame(room);
    this.#armTimer(room, () => {
      game.battle = null;
      this.#nextTurn(room);
    }, 4_000);
  }

  #monster(room, player) {
    const strength = 3 + randomInt(5);
    const power = 1 + randomInt(6) + Number(CHARS[player.charKey].atk || 0);
    if (power >= strength) {
      const reward = 20 + strength * 5;
      player.coin += reward;
      this.#log(room, `${player.name}がモンスターに勝利！+${reward}コイン`);
    } else {
      this.#damage(player, Math.max(2, Math.ceil((strength + 1) / 2)));
      this.#log(room, `${player.name}はモンスターに敗北`);
    }
  }

  #damage(player, amount) {
    if (player.status.barrier) {
      delete player.status.barrier;
      return;
    }
    if (player.items.includes("def") && amount >= 2) {
      player.items.splice(player.items.indexOf("def"), 1);
      amount = Math.max(0, amount - 2);
    }
    player.hp = Math.max(0, player.hp - amount);
  }

  #applyFx(room, player, fx) {
    if (fx.coin) player.coin = Math.max(0, player.coin + fx.coin);
    if (fx.coinPct) player.coin = Math.max(0, Math.round(player.coin * (1 + fx.coinPct)));
    if (fx.vp) player.vp = Math.max(0, player.vp + fx.vp);
    if (fx.hp) {
      if (fx.hp < 0) this.#damage(player, -fx.hp);
      else player.hp = Math.min(player.maxHp, player.hp + fx.hp);
    }
    if (fx.hpFull) player.hp = player.maxHp;
    if (fx.coinAll) room.game.players.forEach((entry) => { entry.coin = Math.max(0, entry.coin + fx.coinAll); });
    if (fx.hpAll) room.game.players.forEach((entry) => {
      if (fx.hpAll < 0) this.#damage(entry, -fx.hpAll);
      else entry.hp = Math.min(entry.maxHp, entry.hp + fx.hpAll);
    });
    if (fx.item && player.items.length < 5) player.items.push(fx.item === "random" ? pick(CARD_SPACE_POOL) : fx.item);
    if (fx.status) {
      if (fx.status === "poison") player.status.poison = 2;
      else if (fx.status === "sealed") player.status.sealedNext = true;
      else player.status[fx.status] = true;
    }
    if (fx.move && fx.move < 0) player.pos = stepBack(player.pos, -fx.move);
    if (fx.pushLeader) {
      const leader = [...room.game.players].sort((a, b) => score(b) - score(a))[0];
      leader.pos = stepBack(leader.pos, fx.pushLeader);
    }
    if (fx.slowRandom) {
      const targets = room.game.players.filter((entry) => entry.id !== player.id);
      if (targets.length) pick(targets).status.slow = true;
    }
    if (fx.underdogCoin) {
      const lowest = [...room.game.players].sort((a, b) => score(a) - score(b))[0];
      player.coin += lowest.id === player.id ? fx.underdogCoin : 5;
    }
    if (fx.loseItem && player.items.length) player.items.splice(randomInt(player.items.length), 1);
  }

  #nextTurn(room) {
    const game = room.game;
    this.#clearTimer(room);
    game.prompt = null;
    game.battle = null;
    game.active += 1;
    if (game.active >= game.players.length) {
      game.active = 0;
      game.turn += 1;
    }
    this.#emitGame(room);
    setTimeout(() => this.#beginTurn(room), 650);
  }

  #finishGame(room) {
    const game = room.game;
    game.finished = true;
    game.phase = "finished";
    game.result = [...game.players]
      .sort((a, b) => score(b) - score(a))
      .map((player, index) => ({ rank: index + 1, id: player.id, name: player.name, coin: player.coin, vp: player.vp, score: score(player) }));
    room.status = "finished";
    room.message = "対戦終了";
    this.#emitRoom(room);
    this.#emitGame(room);
  }

  #deleteRoom(room) {
    this.#clearTimer(room);
    for (const member of room.members) {
      clearTimeout(member.disconnectTimer);
      if (member.token) this.sessions.delete(member.token);
    }
    this.rooms.delete(room.code);
  }
}
