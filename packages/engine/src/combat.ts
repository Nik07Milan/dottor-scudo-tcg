// Combattimento (T1.8, T1.10; GDD §1.3–1.4, §3.1): chi può attaccare chi e la risoluzione di un attacco.

import { opponentOf, type Ctx } from "./context";
import { damageHero, damageMinion, findMinion, loseKeyword } from "./damage";
import { deathPhase } from "./deaths";
import type { CharacterRef, GameState, MinionInstance, PlayerId } from "./state";

const MINION_ATTACKS_PER_TURN = 1;
const HERO_ATTACKS_PER_TURN = 1; // Tatine-mobile lo porta a 2: T1.13

/** Attacco attuale dell'eroe: oggi solo dallo Strumento. */
export function heroAttack(state: GameState, player: PlayerId): number {
  return state.players[player].weapon?.attack ?? 0;
}

/** Appena entrato senza Urgente non attacca; con Urgente attacca, ma solo servitori. */
export function minionCanAttack(m: MinionInstance): boolean {
  if (m.attack <= 0 || m.attacksThisTurn >= MINION_ATTACKS_PER_TURN) return false;
  if (m.frozenTurns > 0) return false; // Bloccato in riunione
  return !m.summonedThisTurn || m.keywords.includes("urgente");
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

/** Attaccanti possibili di `player`, nell'ordine della scrivania (eroe per ultimo). */
export function attackersOf(state: GameState, player: PlayerId): CharacterRef[] {
  const refs: CharacterRef[] = state.players[player].board
    .filter(minionCanAttack)
    .map((m) => ({ kind: "minion", instanceId: m.instanceId }));
  if (heroCanAttack(state, player)) refs.push({ kind: "hero", player });
  return refs;
}

const isStealthy = (m: MinionInstance) => m.keywords.includes("smart_working");

/**
 * Bersagli che `attacker` di `player` può attaccare ora:
 * - mai i servitori in Smart working;
 * - se il nemico ha Burocrazia bersagliabili, solo quelli;
 * - un servitore entrato in questo turno con Urgente non attacca l'eroe.
 */
export function attackTargetsOf(state: GameState, player: PlayerId, attacker: CharacterRef): CharacterRef[] {
  const foe = opponentOf(player);
  const visible = state.players[foe].board.filter((m) => !isStealthy(m));
  const taunts = visible.filter((m) => m.keywords.includes("burocrazia"));
  const minionRefs = (taunts.length > 0 ? taunts : visible).map((m): CharacterRef => ({ kind: "minion", instanceId: m.instanceId }));
  if (taunts.length > 0) return minionRefs;
  const rushOnly = attacker.kind === "minion" && !!findMinion(state, attacker.instanceId)?.minion.summonedThisTurn;
  return rushOnly ? minionRefs : [...minionRefs, { kind: "hero", player: foe }];
}

/** C'è una Burocrazia bersagliabile che `player` deve attaccare per prima. */
export function tauntBlocks(state: GameState, player: PlayerId): boolean {
  return state.players[opponentOf(player)].board.some((m) => m.keywords.includes("burocrazia") && !isStealthy(m));
}

/** Risolve un attacco già validato: danni reciproci contemporanei, durabilità, fase morti. */
export function performAttack(ctx: Ctx, player: PlayerId, attacker: CharacterRef, defender: CharacterRef): void {
  const { state } = ctx;
  ctx.events.push({ type: "attack", attacker, defender });

  const attackerMinion = attacker.kind === "minion" ? findMinion(state, attacker.instanceId)!.minion : null;
  const defenderMinion = defender.kind === "minion" ? findMinion(state, defender.instanceId)!.minion : null;
  // Chi attacca esce dallo Smart working.
  if (attackerMinion) loseKeyword(ctx, attackerMinion, "smart_working");

  const attackValue = attackerMinion ? attackerMinion.attack : heroAttack(state, player);
  // Un eroe che difende non restituisce danni.
  const counterValue = defenderMinion ? defenderMinion.attack : 0;

  // Contemporanei: i valori sono letti prima di applicare qualunque danno.
  if (defenderMinion) damageMinion(ctx, defenderMinion, attackValue, attackerMinion ?? undefined);
  else damageHero(ctx, (defender as { player: PlayerId }).player, attackValue);
  if (attackerMinion) damageMinion(ctx, attackerMinion, counterValue, defenderMinion ?? undefined);
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
