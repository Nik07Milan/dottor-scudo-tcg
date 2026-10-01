// Bot casuale (T2.1): sceglie in modo uniforme tra le mosse legali, senza mai arrendersi.

import { randomInt } from "../rng";
import type { Bot } from "./bot";

export const randomBot: Bot = {
  name: "random",
  choose(_view, _player, legal, rng) {
    const options = legal.filter((a) => a.type !== "concede");
    const pool = options.length > 0 ? options : legal;
    const r = randomInt(rng, pool.length);
    return { action: pool[r.value]!, rng: r.seed };
  },
};
