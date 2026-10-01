// Tutorial: una partita guidata contro Dr Grappolo, con un copione di passi.
// Le regole sono quelle dell'engine; il tutorial costruisce lo stato di partenza, prepara caffettini e
// carte dell'avversario tra un passo e l'altro, e accetta solo la mossa spiegata.

import { CARDS_BY_ID, createGame, deckCards, greedyBot, type Action, type CardInstance, type GameState, type PlayerId } from "@dottorscudo/engine";
import { LocalMatch, type LocalOptions } from "../local";

export interface TutorialStep {
  hint: string;
  /** La mossa che il passo insegna. */
  expect: (action: Action, state: GameState) => boolean;
}

const HUMAN: PlayerId = "p1";
const BOT: PlayerId = "p2";

const cardIn = (state: GameState, p: PlayerId, instanceId: number) => state.players[p].hand.find((c) => c.instanceId === instanceId)?.cardId;
const minionCard = (state: GameState, instanceId: number) =>
  [...state.players.p1.board, ...state.players.p2.board].find((m) => m.instanceId === instanceId)?.cardId;
const plays = (cardId: string, target?: "foe_hero") => (a: Action, s: GameState) =>
  a.type === "play_card" && cardIn(s, HUMAN, a.card) === cardId && (target !== "foe_hero" || (a.target?.kind === "hero" && a.target.player === BOT));
const attacks = (attackerCard: string, defender: "foe_hero" | string) => (a: Action, s: GameState) =>
  a.type === "attack" &&
  a.attacker.kind === "minion" &&
  minionCard(s, a.attacker.instanceId) === attackerCard &&
  (defender === "foe_hero" ? a.defender.kind === "hero" && a.defender.player === BOT : a.defender.kind === "minion" && minionCard(s, a.defender.instanceId) === defender);
const is = (type: Action["type"]) => (a: Action) => a.type === type;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    hint: "Benvenuto in ufficio! Queste sono le tue prime carte. Per ora tienile tutte: clicca «Tieni la mano».",
    expect: (a) => a.type === "mulligan" && a.replace.length === 0,
  },
  {
    hint: "Hai 1 caffettino. Trascina il Piccione urbano (costa 1) sulla tua scrivania.",
    expect: plays("piccione-urbano"),
  },
  {
    hint: "Un collega non può attaccare nel turno in cui entra. Premi «Fine turno».",
    expect: is("end_turn"),
  },
  {
    hint: "Ora il Piccione può attaccare: cliccalo, poi clicca Dr Grappolo per colpire le sue ferie.",
    expect: attacks("piccione-urbano", "foe_hero"),
  },
  {
    hint: "Usa il potere eroe di Jackson (il cerchio viola, 2 caffettini): 1 danno a tutti i colleghi nemici, ma 2 a te.",
    expect: is("hero_power"),
  },
  {
    hint: "Ottimo, lo Studente è andato. Premi «Fine turno».",
    expect: is("end_turn"),
  },
  {
    hint: "La fila del giovedì ha Burocrazia: blocca gli attacchi. Le Pratiche però la ignorano: gioca Chiamata API su Dr Grappolo.",
    expect: plays("chiamata-api", "foe_hero"),
  },
  {
    hint: "Con la Burocrazia in campo il Piccione deve attaccare prima La fila del giovedì. Fallo.",
    expect: attacks("piccione-urbano", "fila-del-giovedi"),
  },
  {
    hint: "Il Piccione si è sacrificato. Premi «Fine turno».",
    expect: is("end_turn"),
  },
  {
    hint: "Dr Grappolo ha 4 ferie. Klaudioken infligge 4 danni: giocalo su di lui e vinci!",
    expect: plays("klaudioken", "foe_hero"),
  },
];

const FINAL_HINT = "Tutorial completato! Ora sai giocare. Torna alla lobby e sfida l'IA o un collega con il codice invito.";
const BOT_TURN_HINT = "Tocca a Dr Grappolo…";

/** Turni dell'avversario: carta da mettergli in mano, caffettini, mosse scritte nel copione. */
interface BotTurn {
  card?: string;
  mana?: number;
  moves: (state: GameState, cardInstance?: number) => Action[];
}

const firstMinion = (s: GameState, p: PlayerId) => s.players[p].board[0]!.instanceId;

