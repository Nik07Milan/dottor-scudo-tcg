# Roadmap — DottorScudo TCG

Suddivisione in task delle milestone di `CLAUDE.md`. Fonte di verità del design: `docs/GDD.md`.
Regola: non si passa alla milestone successiva finché la precedente non ha `npm test` e `npm run typecheck` verdi.

Legenda: ogni task ha un **Fatto quando** verificabile. Gli id (`T1.4`) servono per branch e commit.

Stato di partenza (commit `e3b4b3d`): scaffold. Engine con `types.ts` (bozza DSL), `rng.ts` (mulberry32),
`data.ts` (caricamento JSON) e `test/data.test.ts`. Server e client placeholder. `effects` vuoto in tutte
le 51 carte e nei 9 poteri eroe.

---

## T0 — Chiusura dei gap di design (prima di scrivere regole)

| Id | Task | Fatto quando |
|---|---|---|
| T0.1 ✅ | Completare il GDD §1 con le regole mancanti: **armatura** (usata da Scudo-bike e Alza lo scudo), **mulligan** (quante carte, una volta sola), **attacco dell'eroe** con Strumento, significato di **Scopri** (1 tra 3, pool, duplicati), **Task** (progresso visibile all'avversario?), **ordine di risoluzione** di trigger simultanei e morti. | Il GDD risponde a ognuna delle domande senza ambiguità. |
| T0.2 ✅ | Dati mancanti: token `nettuno` 8/8 Burocrazia (ricompensa di `progetto-nettuno`); decidere come modellare "Ferie arretrate" di `le-task` (effetto, non carta). Importare `data/dottorscudo-albi.json` (serve per M5). | `nettuno` in `cards.json`; test dati verde. |
| T0.3 ✅ | Verifica mazzi: Il Calabrone ha 0 carte firma, Ale 1. Calcolare per ogni eroe se si arriva a 30 carte legali (max 2 copie, 1 leggendaria, niente token). | Tabella eroe → carte disponibili nel GDD §6; nuove carte aggiunte se servono. |
| T0.4 ✅ | Documentare che `dr-grappolo`, `il-calabrone`, `lord-capognus` sono sia id di eroe sia id di carta (mappe separate, nessun conflitto). | Nota in `data/README.md`. |

---

## M1 — Engine

Ordine: 1A → 1B → 1C → (1D ‖ 1E) → 1F → 1G.

### 1A. Modello di stato
| Id | Task | Fatto quando |
|---|---|---|
| T1.1 ✅ | Tipi `GameState`, `PlayerState`, `MinionInstance` (instanceId, stats correnti, keyword, turni di Bloccato, attacchi nel turno, evocato in questo turno), `Action`, `GameEvent`. `rng` dentro lo stato. | Typecheck verde; tipi esportati da `index.ts`. |
| T1.2 ✅ | `createGame({ seed, players })`: primo giocatore e mescolata con RNG, mani 3 / 4, fase mulligan. | Test: stesso seed → stesse mani; seed diverso → mani diverse. |
| T1.3 | `validateDeck(heroId, cardIds)`: 30 carte, max 2 copie, 1 per leggendaria, niente token, solo fazione + firma propria + neutrali. | Un test per ogni regola violata. |

### 1B. Turno e risorse
| Id | Task | Fatto quando |
|---|---|---|
| T1.4 | Azioni `mulligan` (a fine mulligan il Caffettino va al secondo giocatore, GDD §1.1) ed `end_turn`. Inizio turno: +1 caffettino massimo (fino a 10), ricarica, pesca. Burnout 1, 2, 3…. Mano piena: le carte oltre la decima vengono scartate. | Test per ogni regola, inclusi i limiti (10 caffettini, 10 carte, burnout crescente). |
| T1.5 | `getLegalActions(state, playerId)` + `applyAction` che rifiuta tutto ciò che non è legale con un errore tipizzato. | Test di proprietà: un'azione è accettata ⇔ è in `getLegalActions`. |
| T1.6 | Vittoria, sconfitta, pareggio simultaneo, `concede`. | Test per i 4 esiti. |

