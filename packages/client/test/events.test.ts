import type { GameEvent } from "@dottorscudo/engine";
import { describe, expect, it } from "vitest";
import { EventQueue } from "../src/eventQueue";

const events: GameEvent[] = [
  { type: "turn_started", player: "p1", turn: 3 },
  { type: "card_played", player: "p1", instanceId: 40, cardId: "chiamata-api", target: { kind: "hero", player: "p2" } },
  { type: "damage", target: { kind: "hero", player: "p2" }, amount: 2 },
  { type: "mana_changed", player: "p1", max: 3, available: 2 },
];

describe("EventQueue", () => {
  it("restituisce gli eventi in ordine, uno alla volta", () => {
    const q = new EventQueue({ p1: "jackson", p2: "milet" });
    q.push(events);
    expect(q.size).toBe(4);
    expect(q.next()).toEqual(events[0]);
    expect(q.next()).toEqual(events[1]);
    expect(q.size).toBe(2);
  });

  it("peek mostra il prossimo evento senza toglierlo", () => {
    const q = new EventQueue({ p1: "jackson", p2: "milet" });
    q.push(events);
    expect(q.peek()).toEqual(events[0]);
    expect(q.size).toBe(4);
  });

  it("tiene un log leggibile degli eventi, in italiano", () => {
    const q = new EventQueue({ p1: "jackson", p2: "milet" });
    q.push(events);
    expect(q.log).toEqual(["— Turno 3: Jackson (p1) —", "p1 gioca Chiamata API su Milet (p2).", "Milet (p2) subisce 2 danni."]);
  });

  it("il log tiene solo le ultime righe", () => {
    const q = new EventQueue({ p1: "jackson", p2: "milet" }, 2);
    q.push(events);
    expect(q.log).toHaveLength(2);
  });

  it("clear svuota la coda ma non il log", () => {
    const q = new EventQueue({ p1: "jackson", p2: "milet" });
    q.push(events);
    q.clear();
    expect(q.size).toBe(0);
    expect(q.log.length).toBeGreaterThan(0);
  });
});
