import { CARDS, HEROES } from "@dottorscudo/engine";
import { describe, expect, it } from "vitest";
import { assetUrl, heroPortrait } from "../src/ui/art";

describe("arte (T5.1)", () => {
  it("ogni carta con `art` trova la sua immagine negli assets", () => {
    for (const c of CARDS.filter((c) => c.art)) expect(assetUrl(c.art), `${c.id}: ${c.art}`).not.toBeNull();
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
