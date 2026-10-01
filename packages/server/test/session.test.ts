import { HIDDEN_CARD, type Action } from "@dottorscudo/engine";
import { describe, expect, it } from "vitest";
import { MULLIGAN_SECONDS, TURN_SECONDS } from "../src/config";
import { GameSession, JoinError, generateCode } from "../src/session";
import { fakeDeps } from "./fake";

function twoPlayers(random: number[] = []) {
  const f = fakeDeps(random);
  const session = new GameSession("ABCDEF", f.deps);
  session.join("host", "jackson");
  session.join("guest", "il-calabrone");
  return { session, ...f };
}

const mulliganAll = (s: GameSession) => {
  s.handleAction("host", { type: "mulligan", replace: [] });
  s.handleAction("guest", { type: "mulligan", replace: [] });
};

/** Session id del giocatore attivo. */
const activeSession = (s: GameSession) => s.sessionOf(s.state!.activePlayer)!;

describe("codice invito", () => {
  it("6 caratteri senza simboli ambigui", () => {
    for (let i = 0; i < 50; i++) expect(generateCode(Math.random)).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });
});

describe("ingresso", () => {
  it("il primo è p1 e aspetta, il secondo è p2 e la partita parte", () => {
    const f = fakeDeps();
    const s = new GameSession("ABCDEF", f.deps);
    expect(s.join("host", "jackson")).toBe("p1");
    expect(f.last("host", "waiting")).toEqual({ code: "ABCDEF" });
    expect(s.state).toBeNull();
    expect(s.join("guest", "milet")).toBe("p2");
    expect(s.state?.phase).toBe("mulligan");
    expect(f.last("host", "joined")).toEqual({ player: "p1", code: "ABCDEF" });
    expect(f.last("guest", "joined")).toEqual({ player: "p2", code: "ABCDEF" });
  });

  it("rifiuta un terzo giocatore e gli eroi sconosciuti", () => {
    const { session } = twoPlayers();
    expect(() => session.join("intruso", "jackson")).toThrow(JoinError);
    const f = fakeDeps();
    expect(() => new GameSession("X", f.deps).join("a", "nessuno")).toThrow(/eroe/);
  });

  it("il seed viene dal generatore del server e i mazzi sono quelli precostruiti", () => {
    const { session } = twoPlayers([0.25]);
    expect(session.setup?.seed).toBe(Math.floor(0.25 * 2 ** 32));
    expect(session.setup?.players.map((p) => p.deck.length)).toEqual([30, 30]);
  });
});

describe("viste e azioni (T3.3)", () => {
  it("all'avvio ognuno riceve la propria vista: la mano avversaria è nascosta", () => {
    const { last } = twoPlayers();
    const hostView = last("host", "update").view;
    expect(hostView.viewer).toBe("p1");
    expect(hostView.players.p2.hand.every((c: { cardId: string }) => c.cardId === HIDDEN_CARD)).toBe(true);
    expect(hostView.players.p1.hand.every((c: { cardId: string }) => c.cardId !== HIDDEN_CARD)).toBe(true);
    expect(hostView.rng).toBe(0);
  });

  it("un'azione valida aggiorna tutti, con gli eventi filtrati", () => {
    const { session, last, clear } = twoPlayers();
    clear();
    session.handleAction("host", { type: "mulligan", replace: [] });
    expect(last("host", "update").events).toContainEqual({ type: "mulligan_done", player: "p1", replaced: 0 });
    expect(last("guest", "update").events).toContainEqual({ type: "mulligan_done", player: "p1", replaced: 0 });
  });

  it("il server impone il giocatore: non si può agire per l'avversario", () => {
    const { session, last } = twoPlayers();
    mulliganAll(session);
    const idle = session.state!.activePlayer === "p1" ? "guest" : "host";
    const before = structuredClone(session.state);
    session.handleAction(idle, { type: "end_turn", player: session.state!.activePlayer } as Action);
    expect(session.state).toEqual(before);
    expect(last(idle, "error").code).toBe("not_your_turn");
  });

  it("un'azione illegale non cambia lo stato e risponde con l'errore solo a chi l'ha inviata", () => {
    const { session, last, sent, clear } = twoPlayers();
    mulliganAll(session);
    const before = structuredClone(session.state);
    clear();
    session.handleAction(activeSession(session), { type: "play_card", card: 999_999 });
    expect(session.state).toEqual(before);
    expect(last(activeSession(session), "error")).toMatchObject({ code: "card_not_in_hand" });
    expect(sent.filter((m) => m.type === "update")).toEqual([]);
    session.handleAction(activeSession(session), "spazzatura" as unknown as Action);
    expect(last(activeSession(session), "error").code).toBe("malformed");
  });

  it("chi non è seduto al tavolo non può agire", () => {
    const { session, last } = twoPlayers();
    session.handleAction("sconosciuto", { type: "end_turn" });
    expect(last("sconosciuto", "error").code).toBe("not_in_game");
  });

  it("le azioni accettate vengono registrate per il replay", () => {
    const { session } = twoPlayers();
    mulliganAll(session);
    expect(session.actions).toHaveLength(2);
  });
});

