// Invarianti dello stato (T2.4): regole che devono valere dopo ogni azione. Usati dal fuzz e utili al
// server in sviluppo. Restituisce l'elenco delle violazioni (vuoto = stato valido).

import { CARDS_BY_ID } from "./data";
import { DISCOVER_OPTIONS, HERO_MAX_HEALTH, MAX_BOARD, MAX_HAND, MAX_MANA, TURN_LIMIT } from "./rules";
import type { GameState } from "./state";

export function checkInvariants(state: GameState): string[] {
  const v: string[] = [];
  const seen = new Set<number>();
  const id = (n: number, where: string) => {
    if (n === 0) return; // segnaposto delle viste
    if (seen.has(n)) v.push(`id duplicato ${n} (${where})`);
    seen.add(n);
    if (n >= state.nextInstanceId) v.push(`id ${n} non ancora assegnato (${where})`);
  };

  for (const p of ["p1", "p2"] as const) {
    const ps = state.players[p];
    if (ps.board.length > MAX_BOARD) v.push(`${p}: ${ps.board.length} servitori sulla scrivania`);
    if (ps.hand.length > MAX_HAND) v.push(`${p}: ${ps.hand.length} carte in mano`);
    if (ps.mana.max < 0 || ps.mana.max > MAX_MANA || ps.mana.available < 0 || ps.mana.available > MAX_MANA) {
      v.push(`${p}: caffettini fuori limite (${ps.mana.available}/${ps.mana.max})`);
    }
    if (ps.hero.health > ps.hero.maxHealth || ps.hero.maxHealth !== HERO_MAX_HEALTH) v.push(`${p}: ferie ${ps.hero.health}/${ps.hero.maxHealth}`);
    if (ps.hero.armor < 0) v.push(`${p}: armatura negativa`);
    if (ps.fatigue < 0) v.push(`${p}: burnout negativo`);
    if (ps.weapon && ps.weapon.durability <= 0) v.push(`${p}: Strumento a durabilità ${ps.weapon.durability}`);
    if (ps.task && (ps.task.progress >= ps.task.goal || ps.task.progress < 0)) v.push(`${p}: Task ${ps.task.cardId} a ${ps.task.progress}/${ps.task.goal}`);

    for (const c of ps.hand) id(c.instanceId, `${p} mano`);
    for (const c of ps.deck) id(c.instanceId, `${p} mazzo`);
    if (ps.weapon) id(ps.weapon.instanceId, `${p} Strumento`);
    for (const m of ps.board) {
      id(m.instanceId, `${p} scrivania`);
      if (!CARDS_BY_ID.has(m.cardId)) v.push(`${p}: servitore sconosciuto ${m.cardId}`);
      if (m.health <= 0) v.push(`${p}: ${m.cardId} in campo con vita ${m.health}`);
      if (m.health > m.maxHealth) v.push(`${p}: ${m.cardId} vita ${m.health} > massimo ${m.maxHealth}`);
      if (m.attack < 0) v.push(`${p}: ${m.cardId} attacco negativo`);
      if (m.frozenTurns < 0) v.push(`${p}: ${m.cardId} blocco negativo`);
      if (new Set(m.keywords).size !== m.keywords.length) v.push(`${p}: ${m.cardId} keyword ripetute`);
    }
  }

  if ((state.phase === "ended") !== (state.result !== null)) v.push(`fase ${state.phase} con risultato ${JSON.stringify(state.result)}`);
  if (state.turn > TURN_LIMIT) v.push(`turno ${state.turn} oltre il limite`);
  if (state.pendingChoice) {
    if (state.phase !== "main") v.push(`scelta in sospeso nella fase ${state.phase}`);
    if (state.pendingChoice.options.length === 0 || state.pendingChoice.options.length > DISCOVER_OPTIONS) v.push(`scelta con ${state.pendingChoice.options.length} opzioni`);
  }
  return v;
}
