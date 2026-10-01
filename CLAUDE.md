# CLAUDE.md — DottorScudo TCG

Gioco di carte multiplayer online simil Hearthstone basato sul fumetto *Dottor Scudo*.
Leggi sempre `docs/GDD.md` prima di implementare regole o carte: è la fonte di verità del design.
Lingua: codice e identificatori in inglese, testi di gioco e documentazione in italiano.

## Struttura (npm workspaces, TypeScript strict)

```
packages/engine   motore delle regole: puro, deterministico, senza I/O né UI
packages/server   server autoritativo Colyseus (Node) che usa l'engine
packages/client   client Phaser + Vite
data/             cards.json, heroes.json, keywords.json, dottorscudo-albi.json (lore)
assets/           avatar/ e albi/ (immagini sorgente, non modificarle)
docs/GDD.md       game design document
```

## Principi architetturali (non negoziabili)
1. **L'engine è un reducer puro**: `applyAction(state, action) -> { state, events }`. Niente `Math.random`, niente `Date.now`, niente I/O.
2. **Casualità con RNG a seed** salvato nello stato (`state.rng`). Stessa sequenza di azioni + stesso seed = stessa partita. Serve per test, replay e anti-cheat.
3. **Le carte sono dati**: gli effetti si descrivono in `data/cards.json` con il tipo `Effect` (piccolo DSL in `packages/engine/src/types.ts`). Codice specifico per una carta solo se il DSL non basta, in `packages/engine/src/cards/custom/` con un commento che spiega perché.
4. **Il server è l'unica autorità**: valida ogni azione con l'engine. Il client usa l'engine solo per mostrare le mosse legali. Unica eccezione: partite contro l'IA e tutorial girano interamente nel client (`LocalMatch`, `TutorialMatch`), perché non c'è nessuno da imbrogliare; non contano per storico e classifica.
5. **Viste filtrate**: `getPlayerView(state, playerId)` nasconde mano e mazzo avversari e il seed RNG. Mai inviare lo stato completo al client.
6. **Validazione**: `getLegalActions(state, playerId)` è la fonte unica di cosa si può fare. `applyAction` rifiuta tutto il resto.
7. **Phaser solo presentazione**: nessuna regola né stato di partita nelle scene. Gli eventi dell'engine diventano animazioni; la vista ricevuta dal server vince sempre.

## Milestone
- **M1 — Engine**: tipi, stato iniziale, turni, caffettini, pesca, burnout, combattimento, tutte le keyword, DSL degli effetti, compilazione di `effects` per tutte le carte, poteri eroe, mazzi precostruiti. Test Vitest per ogni regola e ogni keyword. CLI che simula una partita.
- **M2 — Bot**: IA semplice (greedy) + script bot-contro-bot che gioca N partite e stampa winrate per eroe. Serve per scovare bug e bilanciare.
- **M3 — Server**: Colyseus, stanze con codice invito, stato filtrato per giocatore, timer 75s, riconnessione, abbandono.
- **M4 — Client**: Phaser + Vite, plancia giocabile (mano, scrivanie, eroi, caffettini, log), prima funzionale poi estetica.
- **M5 — Contenuti e persistenza**: arte delle carte, sigle come musica, Postgres per utenti/mazzi/storico, classifica.

Non passare alla milestone successiva finché la precedente non ha test verdi.

## Comandi
- `npm install` — installa tutti i workspace
- `npm test` — test dell'engine
- `npm run typecheck` — typecheck di tutti i pacchetti
- `npm run simulate -- --seed 42` — una partita tra bot casuali con il log; `--games 100` per il riepilogo, `--p1 <eroe> --p2 <eroe>` per scegliere gli eroi
- `npm run botmatch -- --games 162` — bot contro bot (default greedy contro greedy): winrate per eroe e scontro, durata, carte più giocate; `--bots greedy,random`, `--json report.json`
- `npm run dev:server` / `npm run dev:client` — server su ws://localhost:2567, client su http://localhost:5173
- `npm run e2e` — prove end-to-end nel browser (due giocatori, ricarica pagina, contro l'IA, tutorial); richiede server e client avviati e Chrome installato (`E2E_CHANNEL=chromium` per il Chromium di Playwright). `npm run e2e:solo --workspace=@dottorscudo/client`: solo IA e tutorial, basta il client

## Convenzioni
- Id carte ed eroi: slug kebab-case (es. `uomo-sasso`), stabili: non rinominarli dopo M1.
- Ogni bug trovato → prima un test che lo riproduce, poi la correzione.
- Ambiente di sviluppo: Windows. Script npm cross-platform (niente `rm -rf`, niente comandi bash nei package.json).
