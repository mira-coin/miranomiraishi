import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, "game-data.js"), "utf8");
const sandbox = {};

vm.runInNewContext(
  `${source}
globalThis.__onlineData = {
  CHARS, CHAR_KEYS, JTYPES, BEATS, ITEMS, CARD_SPACE_POOL,
  MONSTERS, TILE_DEFS, BOARD_NODES, GOAL_REWARD, GOAL_FIRST_BONUS,
  GOAL_REPEAT_REWARD, GOAL_CG, EVENTS, SHOP_STOCK
};`,
  sandbox,
  { filename: "js/data.js" },
);

const data = sandbox.__onlineData;
export const {
  CHARS, CHAR_KEYS, JTYPES, BEATS, ITEMS, CARD_SPACE_POOL,
  MONSTERS, TILE_DEFS, BOARD_NODES, GOAL_REWARD, GOAL_FIRST_BONUS,
  GOAL_REPEAT_REWARD, GOAL_CG, EVENTS, SHOP_STOCK,
} = data;

export const TILES = BOARD_NODES.map((node, index) => ({
  x: node.x,
  y: node.y,
  type: node.t,
  next: node.next || (index + 1 < BOARD_NODES.length ? [index + 1] : [index]),
  routes: node.routes || null,
  trapOwner: -1,
}));

export const PREV = (() => {
  const prev = [];
  TILES.forEach((tile, index) => {
    tile.next.forEach((next) => {
      if (prev[next] === undefined && next !== index) prev[next] = index;
    });
  });
  prev[0] = 0;
  return prev;
})();

export function stepBack(pos, count = 1) {
  let result = pos;
  for (let i = 0; i < count; i += 1) result = PREV[result] ?? result;
  return result;
}