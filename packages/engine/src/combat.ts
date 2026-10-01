// Combattimento (T1.8, GDD §1.3–1.4): chi può attaccare chi e la risoluzione di un attacco.
// Keyword (Burocrazia, Urgente, Smart working, Bloccato, Scudato, Mani in merda): T1.10.

import { opponentOf, type Ctx } from "./context";
import { damageHero, damageMinion, findMinion } from "./damage";
import { deathPhase } from "./deaths";
import type { CharacterRef, GameState, MinionInstance, PlayerId } from "./state";

const MINION_ATTACKS_PER_TURN = 1;
const HERO_ATTACKS_PER_TURN = 1; // Tatine-mobile lo porta a 2: T1.13

/** Attacco attuale dell'eroe: oggi solo dallo Strumento. */
export function heroAttack(state: GameState, player: PlayerId): number {
  return state.players[player].weapon?.attack ?? 0;
}

export function minionCanAttack(m: MinionInstance): boolean {
  return m.attack > 0 && m.attacksThisTurn < MINION_ATTACKS_PER_TURN && !m.summonedThisTurn;
}

export function heroCanAttack(state: GameState, player: PlayerId): boolean {
  return heroAttack(state, player) > 0 && state.players[player].hero.attacksThisTurn < HERO_ATTACKS_PER_TURN;
}

/** Il personaggio esiste ed è controllato da `player`. */
export function controls(state: GameState, player: PlayerId, ref: CharacterRef): boolean {
  if (ref.kind === "hero") return ref.player === player;
  return findMinion(state, ref.instanceId)?.player === player;
}

export function canAttackNow(state: GameState, player: PlayerId, attacker: CharacterRef): boolean {
  if (attacker.kind === "hero") return heroCanAttack(state, player);
  const loc = findMinion(state, attacker.instanceId);
  return !!loc && minionCanAttack(loc.minion);
}

/** Attaccanti possibili e bersagli possibili di `player`, nell'ordine della scrivania (eroe per ultimo). */
export function attackersOf(state: GameState, player: PlayerId): CharacterRef[] {
  const refs: CharacterRef[] = state.players[player].board
    .filter(minionCanAttack)
    .map((m) => ({ kind: "minion", instanceId: m.instanceId }));
  if (heroCanAttack(state, player)) refs.push({ kind: "hero", player });
  return refs;
}

export function attackTargetsOf(state: GameState, player: PlayerId): CharacterRef[] {
  const foe = opponentOf(player);
  return [...state.players[foe].board.map((m): CharacterRef => ({ kind: "minion", instanceId: m.instanceId })), { kind: "hero", player: foe }];
}

/** Risolve un attacco già validato: danni reciproci contemporanei, durabilità, fase morti. */
export function performAttack(ctx: Ctx, player: PlayerId, attacker: CharacterRef, defender: CharacterRef): void {
  const { state } = ctx;
  ctx.events.push({ type: "attack", attacker, defender });

  const attackerMinion = attacker.kind === "minion" ? findMinion(state, attacker.instanceId)!.minion : null;
  const defenderMinion = defender.kind === "minion" ? findMinion(state, defender.instanceId)!.minion : null;
  const attackValue = attackerMinion ? attackerMinion.attack : heroAttack(state, player);
  // Un eroe che difende non restituisce danni.
  const counterValue = defenderMinion ? defenderMinion.attack : 0;

  // Contemporanei: i valori sono letti prima di applicare qualunque danno.
  if (defenderMinion) damageMinion(ctx, defenderMinion, attackValue);
  else damageHero(ctx, (defender as { player: PlayerId }).player, attackValue);
  if (attackerMinion) damageMinion(ctx, attackerMinion, counterValue);
  else damageHero(ctx, player, counterValue);

  if (attackerMinion) {
    attackerMinion.attacksThisTurn += 1;
  } else {
    const ps = state.players[player];
    ps.hero.attacksThisTurn += 1;
    const weapon = ps.weapon!;
    weapon.durability -= 1;
    if (weapon.durability <= 0) {
      ps.weapon = null;
      ctx.events.push({ type: "weapon_destroyed", player, cardId: weapon.cardId });
    }
  }

  deathPhase(ctx);
}
