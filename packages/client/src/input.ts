// Adattatore puro (T4.2): gesti del giocatore → Action, usando solo le mosse legali dell'engine.
// Macchina a stati: un gesto può inviare un'azione, scegliere qualcosa da completare, o annullare.
// Le scene Phaser traducono clic e trascinamenti in `Click` e disegnano le `Highlights`.

import type { Action, CharacterRef, PlayerId } from "@dottorscudo/engine";

export type Selection =
  | { kind: "none" }
  /** Carta in mano scelta; `position` già fissata per i servitori con bersaglio. */
  | { kind: "card"; card: number; position?: number }
  | { kind: "attacker"; attacker: CharacterRef }
  | { kind: "power"; option?: number }
  | { kind: "mulligan"; replace: number[] };

export const NONE: Selection = { kind: "none" };

export type Click =
  | { on: "hand"; instanceId: number }
  | { on: "minion"; instanceId: number }
  | { on: "hero"; player: PlayerId }
  /** Spazio tra i servitori della propria scrivania (0 = sinistra). */
  | { on: "slot"; position: number }
  | { on: "power"; option?: number }
  | { on: "end_turn" }
  | { on: "choose"; index: number }
  | { on: "mulligan_toggle"; instanceId: number }
  | { on: "mulligan_confirm" }
  | { on: "cancel" };

export interface Highlights {
  hand: Set<number>;
  minions: Set<number>;
  heroes: Set<PlayerId>;
  slots: number[];
  power: boolean;
  endTurn: boolean;
}

export interface Outcome {
  selection: Selection;
  /** Azione da inviare al server, se il gesto ne completa una. */
  send?: Action;
  highlights: Highlights;
}

type PlayCard = Extract<Action, { type: "play_card" }>;
type Attack = Extract<Action, { type: "attack" }>;
type HeroPower = Extract<Action, { type: "hero_power" }>;

const sameRef = (a: CharacterRef | undefined, b: CharacterRef) =>
  !!a && (a.kind === "hero" ? b.kind === "hero" && a.player === b.player : b.kind === "minion" && a.instanceId === b.instanceId);

const refOfClick = (c: Click): CharacterRef | null =>
  c.on === "minion" ? { kind: "minion", instanceId: c.instanceId } : c.on === "hero" ? { kind: "hero", player: c.player } : null;

const plays = (legal: readonly Action[], card: number) => legal.filter((a): a is PlayCard => a.type === "play_card" && a.card === card);
const powers = (legal: readonly Action[], option?: number) =>
  legal.filter((a): a is HeroPower => a.type === "hero_power" && (option === undefined || a.option === option));

function emptyHighlights(): Highlights {
  return { hand: new Set(), minions: new Set(), heroes: new Set(), slots: [], power: false, endTurn: false };
}

function markTargets(h: Highlights, targets: (CharacterRef | undefined)[]): Highlights {
  for (const t of targets) {
    if (!t) continue;
    if (t.kind === "minion") h.minions.add(t.instanceId);
    else h.heroes.add(t.player);
  }
  return h;
}

/** Cosa evidenziare per la selezione corrente. */
export function highlightsFor(legal: readonly Action[], sel: Selection): Highlights {
  const h = emptyHighlights();
  switch (sel.kind) {
    case "none":
      for (const a of legal) {
        if (a.type === "play_card") h.hand.add(a.card);
        if (a.type === "attack") {
          if (a.attacker.kind === "minion") h.minions.add(a.attacker.instanceId);
          else h.heroes.add(a.attacker.player);
        }
        if (a.type === "hero_power") h.power = true;
        if (a.type === "end_turn") h.endTurn = true;
      }
      return h;
    case "card": {
      const candidates = plays(legal, sel.card).filter((a) => sel.position === undefined || a.position === sel.position);
      h.hand.add(sel.card);
      if (sel.position === undefined && candidates.some((a) => a.position !== undefined)) {
        h.slots = [...new Set(candidates.map((a) => a.position!))].sort((a, b) => a - b);
        return h;
      }
      return markTargets(h, candidates.map((a) => a.target));
    }
    case "attacker":
      return markTargets(
        h,
        legal.filter((a): a is Attack => a.type === "attack" && sameRef(a.attacker, sel.attacker)).map((a) => a.defender),
      );
    case "power":
      h.power = true;
      return markTargets(h, powers(legal, sel.option).map((a) => a.target));
    case "mulligan":
      for (const id of sel.replace) h.hand.add(id);
      return h;
  }
}