const BOT_TURNS: readonly BotTurn[] = [
  {
    card: "studente-plagiato",
    moves: (_s, c) => [{ type: "play_card", player: BOT, card: c!, position: 0 }],
  },
  {
    card: "fila-del-giovedi",
    mana: 5,
    moves: (_s, c) => [{ type: "play_card", player: BOT, card: c!, position: 0 }],
  },
  {
    moves: (s) => [{ type: "attack", player: BOT, attacker: { kind: "minion", instanceId: firstMinion(s, BOT) }, defender: { kind: "hero", player: HUMAN } }],
  },
  { moves: () => [] },
];

const HUMAN_HAND = ["piccione-urbano", "chiamata-api", "il-crudo"];
/** Pescate nell'ordine: turno 1, 3, 5, 7… */
const HUMAN_DECK = ["cliente-insistente", "klaudioken", "piccione-urbano", ...Array<string>(20).fill("il-cursore")];
const BOT_HEALTH = 8;

function initialState(): GameState {
  const { state } = createGame({
    seed: 1,
    players: [
      { heroId: "jackson", deck: deckCards("jackson") },
      { heroId: "dr-grappolo", deck: deckCards("dr-grappolo") },
    ],
  });
  const card = (cardId: string): CardInstance => ({ instanceId: state.nextInstanceId++, cardId, costModifier: 0 });
  state.firstPlayer = HUMAN;
  state.activePlayer = HUMAN;
  state.players.p1.hand = HUMAN_HAND.map(card);
  state.players.p1.deck = HUMAN_DECK.map(card);
  state.players.p2.hand = [];
  state.players.p2.deck = Array.from({ length: 25 }, () => card("il-serpentone"));
  state.players.p2.hero.health = BOT_HEALTH;
  return state;
}

export class TutorialMatch extends LocalMatch {
  private step = 0;
  private botTurn = 0;
  private botQueue: Action[] = [];

  constructor(options: Partial<LocalOptions> = {}) {
    super({ heroId: "jackson", bot: greedyBot, botHeroId: "dr-grappolo", delayMs: 900, ...options }, { state: initialState(), events: [] });
    // Il primo update (dal costruttore di LocalMatch) è partito prima che i campi esistessero: si rimanda col suggerimento.
    this.emitUpdate([], null);
  }

  /** La plancia propone solo la mossa del passo (niente resa, niente alternative). */
  filterLegal(legal: Action[]): Action[] {
    const step = TUTORIAL_STEPS[this.step];
    if (!step || this.state.phase === "ended") return [];
    return legal.filter((a) => a.player === HUMAN && step.expect(a, this.state));
  }

  protected override accepts(action: Action): boolean {
    const step = TUTORIAL_STEPS[this.step];
    if (step && step.expect(action, this.state)) return true;
    this.emit("error", { code: "tutorial", message: "Segui il suggerimento del tutorial" });
    return false;
  }

  protected override hint(): string | undefined {
    if (this.step === undefined) return undefined; // durante il costruttore di LocalMatch
    if (this.state.phase === "ended") return FINAL_HINT;
    if (this.state.phase === "main" && this.state.activePlayer === BOT) return BOT_TURN_HINT;
    return TUTORIAL_STEPS[this.step]?.hint;
  }

  protected override afterApply(action: Action): void {
    if (action.player === HUMAN) this.step++;
    // Inizio di un turno dell'avversario: si prepara il copione.
    if (action.type === "end_turn" && action.player === HUMAN && this.state.activePlayer === BOT) {
      const turn = BOT_TURNS[this.botTurn++] ?? { moves: () => [] };
      const ps = this.state.players[BOT];
      let cardInstance: number | undefined;
      if (turn.card) {
        cardInstance = this.state.nextInstanceId++;
        ps.hand = [{ instanceId: cardInstance, cardId: turn.card, costModifier: 0 }];
        ps.mana.available = Math.max(ps.mana.available, turn.mana ?? CARDS_BY_ID.get(turn.card)!.cost);
      }
      this.botQueue = [...turn.moves(this.state, cardInstance), { type: "end_turn", player: BOT }];
    }
  }

  protected override botAction(): Action {
    if (this.state.phase === "mulligan") return { type: "mulligan", player: BOT, replace: [] };
    return this.botQueue.shift() ?? { type: "end_turn", player: BOT };
  }
}
