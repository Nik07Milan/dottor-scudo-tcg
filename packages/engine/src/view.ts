// Viste filtrate (T1.18, CLAUDE.md principio 5): cosa può vedere un giocatore. Mai inviare lo stato completo.
// Segreti: mano avversaria, ordine e contenuto dei mazzi (anche il proprio), seed dell'RNG,
// opzioni di Scopri dell'avversario. Tutto il resto è pubblico.

import type { CardInstance, GameEvent, GameState, PlayerId } from "./state";

/** Id carta che sostituisce le carte nascoste. Non esiste in cards.json. */
export const HIDDEN_CARD = "hidden";

/** Stato visto da `viewer`: stessa forma di GameState, così il client può usare getLegalActions su di essa. */
export type PlayerView = GameState & { viewer: PlayerId };

const hiddenCard = (instanceId: number): CardInstance => ({ instanceId, cardId: HIDDEN_CARD, costModifier: 0 });

export function getPlayerView(state: GameState, viewer: PlayerId): PlayerView {
  const view = structuredClone(state) as PlayerView;
  view.viewer = viewer;
  view.rng = 0;
  for (const p of ["p1", "p2"] as const) {
    const ps = view.players[p];
    // Mazzi: solo il numero di carte (l'ordine del proprio mazzo è segreto come il resto).
    ps.deck = ps.deck.map(() => hiddenCard(0));
    // Mano avversaria: l'id resta (serve a collegare gli eventi), la carta no.
    if (p !== viewer) ps.hand = ps.hand.map((c) => hiddenCard(c.instanceId));
  }
  if (view.pendingChoice && view.pendingChoice.player !== viewer) {
    view.pendingChoice = { ...view.pendingChoice, options: view.pendingChoice.options.map(() => HIDDEN_CARD) };
  }
  return view;
}

/** Eventi visti da `viewer`: pescate, carte generate e Scopri dell'avversario sono nascosti. */
export function getEventsView(events: readonly GameEvent[], viewer: PlayerId): GameEvent[] {
  return events.map((e): GameEvent => {
    if (!("player" in e) || e.player === viewer) return e;
    switch (e.type) {
      case "card_drawn":
      case "card_added":
      case "card_chosen":
        return { ...e, cardId: HIDDEN_CARD };
      case "discover_offered":
        return { ...e, options: e.options.map(() => HIDDEN_CARD) };
      default:
        return e;
    }
  });
}
