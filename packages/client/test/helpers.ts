// Stati di prova per gli adattatori del client: partite vere dell'engine, viste filtrate.
import { applyAction, createGame, deckCards, getLegalActions, getPlayerView, type GameState, type PlayerId, type PlayerView } from "@dottorscudo/engine";

export function startedState(seed = 3): GameState {
  let { state } = createGame({
    seed,
    players: [
      { heroId: "jackson", deck: deckCards("jackson") },
      { heroId: "il-calabrone", deck: deckCards("il-calabrone") },
    ],
  });
  state = applyAction(state, { type: "mulligan", player: "p1", replace: [] }).state;
  state = applyAction(state, { type: "mulligan", player: "p2", replace: [] }).state;
  return state;
}

export const viewFor = (state: GameState, p: PlayerId): PlayerView => getPlayerView(state, p);
export const legalFor = (state: GameState, p: PlayerId) => getLegalActions(getPlayerView(state, p), p);

/** Dà al giocatore attivo una mano precisa e tanti caffettini. */
export function withHand(state: GameState, cardIds: string[], mana = 10): { state: GameState; ids: number[] } {
  const s = structuredClone(state);
  const me = s.activePlayer;
  s.players[me].hand = cardIds.map((cardId) => ({ instanceId: s.nextInstanceId++, cardId, costModifier: 0 }));
  s.players[me].mana = { max: mana, available: mana };
  return { state: s, ids: s.players[me].hand.map((c) => c.instanceId) };
}

export function addMinion(state: GameState, player: PlayerId, cardId = "il-crudo", fields: object = {}) {
  const m = {
    instanceId: state.nextInstanceId++,
    cardId,
    owner: player,
    attack: 3,
    health: 4,
    maxHealth: 4,
    keywords: [],
    frozenTurns: 0,
    frozenOnTurn: null,
    attacksThisTurn: 0,
    summonedThisTurn: false,
    ...fields,
  };
  state.players[player].board.push(m as GameState["players"]["p1"]["board"][number]);
  return m;
}
