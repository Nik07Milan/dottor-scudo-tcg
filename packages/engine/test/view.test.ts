import { describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import { createGame } from "../src/game";
import { actionKey, getLegalActions } from "../src/legal";
import { nextRandom } from "../src/rng";
import type { GameEvent, GameState } from "../src/state";
import { HIDDEN_CARD, getEventsView, getPlayerView } from "../src/view";
import { other, setupFor, startedGame, withHand } from "./helpers";

const PLAYERS = ["p1", "p2"] as const;

/** Stato con carte segrete riconoscibili: mano avversaria e mazzi con id che non compaiono altrove. */
function secretState() {
  const s0 = startedGame();
  const me = s0.activePlayer;
  const foe = other(me);
  const { state } = withHand(s0, foe, ["klaudioken", "retcon"]);
  state.players[foe].deck = state.players[foe].deck.map((c) => ({ ...c, cardId: "sociozilla" }));
  state.players[me].deck = state.players[me].deck.map((c) => ({ ...c, cardId: "il-grappolaccio" }));
  return { state, me, foe };
}

describe("getPlayerView", () => {
  it("la mano avversaria resta un conteggio: le carte sono nascoste", () => {
    const { state, me, foe } = secretState();
    const view = getPlayerView(state, me);
    expect(view.viewer).toBe(me);
    expect(view.players[foe].hand).toHaveLength(2);
    expect(view.players[foe].hand.every((c) => c.cardId === HIDDEN_CARD && c.costModifier === 0)).toBe(true);
    expect(view.players[me].hand).toEqual(state.players[me].hand);
  });

  it("entrambi i mazzi sono solo conteggi, anche il proprio (l'ordine è segreto)", () => {
    const { state, me, foe } = secretState();
    const view = getPlayerView(state, me);
    for (const p of [me, foe]) {
      expect(view.players[p].deck).toHaveLength(state.players[p].deck.length);
      expect(view.players[p].deck.every((c) => c.cardId === HIDDEN_CARD && c.instanceId === 0)).toBe(true);
    }
  });

  it("il seed dell'RNG non esce", () => {
    const { state, me } = secretState();
    expect(getPlayerView(state, me).rng).toBe(0);
  });

  it("nessun dato segreto compare nella vista serializzata", () => {
    const { state, me } = secretState();
    const json = JSON.stringify(getPlayerView(state, me));
    for (const secret of ["klaudioken", "retcon", "sociozilla", "il-grappolaccio"]) expect(json).not.toContain(secret);
    expect(json).not.toContain(String(state.rng));
  });

  it("le opzioni di Scopri sono nascoste all'avversario, visibili a chi sceglie", () => {
    const { state, me, foe } = secretState();
    state.pendingChoice = { kind: "discover", player: me, options: ["klaudioken", "retcon", "le-task"] };
    expect(getPlayerView(state, me).pendingChoice?.options).toEqual(["klaudioken", "retcon", "le-task"]);
    expect(getPlayerView(state, foe).pendingChoice).toEqual({ kind: "discover", player: me, options: [HIDDEN_CARD, HIDDEN_CARD, HIDDEN_CARD] });
  });

  it("le informazioni pubbliche restano uguali", () => {
    const { state, me, foe } = secretState();
    const view = getPlayerView(state, me);
    for (const p of [me, foe]) {
      const { hand: _h, deck: _d, ...publicPart } = state.players[p];
      const { hand: _vh, deck: _vd, ...viewPart } = view.players[p];
      expect(viewPart).toEqual(publicPart);
    }
    expect(view.turn).toBe(state.turn);
    expect(view.activePlayer).toBe(state.activePlayer);
  });

  it("getLegalActions sulla vista per l'avversario non va in crash sulle carte nascoste", () => {
    const { state, foe } = secretState();
    expect(() => getLegalActions(getPlayerView(state, "p1" === foe ? "p2" : "p1"), foe)).not.toThrow();
  });

  it("non modifica lo stato", () => {
    const { state, me } = secretState();
    const copy = structuredClone(state);
    getPlayerView(state, me);
    expect(state).toEqual(copy);
  });

  it("chi guarda vede sulla propria vista le stesse mosse legali dello stato vero", () => {
    let state: GameState = createGame(setupFor(7)).state;
    let rng = 7;
    for (let step = 0; step < 60 && state.phase !== "ended"; step++) {
      for (const p of PLAYERS) {
        const real = getLegalActions(state, p).map(actionKey).sort();
        const fromView = getLegalActions(getPlayerView(state, p), p).map(actionKey).sort();
        expect(fromView).toEqual(real);
      }
      const legal = PLAYERS.flatMap((p) => getLegalActions(state, p)).filter((a) => a.type !== "concede");
      const r = nextRandom(rng);
      rng = r.seed;
      state = applyAction(state, legal[Math.floor(r.value * legal.length)]!).state;
    }
  });
});

describe("getEventsView", () => {
  const events: GameEvent[] = [
    { type: "card_drawn", player: "p1", instanceId: 10, cardId: "klaudioken" },
    { type: "card_drawn", player: "p2", instanceId: 11, cardId: "retcon" },
    { type: "card_added", player: "p2", instanceId: 12, cardId: "sasso" },
    { type: "discover_offered", player: "p2", options: ["le-task", "retcon", "klaudioken"] },
    { type: "card_chosen", player: "p2", cardId: "retcon" },
    { type: "card_burned", player: "p2", cardId: "sociozilla" },
    { type: "card_played", player: "p2", instanceId: 13, cardId: "chiamata-api" },
  ];

  it("nasconde all'avversario pescate, carte generate e Scopri; lascia il resto", () => {
    expect(getEventsView(events, "p1")).toEqual([
      { type: "card_drawn", player: "p1", instanceId: 10, cardId: "klaudioken" },
      { type: "card_drawn", player: "p2", instanceId: 11, cardId: HIDDEN_CARD },
      { type: "card_added", player: "p2", instanceId: 12, cardId: HIDDEN_CARD },
      { type: "discover_offered", player: "p2", options: [HIDDEN_CARD, HIDDEN_CARD, HIDDEN_CARD] },
      { type: "card_chosen", player: "p2", cardId: HIDDEN_CARD },
      { type: "card_burned", player: "p2", cardId: "sociozilla" },
      { type: "card_played", player: "p2", instanceId: 13, cardId: "chiamata-api" },
    ]);
  });

  it("chi possiede le carte le vede; quelle dell'altro restano nascoste", () => {
    expect(getEventsView(events, "p2")).toEqual([{ ...events[0]!, cardId: HIDDEN_CARD }, ...events.slice(1)]);
  });
});
