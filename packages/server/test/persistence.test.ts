// T5.3: mazzi salvati e storico delle partite, con lo store in memoria.
import { deckCards, deckToCounts, getLegalActions, getPlayerView, greedyBot, replay, DATA_VERSION, type PlayerId } from "@dottorscudo/engine";
import { describe, expect, it } from "vitest";
import { GameSession, JoinError } from "../src/session";
import { MemoryStore, loadSeatDeck, type MatchRecord } from "../src/store";
import { fakeDeps } from "./fake";

/** Mazzo legale di Jackson diverso dal precostruito: stesse carte, ordine inverso. */
const customJackson = () => [...deckCards("jackson")].reverse();

function storeWithDeck() {
  const store = new MemoryStore();
  store.decks.set("d1", { owner: "u1", heroId: "jackson", cards: deckToCounts(customJackson()) });
  return store;
}

/** Fa giocare la partita ai bot passando dalla sessione, come farebbero i client. */
function playOut(session: GameSession, seats: Record<PlayerId, string>) {
  let rng = 7;
  for (let step = 0; step < 5000 && session.state!.phase !== "ended"; step++) {
    const state = session.state!;
    const player = (["p1", "p2"] as const).find((p) => getLegalActions(state, p).some((a) => a.type !== "concede"))!;
    const decision = greedyBot.choose(getPlayerView(state, player), player, getLegalActions(state, player), rng);
    rng = decision.rng;
    const { player: _ignored, ...action } = decision.action;
    session.handleAction(seats[player], action);
  }
  expect(session.state!.phase).toBe("ended");
}

function sessionWithRecords(random: number[] = []) {
  const records: MatchRecord[] = [];
  const f = fakeDeps(random);
  f.deps.onGameOver = (r) => records.push(JSON.parse(JSON.stringify(r)) as MatchRecord);
  return { session: new GameSession("ABCDEF", f.deps), records, ...f };
}

describe("mazzi salvati (T5.3)", () => {
  it("un mazzo valido viene usato al posto del precostruito", () => {
    const { session } = sessionWithRecords();
    session.join("host", "jackson", { userId: "u1", deck: customJackson() });
    session.join("guest", "milet");
    expect(session.setup!.players[0].deck).toEqual(customJackson());
    expect(session.setup!.players[1].deck).toEqual(deckCards("milet"));
  });

  it("un mazzo non valido rifiuta l'ingresso", () => {
    const { session } = sessionWithRecords();
    expect(() => session.join("host", "jackson", { deck: customJackson().slice(1) })).toThrow(/mazzo non valido/);
  });

  it("il mazzo si carica solo se è dell'utente, dell'eroe giusto e legale", async () => {
    const store = storeWithDeck();
    await expect(loadSeatDeck(store, "u1", "jackson", "d1")).resolves.toEqual(customJackson());
    await expect(loadSeatDeck(store, "u2", "jackson", "d1")).rejects.toThrow("mazzo non trovato");
    await expect(loadSeatDeck(store, "u1", "milet", "d1")).rejects.toThrow("altro eroe");
    await expect(loadSeatDeck(store, null, "jackson", "d1")).rejects.toThrow(JoinError);
    await expect(loadSeatDeck(null, "u1", "jackson", "d1")).rejects.toThrow(JoinError);
    store.decks.set("d2", { owner: "u1", heroId: "jackson", cards: { "piccione-urbano": 30 } });
    await expect(loadSeatDeck(store, "u1", "jackson", "d2")).rejects.toThrow(/mazzo non valido/);
  });
});

describe("storico e replay (T5.3)", () => {
  it("una partita salvata si rigioca identica", () => {
    const { session, records } = sessionWithRecords([0.123]);
    session.join("host", "jackson", { userId: "u1", deck: customJackson() });
    session.join("guest", "dr-grappolo", { userId: "u2" });
    playOut(session, { p1: "host", p2: "guest" });

    expect(records).toHaveLength(1);
    const saved = records[0]!;
    expect(saved.users).toEqual({ p1: "u1", p2: "u2" });
    expect(saved.dataVersion).toBe(DATA_VERSION);
    expect(saved.result).toEqual(session.state!.result);
    expect(saved.turns).toBe(session.state!.turn);
    // Il record è passato da JSON, come dal database: il replay arriva allo stesso identico stato.
    expect(replay(saved.setup, saved.actions).final).toEqual(session.state);
  });

  it("anche un abbandono finisce nello storico, una volta sola", () => {
    const { session, records } = sessionWithRecords();
    session.join("host", "jackson", { userId: "u1" });
    session.join("guest", "milet");
    session.abandon("guest");
    session.abandon("guest");
    expect(records).toHaveLength(1);
    expect(records[0]!.result.reason).toBe("concede");
    expect(records[0]!.users).toEqual({ p1: "u1", p2: null });
    expect(replay(records[0]!.setup, records[0]!.actions).final.result).toEqual(records[0]!.result);
  });

  it("niente record se la partita non è mai cominciata", () => {
    const { session, records } = sessionWithRecords();
    session.join("host", "jackson", { userId: "u1" });
    session.abandon("host");
    expect(records).toHaveLength(0);
  });
});