describe("timer (T3.4)", () => {
  it(`mulligan: allo scadere dei ${MULLIGAN_SECONDS}s chi non ha scelto tiene la mano`, () => {
    const { session, advance } = twoPlayers();
    session.handleAction("host", { type: "mulligan", replace: [] });
    advance(MULLIGAN_SECONDS * 1000 - 1);
    expect(session.state!.phase).toBe("mulligan");
    advance(1);
    expect(session.state!.phase).toBe("main");
  });

  it(`turno: allo scadere dei ${TURN_SECONDS}s il turno passa da solo`, () => {
    const { session, advance } = twoPlayers();
    mulliganAll(session);
    const turn = session.state!.turn;
    advance(TURN_SECONDS * 1000 - 1);
    expect(session.state!.turn).toBe(turn);
    advance(1);
    expect(session.state!.turn).toBe(turn + 1);
  });

  it("finire il turno a mano fa ripartire il timer per l'avversario", () => {
    const { session, advance } = twoPlayers();
    mulliganAll(session);
    advance(70_000);
    session.handleAction(activeSession(session), { type: "end_turn" });
    const turn = session.state!.turn;
    advance(10_000);
    expect(session.state!.turn).toBe(turn); // non è scaduto il vecchio timer
    advance(TURN_SECONDS * 1000);
    expect(session.state!.turn).toBe(turn + 1);
  });

  it("ogni aggiornamento dice quando scade il turno", () => {
    const { session, last, deps } = twoPlayers();
    mulliganAll(session);
    expect(last("host", "update").deadline).toBe(deps.now() + TURN_SECONDS * 1000);
  });

  it("con una scelta di Scopri in sospeso, allo scadere si sceglie a caso e poi il turno passa", () => {
    const { session, advance } = twoPlayers([0.1, 0.9]);
    mulliganAll(session);
    session.state!.pendingChoice = { kind: "discover", player: session.state!.activePlayer, options: ["klaudioken", "retcon", "le-task"] };
    const turn = session.state!.turn;
    const chooser = session.state!.activePlayer;
    advance(TURN_SECONDS * 1000);
    expect(session.state!.pendingChoice).toBeNull();
    expect(session.state!.turn).toBe(turn + 1);
    expect(session.actions.some((a) => a.type === "choose" && a.player === chooser)).toBe(true);
  });

  it("a partita finita il timer si ferma", () => {
    const { session, pendingTimers } = twoPlayers();
    mulliganAll(session);
    session.handleAction("host", { type: "concede" });
    expect(session.state!.phase).toBe("ended");
    expect(pendingTimers()).toBe(0);
  });
});

describe("riconnessione e abbandono (T3.5)", () => {
  it("chi si disconnette resta seduto; l'avversario viene avvisato", () => {
    const { session, last } = twoPlayers();
    session.disconnect("guest");
    expect(last("host", "opponent")).toEqual({ connected: false });
    expect(session.state!.phase).not.toBe("ended");
  });

  it("chi si riconnette riceve di nuovo la sua vista", () => {
    const { session, last, clear } = twoPlayers();
    mulliganAll(session);
    session.disconnect("guest");
    clear();
    session.reconnect("guest");
    expect(last("guest", "update").view.viewer).toBe("p2");
    expect(last("host", "opponent")).toEqual({ connected: true });
  });

  it("abbandonare una partita in corso è una sconfitta", () => {
    const { session, last } = twoPlayers();
    mulliganAll(session);
    session.abandon("guest");
    expect(session.state!.result).toEqual({ winner: "p1", reason: "concede" });
    expect(last("host", "update").events.at(-1)).toEqual({ type: "game_over", result: { winner: "p1", reason: "concede" } });
  });

  it("abbandonare due volte non fa danni", () => {
    const { session } = twoPlayers();
    session.abandon("guest");
    expect(() => session.abandon("guest")).not.toThrow();
  });

  it("se l'host esce prima che arrivi l'avversario, il posto si libera", () => {
    const f = fakeDeps();
    const s = new GameSession("ABCDEF", f.deps);
    s.join("host", "jackson");
    s.abandon("host");
    expect(s.join("altro", "milet")).toBe("p1");
  });
});
