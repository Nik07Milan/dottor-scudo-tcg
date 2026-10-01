// T3.6: due client reali (SDK Colyseus) guidati da bot giocano una partita intera passando dal server.
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import {
  actionKey,
  deckCards,
  deckToCounts,
  getLegalActions,
  greedyBot,
  randomBot,
  type Bot,
  type PlayerId,
  type PlayerView,
} from "@dottorscudo/engine";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { server } from "../src/app";
import { ROOM_NAME, type ServerMessages } from "../src/protocol";
import { configureStore, type GameRoom } from "../src/room";
import { MemoryStore } from "../src/store";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(server);
});
afterAll(async () => colyseus.shutdown());
beforeEach(async () => colyseus.cleanup());

type SdkRoom = Awaited<ReturnType<ColyseusTestServer["sdk"]["joinById"]>>;

/** Collega un bot a un client: a ogni update in cui tocca a lui, sceglie un'azione sulla propria vista. */
function drive(room: SdkRoom, bot: Bot, seed: number) {
  let player: PlayerId | null = null;
  let rng = seed;
  let last: PlayerView | null = null;
  /** Un'azione inviata e non ancora confermata: niente nuove decisioni su viste vecchie. */
  let inFlight = false;
  const errors: ServerMessages["error"][] = [];

  const decide = () => {
    if (!player || !last || inFlight || last.phase === "ended") return;
    const legal = getLegalActions(last, player);
    // Agisce solo se tocca a lui: nel mulligan sempre, altrimenti se ha mosse diverse dalla resa.
    if (!legal.some((a) => a.type !== "concede")) return;
    const decision = bot.choose(last, player, legal, rng);
    rng = decision.rng;
    const { player: _ignored, ...action } = decision.action;
    inFlight = true;
    room.send("action", action);
  };

  const done = new Promise<PlayerView>((resolve) => {
    room.onMessage("joined", (m: ServerMessages["joined"]) => (player = m.player));
    room.onMessage("waiting", () => {});
    room.onMessage("opponent", () => {});
    room.onMessage("error", (e: ServerMessages["error"]) => {
      errors.push(e);
      inFlight = false;
      decide();
    });
    room.onMessage("update", (u: ServerMessages["update"]) => {
      last = u.view;
      if (u.view.phase === "ended") return resolve(u.view);
      if (inFlight && u.actor !== player) return; // non è ancora la risposta alla mia azione
      inFlight = false;
      decide();
    });
  });
  return { done, errors, view: () => last, player: () => player };
}

describe("stanza game", () => {
  it("crea una stanza privata con codice invito di 6 caratteri", async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { heroId: "jackson" });
    expect(host.roomId).toMatch(/^[A-Z2-9]{6}$/);
    const room = colyseus.getRoomById(host.roomId) as GameRoom;
    expect(room.session.code).toBe(host.roomId);
  });

  it("si entra con il codice; un terzo giocatore viene rifiutato", async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { heroId: "jackson" });
    await colyseus.sdk.joinById(host.roomId, { heroId: "milet" });
    await expect(colyseus.sdk.joinById(host.roomId, { heroId: "ale" })).rejects.toThrow();
  });

  it("un eroe sconosciuto viene rifiutato all'ingresso", async () => {
    await expect(colyseus.sdk.create(ROOM_NAME, { heroId: "nessuno" })).rejects.toThrow();
  });

  it("due bot giocano una partita intera attraverso il server", async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { heroId: "dottor-scudo" });
    const a = drive(host, greedyBot, 1);
    const guest = await colyseus.sdk.joinById(host.roomId, { heroId: "dr-grappolo" });
    const b = drive(guest, randomBot, 2);

    const [finalA, finalB] = await Promise.all([a.done, b.done]);
    expect(finalA.result).toEqual(finalB.result);
    expect(finalA.result?.reason).toMatch(/hero_defeated|turn_limit|concede/);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);

    // Il server ha registrato tutte le azioni e lo stato vero coincide con quello visto dai client.
    const room = colyseus.getRoomById(host.roomId) as GameRoom;
    expect(room.session.state?.result).toEqual(finalA.result);
    expect(room.session.actions.length).toBeGreaterThan(20);
    // Le viste non contengono la mano avversaria.
    expect(finalA.players[b.player()!].hand.every((c) => c.cardId === "hidden")).toBe(true);
    expect(finalA.rng).toBe(0);
  }, 60_000);

  it("un'azione illegale da client viene rifiutata e non cambia lo stato", async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { heroId: "jackson" });
    const guest = await colyseus.sdk.joinById(host.roomId, { heroId: "milet" });
    const room = colyseus.getRoomById(host.roomId) as GameRoom;
    await room.waitForNextPatch().catch(() => {});
    const before = structuredClone(room.session.state);
    const error = new Promise<ServerMessages["error"]>((resolve) => guest.onMessage("error", resolve));
    guest.send("action", { type: "end_turn" }); // siamo ancora nel mulligan
    expect((await error).code).toBe("wrong_phase");
    expect(room.session.state).toEqual(before);
    void actionKey;
  });

  it("chi lascia la partita la perde", async () => {
    const host = await colyseus.sdk.create(ROOM_NAME, { heroId: "jackson" });
    const guest = await colyseus.sdk.joinById(host.roomId, { heroId: "milet" });
    const room = colyseus.getRoomById(host.roomId) as GameRoom;
    const over = new Promise<ServerMessages["update"]>((resolve) =>
      host.onMessage("update", (u: ServerMessages["update"]) => u.view.phase === "ended" && resolve(u)),
    );
    await guest.leave(true);
    expect((await over).view.result).toEqual({ winner: "p1", reason: "concede" });
    expect(room.session.state?.result?.winner).toBe("p1");
  });
});

describe("account, mazzi e storico (T5.3)", () => {
  const store = new MemoryStore();
  const customJackson = [...deckCards("jackson")].reverse();

  beforeAll(() => {
    store.tokens.set("token-u1", "u1");
    store.decks.set("d1", { owner: "u1", heroId: "jackson", cards: deckToCounts(customJackson) });
    configureStore(store);
  });
  afterAll(() => configureStore(null));
  // Il client SDK è condiviso tra i test: il token va tolto dopo ognuno.
  afterEach(() => (colyseus.sdk.auth.token = ""));

  it("con il token si entra col proprio mazzo; la partita finita va nello storico", async () => {
    colyseus.sdk.auth.token = "token-u1";
    const host = await colyseus.sdk.create(ROOM_NAME, { heroId: "jackson", deckId: "d1" });
    colyseus.sdk.auth.token = "";
    const guest = await colyseus.sdk.joinById(host.roomId, { heroId: "milet" });
    const room = colyseus.getRoomById(host.roomId) as GameRoom;
    expect(room.session.setup?.players[0].deck).toEqual(customJackson);

    await guest.leave(true);
    await expect.poll(() => store.matches.length).toBe(1);
    expect(store.matches[0]!.users).toEqual({ p1: "u1", p2: null });
  });

  it("un token non valido viene rifiutato", async () => {
    colyseus.sdk.auth.token = "scaduto";
    await expect(colyseus.sdk.create(ROOM_NAME, { heroId: "jackson" })).rejects.toThrow();
  });

  it("senza accesso non si usa un mazzo salvato", async () => {
    await expect(colyseus.sdk.create(ROOM_NAME, { heroId: "jackson", deckId: "d1" })).rejects.toThrow();
  });
});
