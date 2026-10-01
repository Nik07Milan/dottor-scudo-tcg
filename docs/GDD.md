# DottorScudo TCG — Game Design Document (v0.3)

Gioco di carte 1 contro 1, multiplayer online, ispirato al fumetto *Dottor Scudo*
(dottorscudo.guidomoroni.com). Struttura e ritmo alla Hearthstone, contenuti dalla lore dell'ufficio.

## 1. Regole base

| Regola | Nome a tema | Valore |
|---|---|---|
| Risorsa | **Caffettini** | 1 al primo turno, +1 a turno, max 10 |
| Bonus secondo giocatore | **Caffettino** (token) | +1 risorsa per un solo turno |
| Punti vita eroe | **Ore di ferie** | 30 (omaggio all'albo #120) |
| Mazzo | — | 30 carte, max 2 copie, 1 per le Leggendarie |
| Mano iniziale | — | 3 carte (primo) / 4 carte + Caffettino (secondo), con mulligan |
| Campo | **Scrivanie** | max 7 servitori per lato |
| Mazzo vuoto | **Burnout** | 1, 2, 3… danni a ogni pesca a vuoto |
| Mano piena | — | max 10 carte; le carte in eccesso vengono scartate |
| Timer | — | 75 secondi per turno |

A zero ore di ferie si perde. Pareggio se entrambi gli eroi scendono a zero nello stesso momento.

### Turno
1. Inizio turno: +1 caffettino massimo (fino a 10), caffettini ricaricati, pesca 1 carta, trigger di inizio turno.
2. Fase principale: gioca carte, usa il potere eroe (1 volta per turno), attacca con servitori ed eroe.
3. Fine turno: trigger di fine turno, passa il turno.

Un servitore non può attaccare nel turno in cui entra in campo (salvo **Urgente**, che consente di attaccare solo servitori).
Ogni servitore attacca una volta per turno. In combattimento i due bersagli si infliggono danni a vicenda.

## 2. Tipi di carta
- **Colleghi** — servitori (attacco / vita).
- **Pratiche** — magie a effetto immediato.
- **Strumenti** — armi dell'eroe (attacco / durabilità, -1 durabilità per attacco).
- **Luoghi** — previsti dopo la v1.

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

## 4. Fazioni ed eroi
Due fazioni: **Ufficio** (i colleghi) e **Soci & Nemici**. Ogni eroe può usare le carte della propria fazione,
le carte *firma* proprie (`signatureOf`) e le carte **Neutrali**.

Eroi v1 (vedi `data/heroes.json`):
- Ufficio: Dottor Scudo, Nikson, Jackson, Milet, Ale, Il Creatore
- Soci & Nemici: Dr Grappolo, Il Calabrone, Lord Capognus

Ogni potere eroe costa 2 caffettini.

## 5. Set di carte
Vedi `data/cards.json` (51 carte incluse i token). Le carte con rarità `token` non si mettono nel mazzo:
vengono generate da altri effetti.

## 6. Mazzi precostruiti v1
Da definire in Milestone 1: un mazzo da 30 per ciascun eroe, composto da carte di fazione + firma + neutrali.
Il set attuale potrebbe non bastare per 30 carte uniche per fazione: si accettano 2 copie di comuni/rare/epiche.

## 7. Multiplayer
- Partite su invito (codice stanza / link). Niente matchmaking pubblico in v1.
- Server autoritativo: il client invia azioni, il server valida con l'engine e manda a ogni giocatore la propria vista (mano e mazzo avversario nascosti).
- Riconnessione entro il timer del turno; abbandono = sconfitta.

## 8. Questioni aperte
- Conferma avatar ↔ personaggi (avatar 3–8).
- Conferma ruoli: chi è in ufficio e chi è socio.
- Bilanciamento: tutti i numeri sono provvisori, da tarare con le partite bot-contro-bot.
- Arte: ritagli dalle tavole in `assets/albi/`; consenso dell'autore per l'uso delle immagini.
