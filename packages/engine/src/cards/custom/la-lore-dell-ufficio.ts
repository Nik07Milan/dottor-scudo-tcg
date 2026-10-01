// La Lore dell'ufficio — Evoca 3 colleghi casuali dell'Ufficio con costo 3 o meno.
// Custom perché il DSL evoca solo carte con id fisso: qui l'id viene estratto (RNG della partita, con
// ripetizioni) da un insieme di carte definito da un filtro. Gli evocati non attivano il Deploy.

import { summonMinion } from "../../board";
import type { Ctx } from "../../context";
import { CARDS } from "../../data";
import type { EffectSource } from "../../effects";
import { randomInt } from "../../rng";

const COUNT = 3;
const MAX_COST = 3;

const POOL = CARDS.filter((c) => c.type === "minion" && c.faction === "ufficio" && c.rarity !== "token" && c.cost <= MAX_COST).map((c) => c.id);

export function laLoreDellUfficio(ctx: Ctx, source: EffectSource): void {
  for (let i = 0; i < COUNT; i++) {
    const r = randomInt(ctx.state.rng, POOL.length);
    ctx.state.rng = r.seed;
    if (!summonMinion(ctx, source.player, POOL[r.value]!)) return; // scrivania piena
  }
}
