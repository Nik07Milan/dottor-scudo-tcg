// Bot greedy (T2.2): per ogni mossa legale simula il risultato sulla propria vista (senza barare),
// valuta lo stato e sceglie la mossa migliore; finisce il turno quando nessuna mossa migliora la posizione.

import { applyAction } from "../apply";
import { CARDS_BY_ID } from "../data";
import { IllegalActionError } from "../errors";
import type { Action, GameState, MinionInstance, PlayerId } from "../state";
import type { Bot } from "./bot";

const WIN = 1_000_000;
/** Una mossa deve migliorare la valutazione almeno di tanto, altrimenti si passa. */
const MIN_GAIN = 0.01;

const WEIGHTS = {
  hero: 1, // ferie + armatura
  board: 1.4, // valore dei servitori
  hand: 0.6, // carte in mano
  weapon: 0.5, // attacco × durabilità
};

function minionValue(m: MinionInstance): number {
  let v = m.attack + m.health;
  if (m.keywords.includes("burocrazia")) v += 1;
  if (m.keywords.includes("scudato")) v += m.attack;
  if (m.keywords.includes("mani_in_merda")) v += 2;
  if (m.keywords.includes("smart_working")) v += 1;
  if (m.frozenTurns > 0) v -= m.attack * 0.5;
  return v;
}

/** Valutazione dello stato dal punto di vista di `me`: più alto = meglio. */
export function evaluate(state: GameState, me: PlayerId): number {
  const foe: PlayerId = me === "p1" ? "p2" : "p1";
  if (state.phase === "ended") {
    if (state.result?.winner === me) return WIN;
    if (state.result?.winner === foe) return -WIN;
    return 0;
  }
  const side = (p: PlayerId) => {
    const ps = state.players[p];
    const hero = Math.max(0, ps.hero.health) + ps.hero.armor;
    const board = ps.board.filter((m) => m.health > 0).reduce((s, m) => s + minionValue(m), 0);
    const weapon = ps.weapon ? ps.weapon.attack * ps.weapon.durability : 0;
    return WEIGHTS.hero * hero + WEIGHTS.board * board + WEIGHTS.hand * ps.hand.length + WEIGHTS.weapon * weapon;
  };
  return side(me) - side(foe);
}

/** Mulligan: tiene le carte economiche (≤ 3), rimette le altre. */
function mulliganChoice(state: GameState, me: PlayerId): number[] {
  return state.players[me].hand.filter((c) => (CARDS_BY_ID.get(c.cardId)?.cost ?? 0) > 3).map((c) => c.instanceId);
}

export const greedyBot: Bot = {
  name: "greedy",
  choose(view, me, legal, rng) {
    if (legal.some((a) => a.type === "mulligan")) {
      const replace = mulliganChoice(view, me).sort((a, b) => a - b);
      const wanted = legal.find((a) => a.type === "mulligan" && JSON.stringify(a.replace) === JSON.stringify(replace));
      return { action: wanted ?? legal.find((a) => a.type === "mulligan")!, rng };
    }

    const chooses = legal.filter((a): a is Extract<Action, { type: "choose" }> => a.type === "choose");
    if (chooses.length > 0) {
      // Scopri: la carta più costosa tra quelle offerte.
      const options = view.pendingChoice!.options;
      const cost = (i: number) => CARDS_BY_ID.get(options[i]!)?.cost ?? 0;
      const best = chooses.reduce((a, b) => (cost(b.index) > cost(a.index) ? b : a));
      return { action: best, rng };
    }

    const baseline = evaluate(view, me);
    let best: Action | null = null;
    let bestScore = baseline + MIN_GAIN;
    for (const action of legal) {
      if (action.type === "concede" || action.type === "end_turn") continue;
      let next: GameState;
      try {
        next = applyAction(view, action).state;
      } catch (e) {
        // Solo le azioni rifiutate si scartano; ogni altro errore è un bug dell'engine e deve emergere.
        if (e instanceof IllegalActionError) continue;
        throw e;
      }
      const score = evaluate(next, me);
      if (score > bestScore) {
        bestScore = score;
        best = action;
      }
    }
    const endTurn = legal.find((a) => a.type === "end_turn");
    return { action: best ?? endTurn ?? legal[0]!, rng };
  },
};
