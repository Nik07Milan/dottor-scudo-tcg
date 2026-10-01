import { describe, expect, it } from "vitest";
import { createGame, type GameSetup } from "../src/game";
import * as rules from "../src/rules";
import type { GameState, PlayerId } from "../src/state";
import { countIds, testDeck } from "./helpers";

const setup = (seed: number): GameSetup => ({
  seed,
  players: [
    { heroId: "dottor-scudo", deck: testDeck("dottor-scudo") },
    { heroId: "dr-grappolo", deck: testDeck("dr-grappolo") },
  ],
});

const other = (p: PlayerId): PlayerId => (p === "p1" ? "p2" : "p1");
const handIds = (s: GameState, p: PlayerId) => s.players[p].hand.map((c) => c.cardId);

describe("createGame", () => {
  it("stesso seed → stessa partita", () => {
    expect(createGame(setup(42))).toEqual(createGame(setup(42)));
  });

  it("seed diverso → mani diverse", () => {
    const a = createGame(setup(1)).state;
    const b = createGame(setup(2)).state;
    expect([handIds(a, "p1"), handIds(a, "p2")]).not.toEqual([handIds(b, "p1"), handIds(b, "p2")]);
  });

  it("il primo giocatore è scelto con l'RNG: su molti seed escono entrambi", () => {
    const firsts = new Set(Array.from({ length: 40 }, (_, seed) => createGame(setup(seed)).state.firstPlayer));
    expect(firsts).toEqual(new Set(["p1", "p2"]));
  });

  it("parte in fase mulligan, turno 0, con il primo giocatore attivo", () => {
    const { state } = createGame(setup(7));
    expect(state.phase).toBe("mulligan");
    expect(state.turn).toBe(0);
    expect(state.activePlayer).toBe(state.firstPlayer);
    expect(state.pendingChoice).toBeNull();
    expect(state.result).toBeNull();
  });

  it("mano iniziale 3 carte al primo e 4 al secondo, senza Caffettino prima del mulligan", () => {
    const { state } = createGame(setup(7));
    const first = state.firstPlayer;
    const second = other(first);
    expect(state.players[first].hand).toHaveLength(rules.STARTING_HAND_FIRST);
    expect(state.players[second].hand).toHaveLength(rules.STARTING_HAND_SECOND);
    expect(state.players[first].deck).toHaveLength(rules.DECK_SIZE - rules.STARTING_HAND_FIRST);
    expect(state.players[second].deck).toHaveLength(rules.DECK_SIZE - rules.STARTING_HAND_SECOND);
    for (const p of ["p1", "p2"] as const) expect(handIds(state, p)).not.toContain(rules.COIN_CARD_ID);
  });

  it("mano + mazzo contengono esattamente le carte del mazzo scelto", () => {
    const s = setup(11);
    const { state } = createGame(s);
    s.players.forEach((p, i) => {
      const ps = state.players[i === 0 ? "p1" : "p2"];
      expect(countIds([...ps.hand, ...ps.deck].map((c) => c.cardId))).toEqual(countIds(p.deck));
    });
  });

  it("il mazzo viene mescolato", () => {
    const s = setup(3);
    const { state } = createGame(s);
    const p1 = state.players.p1;
    expect([...p1.hand, ...p1.deck].map((c) => c.cardId)).not.toEqual(s.players[0].deck);
  });

  it("gli instanceId sono unici, seguono l'ordine del mazzo mescolato e nextInstanceId è libero", () => {
    const { state } = createGame(setup(5));
    const ids = (["p1", "p2"] as const).flatMap((p) => [...state.players[p].hand, ...state.players[p].deck]).map((c) => c.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(state.nextInstanceId).toBeGreaterThan(Math.max(...ids));
    // Gli id dipendono dalla posizione dopo la mescolata, non dalla lista inviata: non rivelano la carta.
    for (const p of ["p1", "p2"] as const) {
      const order = [...state.players[p].hand, ...state.players[p].deck].map((c) => c.instanceId);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    }
  });

  it("eroi a 30 ferie, nessuna armatura, caffettini a 0, campo e zone vuote", () => {
    const { state } = createGame(setup(9));
    for (const p of ["p1", "p2"] as const) {
      const ps = state.players[p];
      expect(ps.id).toBe(p);
      expect(ps.hero).toEqual({
        heroId: p === "p1" ? "dottor-scudo" : "dr-grappolo",
        health: rules.HERO_MAX_HEALTH,
        maxHealth: rules.HERO_MAX_HEALTH,
        armor: 0,
        attacksThisTurn: 0,
        heroPowerUsed: false,
      });
      expect(ps.mana).toEqual({ max: 0, available: 0 });
      expect(ps).toMatchObject({ weapon: null, board: [], graveyard: [], played: [], task: null, costModifiers: [], fatigue: 0, mulliganDone: false });
      for (const c of ps.hand) expect(c.costModifier).toBe(0);
    }
  });

  it("lo stato dell'RNG avanza rispetto al seed iniziale", () => {
    expect(createGame(setup(42)).state.rng).not.toBe(42);
  });

  it("emette game_started e un card_drawn per ogni carta della mano iniziale", () => {
    const { state, events } = createGame(setup(13));
    expect(events[0]).toEqual({ type: "game_started", firstPlayer: state.firstPlayer });
    const drawn = events.filter((e) => e.type === "card_drawn");
    expect(drawn).toHaveLength(rules.STARTING_HAND_FIRST + rules.STARTING_HAND_SECOND);
    // Pesca prima il primo giocatore.
    expect(drawn[0]).toMatchObject({ player: state.firstPlayer });
  });

  it("non modifica l'input", () => {
    const s = setup(21);
    const copy = structuredClone(s);
    createGame(s);
    expect(s).toEqual(copy);
  });

  it("rifiuta eroi e carte sconosciuti", () => {
    const s = setup(1);
    expect(() => createGame({ ...s, players: [{ ...s.players[0], heroId: "nessuno" }, s.players[1]] })).toThrow(/eroe/);
    expect(() =>
      createGame({ ...s, players: [{ ...s.players[0], deck: [...s.players[0].deck.slice(1), "carta-finta"] }, s.players[1]] }),
    ).toThrow(/carta-finta/);
  });
});
