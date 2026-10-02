import { DATA_VERSION } from "@dottorscudo/engine";
import { describe, expect, it } from "vitest";
import { matchLine, type MatchSummaryRow } from "../src/history/model";

const row = (over: Partial<MatchSummaryRow> = {}): MatchSummaryRow => ({
  id: "m1",
  heroes: ["jackson", "milet"],
  result: { winner: "p2", reason: "hero_defeated" },
  dataVersion: DATA_VERSION,
  users: { p1: "u1", p2: "u2" },
  turns: 14,
  endedAt: "2026-10-02T10:00:00Z",
  ...over,
});

describe("storico partite (T5.3)", () => {
  it("dal lato di chi guarda: eroi, avversario ed esito", () => {
    expect(matchLine(row(), "u1")).toMatchObject({ viewer: "p1", myHero: "Jackson", foeHero: "Milet", foeUser: "u2", outcome: "Sconfitta", reason: "ferie a zero" });
    expect(matchLine(row(), "u2")).toMatchObject({ viewer: "p2", myHero: "Milet", foeHero: "Jackson", foeUser: "u1", outcome: "Vittoria" });
  });

  it("pareggio, avversario ospite e resa", () => {
    const line = matchLine(row({ result: { winner: null, reason: "turn_limit" }, users: { p1: null, p2: "u1" } }), "u1");
    expect(line).toMatchObject({ viewer: "p2", foeUser: null, outcome: "Pareggio", reason: "limite di turni" });
    expect(matchLine(row({ result: { winner: "p1", reason: "concede" } }), "u1").reason).toBe("resa o abbandono");
  });

  it("segnala le partite giocate con carte diverse da quelle attuali", () => {
    expect(matchLine(row(), "u1").outdated).toBe(false);
    expect(matchLine(row({ dataVersion: "00000000" }), "u1").outdated).toBe(true);
  });
});
