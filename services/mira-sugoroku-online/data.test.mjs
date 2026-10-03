import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_NODES, CARD_SPACE_POOL, EVENTS, GOAL_FIRST_BONUS,
  GOAL_CG, GOAL_REPEAT_REWARD, GOAL_REWARD, ITEMS, SHOP_STOCK, TILE_DEFS,
} from "./data.mjs";

test("全イベントは意味のある2〜3択を持つ", () => {
  assert.equal(EVENTS.length, 49);
  for (const event of EVENTS) {
    assert.ok(Array.isArray(event.ch), `${event.id}に選択肢がない`);
    assert.ok(event.ch.length >= 2 && event.ch.length <= 3, `${event.id}は${event.ch.length}択`);
    for (const choice of event.ch) {
      assert.ok(choice.l?.trim(), `${event.id}に空のラベル`);
      assert.ok(choice.out?.length, `${event.id}/${choice.l}に結果がない`);
    }
    assert.ok(event.cg?.endsWith(".png"), `${event.id}にキャラ入りCGが割り当てられていない`);
  }
});

test("盤面に無効マスがなく、色分けした3種の報酬マスを含む", () => {
  assert.ok(BOARD_NODES.every((node) => TILE_DEFS[node.t]), "未定義のマスがある");
  assert.ok(!BOARD_NODES.some((node) => node.t === "normal"), "何も起きない通常マスが残っている");
  for (const type of ["coin", "coinloss", "card"]) {
    assert.ok(BOARD_NODES.some((node) => node.t === type), `${type}マスがない`);
  }
  assert.notEqual(TILE_DEFS.coin.fill, TILE_DEFS.coinloss.fill);
  assert.notEqual(TILE_DEFS.coin.fill, TILE_DEFS.card.fill);
});

test("ゴール報酬はイベント一発より明確に価値がある", () => {
  assert.ok(GOAL_REWARD.coin >= 60);
  assert.ok(GOAL_REWARD.vp >= 4);
  assert.ok(GOAL_REWARD.coin + GOAL_REWARD.vp * 10 >= 100);
  assert.ok(GOAL_FIRST_BONUS.coin >= 30 && GOAL_FIRST_BONUS.vp >= 2);
  assert.equal(GOAL_FIRST_BONUS.item, "legend");
  assert.ok(ITEMS.legend?.rare);
  assert.ok(!CARD_SPACE_POOL.includes("legend"), "伝説カードが通常抽選へ混ざっている");
  assert.ok(!SHOP_STOCK.some((entry) => entry.item === "legend"), "伝説カードがショップ販売されている");
  assert.ok(GOAL_REPEAT_REWARD.coin < GOAL_REWARD.coin, "周回報酬は初回より抑える");
  assert.ok(GOAL_CG.endsWith(".png"), "ゴール専用CGが未設定");
});
