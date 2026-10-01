# data/

- `cards.json` — set di carte v0.3 (generato dal foglio `dottorscudo-tcg-carte-v0.3.xlsx`). Il campo `effects` è vuoto: va compilato nella Milestone 1 traducendo `text` nel formato `Effect` definito in `packages/engine/src/types.ts`.
- `heroes.json` — eroi giocabili con potere eroe.
- `keywords.json` — keyword a tema e loro equivalente Hearthstone.
- `dottorscudo-albi.json` — lore scaricata dal sito: 122 albi con `numero`, `saga`, `titolo`, `trama`, `sigla`, `data_pubblicazione`, `autore`, `url`. Fonte per nuove carte, testi di colore e sigle (M5). Non è usata dalle regole: l'engine non la importa, la legge solo il test che verifica i riferimenti `#N` nel campo `lore` di carte ed eroi.

## Aggiunte rispetto al foglio xlsx
Il foglio non è più l'unica fonte: queste carte esistono solo in `cards.json` e vanno riportate nel foglio se lo si rigenera.
- `nettuno` (token 8/8, Burocrazia, costo 8) — ricompensa di `progetto-nettuno`. Il costo conta se torna in mano (es. *Retcon*).
- Le 8 carte di GDD §5.1 (T0.3): `piccione-urbano`, `cliente-insistente`, `pinguino-glaciale`, `uomo-rana`, `fila-del-giovedi`, `il-cannellone`, `bici-fiammante`, `i-dogmi-del-calabrone`.

## Ricompense delle Task
Le ricompense sono **effetti**, non carte: si risolvono subito al completamento (GDD §3.3).
In T1.11 ogni carta Task avrà un campo con obiettivo, soglia ed effetti di ricompensa, per esempio:
- `le-task`: conta le Pratiche giocate, soglia 5, ricompensa *Ferie arretrate* = `{ "kind": "heal", "amount": 10, "target": "friendly_hero" }`.
- `progetto-nettuno`: conta i servitori evocati, soglia 6, ricompensa = `{ "kind": "summon", "cardId": "nettuno", "count": 1 }` (con campo pieno va in mano).

*Ferie arretrate* quindi non è una carta e non compare in `cards.json`.

## Id condivisi tra eroi e carte
`dr-grappolo`, `il-calabrone` e `lord-capognus` sono sia id di eroe (`heroes.json`) sia id di carta (`cards.json`). Non c'è conflitto: le due mappe sono separate (`HEROES_BY_ID`, `CARDS_BY_ID`).
