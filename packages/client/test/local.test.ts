import { getLegalActions, greedyBot, randomBot, type Action } from "@dottorscudo/engine";
import { describe, expect, it } from "vitest";
import { LocalMatch } from "../src/local";
import type { ServerMessages } from "../../server/src/protocol";

/** Orologio finto: le azioni del bot partono solo quando il test fa scorrere il tempo. */
function fakeClock() {
  const queue: (() => void)[] = [];
  return {
    schedule: (_ms: number, fn: () => void) => {
      queue.push(fn);
      return () => {
        const i = queue.indexOf(fn);
        if (i >= 0) queue.splice(i, 1);
      };
    },
    /** Esegue i passi del bot in coda (anche quelli che ne accodano altri). */
    flush(max = 500) {
      for (let i = 0; i < max && queue.length > 0; i++) queue.shift()!();
    },
    pending: () => queue.length,
  };
}

function setup(seed = 7) {
  const clock = fakeClock();
  const match = new LocalMatch({ heroId: "jackson", bot: greedyBot, botHeroId: "il-calabrone", seed, schedule: clock.schedule });
  const updates: ServerMessages["update"][] = [];
  const errors: ServerMessages["error"][] = [];
  match.on({ update: (u) => updates.push(u), error: (e) => errors.push(e), joined: () => {}, waiting: () => {}, opponent: () => {} });
  return { match, clock, updates, errors, last: () => updates.at(-1)! };
}

describe("LocalMatch (contro l'IA nel browser)", () => {
  it("parte subito: l'umano è p1 e vede la propria vista, la mano del bot è nascosta", () => {
    const { last } = setup();
    const view = last().view;
    expect(view.viewer).toBe("p1");
    expect(view.phase).toBe("mulligan");
    expect(view.players.p2.hand.every((c) => c.cardId === "hidden")).toBe(true);
    expect(last().deadline).toBeNull();
  });

  it("il bot fa il suo mulligan da solo; quello umano passa da send", () => {
    const { match, clock, last } = setup();
    clock.flush();
    expect(last().view.players.p2.mulliganDone).toBe(true);
    match.send({ type: "mulligan", replace: [] });
    clock.flush();
    expect(last().view.phase).toBe("main");
  });

  it("un'azione illegale risponde con error e non cambia lo stato", () => {
    const { match, clock, errors, last } = setup();
    clock.flush();
    const before = last().view;
    match.send({ type: "end_turn" }); // ancora nel mulligan
    expect(errors.at(-1)?.code).toBe("wrong_phase");
    expect(last().view).toEqual(before);
  });

  it("il giocatore non può agire per il bot: il player lo decide la partita", () => {
    const { match, clock, last } = setup();
    clock.flush();
    match.send({ type: "mulligan", replace: [], player: "p2" } as never);
    // È stato applicato come mulligan di p1, non di p2 (che l'aveva già fatto).
    expect(last().actor).toBe("p1");
  });

  it("si gioca fino alla fine: l'umano gioca a caso, il bot risponde nei suoi turni", () => {
    const { match, clock, last } = setup(11);
    let rng = 1;
    for (let i = 0; i < 2000 && last().view.phase !== "ended"; i++) {
      clock.flush();
      const view = last().view;
      if (view.phase === "ended") break;
      const legal = getLegalActions(view, "p1").filter((a) => a.type !== "concede");
      if (legal.length === 0) continue; // tocca al bot
      const d = randomBot.choose(view, "p1", legal, rng);
      rng = d.rng;
      const { player: _p, ...action } = d.action as Action;
      match.send(action);
    }
    expect(last().view.phase).toBe("ended");
    expect(last().view.result?.winner).toBe("p2"); // greedy batte un giocatore casuale
  });

  it("leave ferma il bot", () => {
    const { match, clock } = setup();
    void match.leave();
    expect(clock.pending()).toBe(0);
  });
});