### 1C. Giocate e combattimento
| Id | Task | Fatto quando |
|---|---|---|
| T1.7 | `play_card`: Colleghi (posizione sulla scrivania, max 7), Pratiche, Strumenti (sostituiscono l'arma attuale). | Test: costo scalato, campo pieno rifiutato, sostituzione arma. |
| T1.8 | `attack`: servitore contro servitore, servitore contro eroe, eroe con Strumento (−1 durabilità). Un attacco per turno, danno reciproco, l'armatura assorbe prima delle ferie. | Test per ogni combinazione. |
| T1.9 | Fase morti: rimozione dal campo, coda di `on_death`, ordine deterministico (ordine di gioco). | Test con morti multiple simultanee. |

### 1D. Keyword (un file di test per keyword)
| Id | Task | Fatto quando |
|---|---|---|
| T1.10 | Burocrazia, Scudato, Urgente (solo servitori nel primo turno), Smart working (perso dopo il primo attacco), Mani in merda, Bloccato in riunione (con durata), Deploy, Ultimo sorso. | `test/keywords/<keyword>.test.ts` verde per tutte e 8. |
| T1.11 | Task: contatore di progresso nello stato, ricompensa al completamento (`le-task`, `progetto-nettuno`). | Test: progresso, completamento, ricompensa una sola volta. |

### 1E. DSL degli effetti
| Id | Task | Fatto quando |
|---|---|---|
| T1.12 | Interprete delle `EffectAction` esistenti. Bersaglio `chosen` passato nell'azione e validato da `getLegalActions`; `random_*` tramite RNG dello stato. | Un test per ogni `kind`. |
| T1.13 | Estensioni del DSL per evitare codice custom: `discover`, `cost_modifier` (prossima carta / per tipo / per id), `take_control`, `summon_copy`, filtri bersaglio (`maxAttack`, solo colleghi, solo nemici), trigger `on_damaged` e `after_hero_attack`, `extra_attack`. | Ogni estensione ha un test; tipi aggiornati in `types.ts`. |
| T1.14 | Handler custom in `packages/engine/src/cards/custom/` solo dove il DSL non basta. Candidati: `uomo-sasso` (conta i Sassi giocati), `portinaio-dell-aldila` (cimitero), `re-klaudio` (pesca con sconto), `margherita` (sconto su Grappolaccio). | Ogni file ha un commento che spiega perché è custom; test per carta. |

### 1F. Contenuti
| Id | Task | Fatto quando |
|---|---|---|
| T1.15 | Compilare `effects` per tutte le carte di `data/cards.json`, divise per fazione (Ufficio, Soci & Nemici, Neutrali). | Test: ogni carta con `text` non vuoto ha almeno un effetto; un test di integrazione per carta (giocata → stato atteso). |
| T1.16 | Poteri eroe dei 9 eroi: costo 2, una volta per turno. *Alza lo scudo* ha una scelta: azione con `option`. | Un test per eroe. |
| T1.17 | Mazzi precostruiti in `data/decks.json`, uno per eroe. | Test: ogni mazzo passa `validateDeck`. |

### 1G. Viste e strumenti
| Id | Task | Fatto quando |
|---|---|---|
| T1.18 | `getPlayerView(state, playerId)`: mano e mazzo avversari ridotti a conteggi, seed RNG rimosso. | Test che nessun campo segreto compare nella vista. |
| T1.19 | Determinismo: stesso seed + stesse azioni → stesso stato. | Test con confronto degli snapshot. |
| T1.20 | CLI `npm run simulate` (cross-platform, `tsx`): partita con mosse legali casuali, log leggibile. | Il comando termina con un vincitore su 100 seed diversi. |

**Uscita da M1**: `npm test` e `npm run typecheck` verdi.

---

## M2 — Bot

| Id | Task | Fatto quando |
|---|---|---|
| T2.1 | Bot `random` (scelta uniforme tra le azioni legali), riusato dalla CLI. | Interfaccia `Bot` comune nell'engine o in un pacchetto `bot`. |
| T2.2 | Bot `greedy`: euristica su ferie, campo e mano, sceglie la migliore azione a un passo. | Batte `random` in più del 70% delle partite. |
| T2.3 | `npm run botmatch -- --games N`: winrate per eroe e per matchup, durata media, carte più giocate. Seed riproducibili. | Report stampato a terminale e in JSON. |
| T2.4 | Fuzz: migliaia di partite casuali con invarianti (nessuna eccezione, max 7 servitori, mano ≤ 10, partita conclusa entro N turni). | Ogni crash trovato diventa un test di regressione. |
| T2.5 | Primo giro di bilanciamento dei numeri in `cards.json`. | Nessun eroe sotto il 40% o sopra il 60% di winrate; modifiche annotate nel GDD §8. |

---

## M3 — Server (Colyseus)

| Id | Task | Fatto quando |
|---|---|---|
| T3.1 | Setup Colyseus. `GameRoom` tiene il `GameState` dell'engine; ai client arriva la vista filtrata come messaggio, non uno schema sincronizzato. | Il server si avvia con `npm run dev:server`. |
| T3.2 | Stanza privata con codice invito / link; scelta eroe e mazzo precostruito. | Due client entrano con lo stesso codice. |
| T3.3 | Loop: il client manda un'`Action` → `applyAction` → a ogni giocatore la sua `getPlayerView` più gli eventi. Le azioni illegali vengono rifiutate. | Test: un'azione illegale non cambia lo stato. |
| T3.4 | Timer di 75 s per turno: allo scadere viene eseguito `end_turn` automatico. | Test con clock simulato. |
| T3.5 | Riconnessione entro il timer; l'abbandono vale come sconfitta. | Test di disconnessione e riconnessione. |
| T3.6 | Test di integrazione: 2 bot giocano una partita intera passando dal server. | Test verde in CI. |

---

## M4 — Client (React + Vite)

| Id | Task | Fatto quando |
|---|---|---|
| T4.1 | Init React + Vite, connessione Colyseus, schermata crea / unisciti con codice. | `npm run dev:client` apre la lobby. |
| T4.2 | Plancia funzionale: mano, scrivanie, eroi, caffettini, potere eroe, log. Mosse legali evidenziate con `getLegalActions` sulla vista. | Partita completa giocabile tra due browser. |
| T4.3 | Interazioni: giocare carte (click o drag), scegliere il bersaglio, attaccare, mulligan, Scopri (1 tra 3). | Tutte le azioni dell'engine raggiungibili dall'interfaccia. |
| T4.4 | Fine partita, riconnessione nell'interfaccia, timer visibile. | Ricaricare la pagina riporta alla partita. |
| T4.5 | Passata estetica: frame delle carte, animazioni di danno e morte, tema "ufficio". | Revisione visiva approvata. |

---

## M5 — Contenuti e persistenza

| Id | Task | Fatto quando |
|---|---|---|
| T5.1 | Arte delle carte ritagliata da `assets/albi/` e ritratti degli eroi (conferma avatar 3–8). **Serve il consenso dell'autore.** | Ogni carta ha `art` valorizzato. |
| T5.2 | Audio: sigle come musica di sottofondo. | Musica attivabile e disattivabile. |
| T5.3 | Postgres: utenti, mazzi personalizzati (deck builder con `validateDeck`), storico partite salvato come seed + azioni, quindi rigiocabile come replay. | Una partita salvata si rigioca identica. |
| T5.4 | Classifica. | Pagina classifica con i dati reali. |
| T5.5 | Nuove carte dalla lore di `dottorscudo-albi.json`. | Nuove carte con test e bilanciamento bot. |

---

## Dipendenze

```
T0 → 1A → 1B → 1C → 1D ‖ 1E → 1F → 1G → M2 → M3 → M4 → M5
```

Si possono fare in parallelo: le keyword di T1.10, le fazioni di T1.15, i task T4.x dopo che T3.3 è stabile.