function outcome(legal: readonly Action[], selection: Selection, send?: Action): Outcome {
  const next = send ? NONE : selection;
  return { selection: next, ...(send ? { send } : {}), highlights: highlightsFor(legal, next) };
}

/** Se c'è una sola azione tra i candidati, e non serve altro, la restituisce. */
const single = <A extends Action>(candidates: A[]): A | undefined => (candidates.length === 1 ? candidates[0] : undefined);

export function click(legal: readonly Action[], sel: Selection, c: Click): Outcome {
  if (c.on === "cancel") return outcome(legal, NONE);

  // Gesti che non dipendono dalla selezione.
  if (c.on === "end_turn") {
    const a = legal.find((x) => x.type === "end_turn");
    return outcome(legal, NONE, a);
  }
  if (c.on === "choose") {
    const a = legal.find((x) => x.type === "choose" && x.index === c.index);
    return outcome(legal, NONE, a);
  }
  if (c.on === "mulligan_toggle") {
    const replace = sel.kind === "mulligan" ? sel.replace : [];
    const next = replace.includes(c.instanceId) ? replace.filter((id) => id !== c.instanceId) : [...replace, c.instanceId];
    return outcome(legal, { kind: "mulligan", replace: next });
  }
  if (c.on === "mulligan_confirm") {
    const wanted = [...(sel.kind === "mulligan" ? sel.replace : [])].sort((a, b) => a - b).join(",");
    const a = legal.find((x) => x.type === "mulligan" && [...x.replace].sort((p, q) => p - q).join(",") === wanted);
    return outcome(legal, NONE, a);
  }

  switch (sel.kind) {
    case "card": {
      const candidates = plays(legal, sel.card).filter((a) => sel.position === undefined || a.position === sel.position);
      if (c.on === "slot" && sel.position === undefined) {
        const atSlot = candidates.filter((a) => a.position === c.position);
        if (atSlot.length === 0) return outcome(legal, NONE);
        const done = single(atSlot.filter((a) => !a.target));
        if (done && atSlot.length === 1) return outcome(legal, NONE, done);
        return outcome(legal, { kind: "card", card: sel.card, position: c.position });
      }
      const ref = refOfClick(c);
      const hit = ref ? candidates.find((a) => sameRef(a.target, ref)) : undefined;
      if (hit) return outcome(legal, NONE, hit);
      break;
    }
    case "attacker": {
      const ref = refOfClick(c);
      const hit = ref ? legal.find((a): a is Attack => a.type === "attack" && sameRef(a.attacker, sel.attacker) && sameRef(a.defender, ref)) : undefined;
      if (hit) return outcome(legal, NONE, hit);
      break;
    }
    case "power": {
      const ref = refOfClick(c);
      const hit = ref ? powers(legal, sel.option).find((a) => sameRef(a.target, ref)) : undefined;
      if (hit) return outcome(legal, NONE, hit);
      break;
    }
    default:
      break;
  }

  // Nuova selezione a partire da questo gesto.
  if (c.on === "hand") {
    const candidates = plays(legal, c.instanceId);
    if (candidates.length === 0) return outcome(legal, NONE);
    const done = single(candidates);
    if (done && done.position === undefined && !done.target) return outcome(legal, NONE, done);
    return outcome(legal, { kind: "card", card: c.instanceId });
  }
  if (c.on === "minion" || c.on === "hero") {
    const attacker = refOfClick(c)!;
    if (legal.some((a) => a.type === "attack" && sameRef(a.attacker, attacker))) return outcome(legal, { kind: "attacker", attacker });
    return outcome(legal, NONE);
  }
  if (c.on === "power") {
    const candidates = powers(legal, c.option);
    if (candidates.length === 0) return outcome(legal, NONE);
    const done = single(candidates);
    if (done && !done.target) return outcome(legal, NONE, done);
    return outcome(legal, { kind: "power", ...(c.option === undefined ? {} : { option: c.option }) });
  }
  return outcome(legal, NONE);
}
