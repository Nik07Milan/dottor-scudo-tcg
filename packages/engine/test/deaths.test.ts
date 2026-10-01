import { afterEach, describe, expect, it } from "vitest";
import { applyAction } from "../src/apply";
import { CARDS_BY_ID } from "../src/data";
import * as rules from "../src/rules";
import type { GameState, MinionInstance, PlayerId } from "../src/state";
import type { CardDefinition, Effect } from "../src/types";
import { fillBoard, other, startedGame, withHand } from "./helpers";

// ---------------------------------------------------------------------------------------------
// Carte sintetiche: nessuna carta reale fa catene, evocazioni al proprio posto o loop infiniti.
// Esistono solo durante il test e vengono tolte in afterEach.
// ---------------------------------------------------------------------------------------------

const registry = CARDS_BY_ID as Map<string, CardDefinition>;
const synthetic: string[] = [];

function testMinion(id: string, effects: Effect[], attack = 1, health = 1): void {
  registry.set(id, {
    id,
    name: id,
    faction: "neutrale",
    signatureOf: null,
    rarity: "token",
    type: "minion",
    cost: 1,
    attack,
    health,
    keywords: ["ultimo_sorso"],
    text: "",
    effects,
    lore: "",
    art: null,
  });
  synthetic.push(id);
}

afterEach(() => {
  for (const id of synthetic.splice(0)) registry.delete(id);
});

// ---------------------------------------------------------------------------------------------

/** Mette un servitore `cardId` sulla scrivania di `side` con 1 di vita: muore con un qualsiasi danno. */
function put(state: GameState, side: PlayerId, cardId: string, owner: PlayerId = side): MinionInstance {
  fillBoard(state, side, 1, cardId);
  const m = state.players[side].board.at(-1)!;
  m.owner = owner;
  m.health = 1;
  return m;
}

/** Il giocatore di turno gioca Scoppio d'ira: 2 danni a tutti i servitori. */
function scoppio(state: GameState) {
  const me = state.activePlayer;
  const { state: s, ids } = withHand(state, me, ["scoppio-d-ira"]);
  // withHand sostituisce la mano: teniamo una carta nel mazzo per le pescate.
  return applyAction(s, { type: "play_card", player: me, card: ids[0]! });
}

const setup = () => {
  const state = startedGame();
  return { state, me: state.activePlayer, foe: other(state.activePlayer) };
};

describe("Ultimo sorso delle carte", () => {
  it("Miletta evoca uno Spirito zanzara per l'avversario", () => {
    const { state, me, foe } = setup();
    put(state, me, "miletta");
    const { state: s } = scoppio(state);
    expect(s.players[me].board).toEqual([]);
    expect(s.players[foe].board.map((m) => m.cardId)).toEqual(["spirito-zanzara"]);
  });

  it("La Canalis infligge 2 danni all'eroe nemico del suo controllore", () => {
    const { state, me, foe } = setup();
    put(state, foe, "la-canalis");
    const { state: s } = scoppio(state);
    expect(s.players[me].hero.health).toBe(rules.HERO_MAX_HEALTH - 2);
    expect(s.players[foe].hero.health).toBe(rules.HERO_MAX_HEALTH);
  });

  it("un Ultimo sorso letale chiude la partita a fine azione", () => {
    const { state, me, foe } = setup();
    state.players[me].hero.health = 2;
    put(state, foe, "la-canalis");
    const r = scoppio(state);
    expect(r.state.result).toEqual({ winner: foe, reason: "hero_defeated" });
    expect(r.events.at(-1)?.type).toBe("game_over");
  });

  it("Il Cannellone fa pescare il suo controllore", () => {
    const { state, me } = setup();
    put(state, me, "il-cannellone");
    const { state: s, events } = scoppio(state);
    expect(s.players[me].hand).toHaveLength(1);
    expect(events.filter((e) => e.type === "card_drawn")).toHaveLength(1);
  });

  it("vale il controllore al momento della morte, non il proprietario", () => {
    const { state, me, foe } = setup();
    put(state, foe, "miletta", me); // di proprietà mia, controllata dall'avversario
    const { state: s } = scoppio(state);
    // "per l'avversario" del controllore (foe) = me.
    expect(s.players[me].board.map((m) => m.cardId)).toEqual(["spirito-zanzara"]);
    expect(s.players[foe].board).toEqual([]);
    expect(s.players[foe].graveyard).toEqual(["miletta"]);
  });
});

