import { CARDS, HEROES } from "@dottorscudo/engine";
import { describe, expect, it } from "vitest";
import { assetUrl, heroPortrait } from "../src/ui/art";

describe("arte (T5.1)", () => {
  it("ogni carta, token compresi, ha `art` e trova la sua immagine negli assets", () => {
    for (const c of CARDS) expect(assetUrl(c.art), `${c.id}: ${c.art}`).not.toBeNull();
  });

  it("hanno un ritratto confermato tutti gli eroi tranne Il Creatore e Il Calabrone (senza avatar)", () => {
    const withPortrait = HEROES.filter((h) => h.portraitConfirmed).map((h) => h.id);
    expect(withPortrait.sort()).toEqual(["ale", "dottor-scudo", "dr-grappolo", "jackson", "lord-capognus", "milet", "nikson"]);
  });

  it("i ritratti confermati trovano la loro immagine, quelli non confermati non si usano", () => {
    for (const h of HEROES) {
      if (h.portraitConfirmed) expect(heroPortrait(h.id), h.id).not.toBeNull();
      else expect(heroPortrait(h.id), h.id).toBeNull();
    }
  });

  it("un percorso inesistente o assente dà null", () => {
    expect(assetUrl("assets/albi/albo-999.webp")).toBeNull();
    expect(assetUrl(null)).toBeNull();
  });
});
