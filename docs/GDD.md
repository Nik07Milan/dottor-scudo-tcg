# DottorScudo TCG — Game Design Document (v0.4)

Gioco di carte 1 contro 1, multiplayer online, ispirato al fumetto *Dottor Scudo*
(dottorscudo.guidomoroni.com). Struttura e ritmo alla Hearthstone, contenuti dalla lore dell'ufficio.

Quando una regola non è scritta qui, vale il comportamento di Hearthstone; se emerge un caso nuovo,
va aggiunto a questo documento prima di implementarlo.

## 1. Regole base

| Regola | Nome a tema | Valore |
|---|---|---|
| Risorsa | **Caffettini** | 1 al primo turno, +1 a turno, max 10 |
| Bonus secondo giocatore | **Caffettino** (token) | +1 risorsa per un solo turno |
| Punti vita eroe | **Ore di ferie** | 30 (omaggio all'albo #120); è anche il massimo |
| Armatura | **Armatura** | nessun limite; assorbe i danni prima delle ferie |
| Mazzo | — | 30 carte, max 2 copie, 1 per le Leggendarie |
| Mano iniziale | — | 3 carte (primo) / 4 carte + Caffettino (secondo), con mulligan |
| Campo | **Scrivanie** | max 7 servitori per lato |
| Mazzo vuoto | **Burnout** | 1, 2, 3… danni a ogni pesca a vuoto |
| Mano piena | — | max 10 carte; le carte in eccesso vengono scartate |
| Timer | — | 75 secondi per turno, 45 secondi per il mulligan |
| Limite partita | — | 90 turni totali (45 a testa): poi pareggio |

A zero ore di ferie si perde. Pareggio se entrambi gli eroi scendono a zero nello stesso momento.

### 1.1 Inizio partita e mulligan
1. Il primo giocatore è scelto con l'RNG della partita.
2. Il primo giocatore pesca 3 carte, il secondo 4.
3. **Mulligan** (simultaneo, una sola volta): ogni giocatore sceglie quali carte della mano iniziale
   rimettere nel mazzo (anche nessuna o tutte). Pesca prima lo stesso numero di carte nuove,
   poi le carte scartate vengono rimescolate nel mazzo: non si può ripescare una carta appena rimessa.
4. Allo scadere dei 45 secondi chi non ha scelto tiene la mano.
5. Dopo il mulligan il secondo giocatore riceve il **Caffettino** in mano (non è soggetto a mulligan).
6. Inizia il primo turno del primo giocatore.

### 1.2 Turno
1. **Inizio turno**: +1 caffettino massimo (fino a 10), caffettini ricaricati, pesca 1 carta,
   poi i trigger di inizio turno.
2. **Fase principale**: gioca carte, usa il potere eroe (1 volta per turno), attacca con servitori ed eroe,
   in qualsiasi ordine.
3. **Fine turno**: trigger di fine turno, i caffettini temporanei non spesi si perdono, passa il turno.
   Allo scadere del timer il turno finisce in automatico (se c'è una scelta in sospeso, vedi §3.2).

Caffettini temporanei (Caffettino, effetti `gain_mana` temporanei): si sommano ai caffettini disponibili
fino a un massimo di 10 disponibili, durano fino a fine turno.

Costi: i modificatori di costo si sommano; il costo non scende mai sotto 0. Uno sconto legato a una carta
specifica in mano (es. *Re Klaudio*, *Fuga dalla riunione*) resta su quella carta finché non viene giocata.

### 1.3 Combattimento
- Un servitore non può attaccare nel turno in cui entra in campo (salvo **Urgente**, che consente di attaccare
  solo servitori). Ogni servitore attacca una volta per turno. Un servitore con 0 attacco non può attaccare.
- In combattimento attaccante e difensore si infliggono danni a vicenda, contemporaneamente.
- **Burocrazia** vincola ogni attacco (di servitori ed eroe), non le Pratiche né i poteri eroe.

### 1.4 Eroe, Strumenti e armatura
- L'eroe attacca solo se ha attacco > 0, cioè con uno **Strumento** equipaggiato (o con effetti che gli danno attacco).
  Attacca una volta per turno, solo nel proprio turno; *Tatine-mobile* porta il limite a due.
- L'eroe può attaccare servitori ed eroe avversario fin dal turno in cui equipaggia lo Strumento.
- Quando attacca un servitore, l'eroe subisce il danno del difensore (l'armatura assorbe per prima).
- Ogni attacco dell'eroe toglie 1 durabilità allo Strumento; a 0 lo Strumento è distrutto.
  Giocare un nuovo Strumento distrugge quello equipaggiato.
- **Armatura**: si accumula senza limite e resta tra un turno e l'altro. Ogni danno all'eroe toglie prima
  armatura, poi ferie. Il burnout passa anch'esso dall'armatura.
- **Rigenera N ferie**: cura fino a un massimo di 30 ferie; non dà armatura.

### 1.5 Danni, morti e ordine di risoluzione
Il motore risolve tutto in modo deterministico, senza scelte implicite.

1. **Un'azione alla volta**. Ogni azione del giocatore (giocare una carta, attaccare, potere eroe, fine turno)
   viene risolta per intero prima della successiva.
2. **Giocare un servitore**: si pagano i caffettini, la carta lascia la mano, il servitore entra in campo
   nella posizione scelta, poi si risolve il suo **Deploy**, poi i trigger "quando evochi" (es. progresso Task).
3. **Giocare una Pratica**: si pagano i caffettini, la carta lascia la mano, si risolve l'effetto,
   poi i trigger "quando giochi una Pratica" (es. progresso Task).
4. **Danni**: i danni di un singolo effetto (es. danno a tutti i servitori) si applicano tutti insieme.
   Poi scattano i trigger "quando subisce danni" (solo se il danno effettivo è > 0: un danno annullato da
   Scudato non conta).
5. **Fase morti**: dopo ogni effetto completo (non a metà effetto) tutti i servitori con vita ≤ 0 muoiono
   insieme. Escono dal campo e i loro **Ultimo sorso** si risolvono nell'ordine sotto. Se questo produce
   nuovi danni o morti, si ripete finché lo stato è stabile. "Effetto completo" = tutta la risoluzione
   di una carta, di un potere o di un trigger. Nel frattempo un servitore distrutto o già a vita ≤ 0
   non è più bersaglio degli effetti successivi (non può essere curato o potenziato per salvarlo).
   Gli evocati da un servitore entrano alla sua destra; quelli evocati da una Pratica in fondo a destra.
6. **Ordine dei trigger simultanei**: prima quelli del giocatore di turno, poi dell'avversario;
   a parità, in ordine di entrata in gioco (il più vecchio prima). Le carte con effetti contrapposti
   seguono lo stesso ordine.
7. **Fine partita**: dopo la fase morti si controllano gli eroi. Uno solo a 0 → perde; entrambi a 0 → pareggio.
   Un eroe a 0 a metà effetto non interrompe l'effetto.
8. **Catene infinite**: se una singola azione genera più di 200 passi di risoluzione, il motore si ferma
   e la partita finisce in pareggio. Serve solo come rete di sicurezza: nessuna carta attuale dovrebbe arrivarci.

### 1.6 Spazio pieno
- **Campo pieno** (7): un servitore in più non viene evocato; la carta servitore non si può giocare.
  Prendere il controllo di un servitore con il proprio campo pieno non ha effetto.
- **Mano piena** (10): una carta pescata, generata o rimandata in mano viene scartata (visibile a entrambi).
  Un servitore rimandato in mano a mano piena viene rimosso senza attivare l'Ultimo sorso.

## 2. Tipi di carta
- **Colleghi** — servitori (attacco / vita).
- **Pratiche** — magie a effetto immediato.
- **Strumenti** — armi dell'eroe (attacco / durabilità, -1 durabilità per attacco).
- **Luoghi** — previsti dopo la v1.

### 2.1 Glossario dei testi
| Termine | Significato |
|---|---|
| Collega / servitore | Sinonimi: qualsiasi servitore in campo, di qualsiasi fazione. "Colleghi dell'Ufficio" filtra per fazione. |
| Evoca | Mette un servitore in campo senza giocarlo: niente Deploy. |
| Rimanda in mano | Il servitore torna in mano al proprietario come carta base: perde buff, danni e keyword ottenute. |
| Prendi il controllo | Il servitore passa sul tuo campo; non può attaccare in questo turno (salvo Urgente). |
| Copia N/N | Nuovo servitore con id, testo e keyword base dell'originale, ma statistiche N/N; non copia buff. |
| Distruggi | Il servitore muore (si attiva l'Ultimo sorso); Scudato non lo impedisce. |
| Casuale | Scelto con l'RNG della partita, tra i bersagli validi. |

## 3. Keyword

| Keyword | Equivalente | Effetto |
|---|---|---|
| Deploy | Grido di battaglia | Effetto quando la carta viene giocata dalla mano |
| Burocrazia | Provocazione | I nemici devono attaccare prima questo servitore |
| Scudato | Scudo divino | Il primo danno subito viene ignorato |
| Urgente | Assalto | Può attaccare servitori nel turno in cui entra |
| Smart working | Furtività | Non bersagliabile finché non attacca |
| Mani in merda | Veleno | Distrugge qualunque servitore a cui infligge danni |
| Ultimo sorso | Rantolo di morte | Effetto quando muore |
| Bloccato in riunione | Congelato | Non può attaccare nel suo prossimo turno |
| Task | Missione | Obiettivo con ricompensa |

### 3.1 Dettagli delle keyword
- **Burocrazia**: se l'avversario ha servitori con Burocrazia *bersagliabili*, gli attacchi devono colpire uno di
  loro. Un servitore con Burocrazia e Smart working non obbliga nessuno.
- **Scudato**: la prima istanza di danno (> 0) viene annullata e lo Scudato si perde. Non protegge da
  Distruggi. Annulla anche il danno di un attaccante con Mani in merda, quindi niente distruzione.
- **Urgente**: nel turno in cui entra (o in cui ne prendi il controllo) può attaccare solo servitori;
  dal turno dopo è un servitore normale.
- **Smart working**: non può essere scelto come bersaglio da carte, poteri eroe o attacchi **avversari**.
  Subisce normalmente gli effetti ad area e quelli casuali. Si perde quando il servitore attacca.
- **Mani in merda**: se il servitore infligge danno > 0 a un servitore (in attacco, in difesa o con un effetto),
  quel servitore è distrutto. Sugli eroi non ha effetto extra.
- **Bloccato in riunione (N turni)**: il servitore ha un contatore N (default 1). Finché è > 0 non può attaccare.
  Il contatore scende di 1 alla fine di ogni turno del proprietario, esclusi i turni in cui è stato
  bloccato, quindi un blocco subito durante il proprio turno non si esaurisce subito. Un nuovo blocco
  tiene il valore più alto tra il contatore attuale e il nuovo N, senza sommarli. Si applica solo ai servitori.
- **Deploy**: solo se la carta è giocata dalla mano, non se evocata o copiata.
- **Ultimo sorso**: si attiva quando il servitore muore in campo (vedi §1.5); il proprietario è chi lo controllava
  al momento della morte.

### 3.2 Scopri
"Scopri una X" mostra al giocatore **3 carte diverse** pescate a caso (RNG della partita) dal pool:
- carte non token che rispettano il filtro del testo (es. "Pratica dell'Ufficio");
- escluse le carte firma di altri eroi; incluse le proprie carte firma e le Neutrali se il filtro le ammette.

Se il pool ha meno di 3 carte, si offrono tutte quelle disponibili. La carta scelta va in mano
(con mano piena viene scartata). Finché la scelta è in sospeso l'unica azione legale è `choose`;
allo scadere del timer si sceglie a caso con l'RNG. Le opzioni non scelte sono nascoste all'avversario.

### 3.3 Task
- Una Task è una Pratica: si gioca pagando il costo e va nella **zona Task** del giocatore (non in campo).
- Massimo **una Task attiva** per giocatore: con una Task attiva non se ne possono giocare altre.
- Il progresso conta solo le azioni del proprietario **dopo** che la Task è stata giocata
  (la Task stessa non conta). Il progresso è **pubblico**: entrambi i giocatori vedono la Task e il contatore.
- *Le Task* — "Gioca 5 Pratiche": conta le Pratiche giocate dalla mano.
- *Progetto Nettuno* — "Evoca 6 servitori": conta ogni servitore che entra nel tuo campo, giocato o evocato
  (token compresi); non conta quelli di cui prendi il controllo.
- Al completamento la ricompensa si risolve **subito** e la Task lascia la zona:
  *Ferie arretrate* rigenera 10 ferie; *Nettuno* 8/8 con Burocrazia viene evocato (con campo pieno va in mano).

## 4. Fazioni ed eroi
Due fazioni: **Ufficio** (i colleghi) e **Soci & Nemici**. Ogni eroe può usare le carte della propria fazione,
le carte *firma* proprie (`signatureOf`) e le carte **Neutrali**.

Eroi v1 (vedi `data/heroes.json`):
- Ufficio: Dottor Scudo, Nikson, Jackson, Milet, Ale, Il Creatore
- Soci & Nemici: Dr Grappolo, Il Calabrone, Lord Capognus

Ogni potere eroe costa 2 caffettini e si usa una volta per turno. Un potere con una scelta
(*Alza lo scudo*: Scudato oppure 2 armatura) si dichiara al momento dell'uso. Un potere che richiede
un bersaglio non si può usare se non ci sono bersagli validi.

## 5. Set di carte
Vedi `data/cards.json` (60 carte incluse i token). Le carte con rarità `token` non si mettono nel mazzo:
vengono generate da altri effetti.

### 5.1 Carte aggiunte in v0.4
Il set v0.3 non permetteva un mazzo legale ad Ale (28 carte massime) e a Nikson (29), e i mazzi dell'Ufficio
avevano 8–11 slot per servitori su 30, perché le Neutrali erano tutte Pratiche. Aggiunte 8 carte dagli albi non ancora usati:

| Carta | Fazione | Tipo | Costo | Stat | Testo | Albo |
|---|---|---|---|---|---|---|
| Piccione urbano | Neutrale | Collega, comune | 1 | 2/1 | — | #71 |
| Cliente insistente | Neutrale | Collega, comune | 2 | 2/2 | Urgente | #97 |
| Pinguino glaciale | Neutrale | Collega, comune | 3 | 2/3 | Deploy: un servitore nemico è Bloccato in riunione | #101 |
| L'Uomo Rana | Neutrale | Collega, rara | 4 | 3/5 | Deploy: 1 danno a tutti gli altri servitori | #29 |
| La fila del giovedì | Neutrale | Collega, comune | 5 | 4/6 | Burocrazia | #73 |
| Il Cannellone | Ufficio | Collega, rara | 3 | 3/3 | Ultimo sorso: pesca una carta | #70 |
| Bici fiammante | Ufficio, firma Ale | Strumento, rara | 3 | 2/2 | Dopo che il tuo eroe attacca, pesca una carta | #57, #99 |
| I dogmi del Calabrone | Soci, firma Il Calabrone | Pratica, comune | 2 | — | 2 danni all'eroe nemico, pesca una carta | #103, #104 |

Numeri provvisori come il resto del set: da tarare con le partite bot-contro-bot (M2).

## 6. Mazzi precostruiti v1
Un mazzo da 30 per ciascun eroe in `data/decks.json` (formato `id carta → copie`), composto da carte di
fazione + firma + neutrali, con 2 copie di comuni/rare/epiche e 1 di ogni leggendaria, 14–18 servitori.
Identità: Dottor Scudo (Scudato e armatura), Nikson (Sassi), Jackson (danni ad area), Milet (Pratiche e cure),
Ale (Deploy da rigiocare), Il Creatore (Scopri), Dr Grappolo (evocazioni), Il Calabrone (danni all'eroe),
Lord Capognus (controllo). Composizioni provvisorie, da tarare con i bot (M2).

Carte disponibili per eroe con il set v0.4 (slot = 2 per carta, 1 per leggendaria). Il test
`mazzi possibili per eroe` in `packages/engine/test/data.test.ts` richiede almeno 30 slot totali e 15 per servitori.

| Eroe | Fazione | Carte uniche | Slot totali | Slot servitori | Carte firma |
|---|---|---|---|---|---|
| Dottor Scudo | Ufficio | 23 | 43 | 21 | 3 |
| Nikson | Ufficio | 22 | 41 | 23 | 2 |
| Jackson | Ufficio | 22 | 42 | 22 | 2 |
| Milet | Ufficio | 22 | 42 | 22 | 2 |
| Ale | Ufficio | 22 | 42 | 20 | 2 |
| Il Creatore | Ufficio | 23 | 43 | 20 | 3 |
| Dr Grappolo | Soci & Nemici | 25 | 44 | 26 | 2 |
| Il Calabrone | Soci & Nemici | 24 | 43 | 23 | 1 |
| Lord Capognus | Soci & Nemici | 24 | 42 | 24 | 1 |

I Soci non hanno Strumenti: è una scelta di identità (nessun eroe dei Soci attacca da sé), da rivedere dopo M2.

## 7. Multiplayer
- Partite su invito (codice stanza / link). Niente matchmaking pubblico in v1.
- Server autoritativo: il client invia azioni, il server valida con l'engine e manda a ogni giocatore la propria vista (mano e mazzo avversario nascosti).
- Riconnessione entro il timer del turno; abbandono = sconfitta.

## 8. Questioni aperte
- Conferma avatar ↔ personaggi (avatar 3–8).
- Conferma ruoli: chi è in ufficio e chi è socio.
- Bilanciamento: tutti i numeri sono provvisori, da tarare con le partite bot-contro-bot.
- Arte: ritagli dalle tavole in `assets/albi/`; consenso dell'autore per l'uso delle immagini.