describe("ordine", () => {
  it("prima tutte le morti, poi gli Ultimo sorso: giocatore di turno prima, poi ordine di entrata", () => {
    const { state, me, foe } = setup();
    const canalis = put(state, foe, "la-canalis");
    const second = put(state, me, "il-cannellone");
    const first = put(state, me, "miletta");
    // Ordine di entrata: forziamo miletta più vecchia del cannellone.
    [first.instanceId, second.instanceId] = [second.instanceId, first.instanceId];

    const { events } = scoppio(state);
    const relevant = events.filter((e) => ["minion_died", "minion_summoned", "card_drawn", "damage"].includes(e.type) && !(e.type === "damage" && e.target.kind === "minion"));
    expect(relevant.map((e) => e.type)).toEqual(["minion_died", "minion_died", "minion_died", "minion_summoned", "card_drawn", "damage"]);
    expect(relevant.slice(0, 3).map((e) => e.type === "minion_died" && e.instanceId)).toEqual([first.instanceId, second.instanceId, canalis.instanceId]);
    expect(relevant[5]).toEqual({ type: "damage", target: { kind: "hero", player: me }, amount: 2 });
    void foe;
  });

  it("le evocazioni di un Ultimo sorso entrano al posto del servitore morto", () => {
    testMinion("test-uovo", [{ trigger: "on_death", action: { kind: "summon", cardId: "studente-plagiato", count: 2 } }], 0, 1);
    const { state, me } = setup();
    fillBoard(state, me, 1);
    put(state, me, "test-uovo");
    fillBoard(state, me, 1);
    const [left, , right] = state.players[me].board;
    left!.health = right!.health = 9;
    const { state: s } = scoppio(state);
    expect(s.players[me].board.map((m) => m.cardId)).toEqual(["il-crudo", "studente-plagiato", "studente-plagiato", "il-crudo"]);
  });
});

describe("catene", () => {
  it("un Ultimo sorso che uccide fa scattare gli Ultimo sorso dei nuovi morti", () => {
    testMinion("test-bomba", [{ trigger: "on_death", action: { kind: "damage", amount: 3, target: "all_minions" } }], 0, 1);
    const { state, me, foe } = setup();
    put(state, me, "test-bomba");
    const miletta = put(state, foe, "miletta");
    miletta.health = 3; // sopravvive a Scoppio (2), non alla bomba (3)
    const { state: s, events } = scoppio(state);

    const died = events.filter((e) => e.type === "minion_died").map((e) => e.type === "minion_died" && e.cardId);
    expect(died).toEqual(["test-bomba", "miletta"]);
    // Lo Spirito zanzara di Miletta va al suo avversario (me) ed è evocato dopo la bomba: sopravvive.
    expect(s.players[me].board.map((m) => m.cardId)).toEqual(["spirito-zanzara"]);
    expect(s.players[foe].board).toEqual([]);
  });

  it("una catena infinita si ferma al limite di passi con un pareggio", () => {
    testMinion("test-fenice", [
      { trigger: "on_death", action: { kind: "summon", cardId: "test-fenice", count: 1 } },
      { trigger: "on_death", action: { kind: "damage", amount: 1, target: "all_minions" } },
    ]);
    const { state, me } = setup();
    put(state, me, "test-fenice");
    const r = scoppio(state);
    expect(r.state.phase).toBe("ended");
    expect(r.state.result).toEqual({ winner: null, reason: "resolution_limit" });
    expect(r.events.at(-1)).toEqual({ type: "game_over", result: { winner: null, reason: "resolution_limit" } });
  });
});

describe("niente Ultimo sorso senza morte", () => {
  it("un servitore rimandato in mano non attiva l'Ultimo sorso", () => {
    const { state, me, foe } = setup();
    const miletta = put(state, foe, "miletta");
    const { state: s, ids } = withHand(state, me, ["mezza-giornata"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, target: { kind: "minion", instanceId: miletta.instanceId } });
    expect(r.state.players[me].board).toEqual([]);
    expect(r.events.some((e) => e.type === "minion_died")).toBe(false);
  });

  it("nemmeno a mano piena", () => {
    const { state, me, foe } = setup();
    const miletta = put(state, foe, "miletta");
    const p = state.players[foe];
    while (p.hand.length < rules.MAX_HAND) p.hand.push({ instanceId: state.nextInstanceId++, cardId: "sasso", costModifier: 0 });
    const { state: s, ids } = withHand(state, me, ["mezza-giornata"]);
    const r = applyAction(s, { type: "play_card", player: me, card: ids[0]!, target: { kind: "minion", instanceId: miletta.instanceId } });
    expect(r.events).toContainEqual({ type: "card_burned", player: foe, cardId: "miletta" });
    expect(r.state.players[me].board).toEqual([]);
  });
});
