// Mulligan, ciclo di turno, caffettini, pesca, burnout e mano piena (T1.4, GDD §1.1, §1.2, §1.6).

import { newCard, newInstanceId, opponentOf, type Ctx } from "./context";
import { damageHero } from "./damage";
import { runBoardTrigger } from "./effects";
import { checkHeroes, finishGame } from "./outcome";
import { shuffle } from "./rng";
import { COIN_CARD_ID, MAX_HAND, MAX_MANA, TURN_LIMIT } from "./rules";
import type { CardInstance, InstanceId, PlayerId } from "./state";

/** Mulligan già validato da applyAction tramite getLegalActions. */
export function mulligan(ctx: Ctx, player: PlayerId, replace: readonly InstanceId[]): void {
  const { state } = ctx;
  const ps = state.players[player];

  // Prima si pescano le nuove (in cima al mazzo), poi le rimesse tornano nel mazzo e si rimescola:
  // così una carta appena rimessa non può tornare subito in mano.
  const kept = ps.hand.filter((c) => !replace.includes(c.instanceId));
  const returned = ps.hand.filter((c) => replace.includes(c.instanceId));
  const drawn = ps.deck.splice(0, returned.length);
  ps.hand = [...kept, ...drawn];
  for (const c of drawn) ctx.events.push({ type: "card_drawn", player, instanceId: c.instanceId, cardId: c.cardId });

  if (returned.length > 0) {
    // Cambio di zona = id nuovo.
    const back = returned.map((c): CardInstance => ({ instanceId: newInstanceId(ctx), cardId: c.cardId, costModifier: 0 }));
    const shuffled = shuffle(state.rng, [...ps.deck, ...back]);
    state.rng = shuffled.seed;
    ps.deck = shuffled.value;
  }

  ps.mulliganDone = true;
  ctx.events.unshift({ type: "mulligan_done", player, replaced: returned.length });

  if (state.players.p1.mulliganDone && state.players.p2.mulliganDone) {
    const second = opponentOf(state.firstPlayer);
    addToHand(ctx, second, newCard(ctx, COIN_CARD_ID));
    state.phase = "main";
    startTurn(ctx, state.firstPlayer);
  }
}

export function endTurn(ctx: Ctx, player: PlayerId): void {
  const { state } = ctx;
  const ps = state.players[player];
  runBoardTrigger(ctx, player, "end_of_turn");
  // Bloccato in riunione: scende a fine turno del controllore, non nel turno in cui è stato bloccato (GDD §3.1).
  for (const m of ps.board) {
    if (m.frozenTurns <= 0 || m.frozenOnTurn === state.turn) continue;
    m.frozenTurns -= 1;
    if (m.frozenTurns === 0) {
      m.frozenOnTurn = null;
      ctx.events.push({ type: "frozen", instanceId: m.instanceId, turns: 0 });
    }
  }
  ps.costModifiers = ps.costModifiers.filter((m) => !m.expiresEndOfTurn);
  ctx.events.push({ type: "turn_ended", player, turn: state.turn });
  if (state.turn >= TURN_LIMIT) {
    // Un eroe a 0 nell'ultimo turno conta più del pareggio per limite.
    if (!checkHeroes(ctx)) finishGame(ctx, { winner: null, reason: "turn_limit" });
    return;
  }
  startTurn(ctx, opponentOf(player));
}

export function startTurn(ctx: Ctx, player: PlayerId): void {
  const { state } = ctx;
  state.turn += 1;
  state.activePlayer = player;
  ctx.events.push({ type: "turn_started", player, turn: state.turn });

  const ps = state.players[player];
  ps.mana.max = Math.min(MAX_MANA, ps.mana.max + 1);
  // I caffettini temporanei non spesi si perdono: la ricarica riparte dal massimo.
  ps.mana.available = ps.mana.max;
  ctx.events.push({ type: "mana_changed", player, max: ps.mana.max, available: ps.mana.available });

  ps.hero.attacksThisTurn = 0;
  ps.hero.heroPowerUsed = false;
  for (const m of ps.board) {
    m.attacksThisTurn = 0;
    m.summonedThisTurn = false;
  }

  drawCard(ctx, player);
  runBoardTrigger(ctx, player, "start_of_turn");
}

/** Pesca 1 carta: burnout a mazzo vuoto, scarto a mano piena. */
export function drawCard(ctx: Ctx, player: PlayerId): CardInstance | null {
  const ps = ctx.state.players[player];
  const card = ps.deck.shift();
  if (!card) {
    ps.fatigue += 1;
    ctx.events.push({ type: "fatigue", player, damage: ps.fatigue });
    damageHero(ctx, player, ps.fatigue);
    return null;
  }
  return addToHand(ctx, player, card, "draw");
}

/** Aggiunge una carta alla mano; con la mano piena la carta è scartata e mostrata a entrambi. */
export function addToHand(ctx: Ctx, player: PlayerId, card: CardInstance, how: "draw" | "generate" = "generate"): CardInstance | null {
  const ps = ctx.state.players[player];
  if (ps.hand.length >= MAX_HAND) {
    ctx.events.push({ type: "card_burned", player, cardId: card.cardId });
    return null;
  }
  ps.hand.push(card);
  ctx.events.push({ type: how === "draw" ? "card_drawn" : "card_added", player, instanceId: card.instanceId, cardId: card.cardId });
  return card;
}
