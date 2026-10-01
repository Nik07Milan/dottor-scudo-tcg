import cardsJson from "../../../data/cards.json";
import heroesJson from "../../../data/heroes.json";
import keywordsJson from "../../../data/keywords.json";
import type { CardDefinition, HeroDefinition, KeywordDefinition } from "./types";

export const CARDS = cardsJson as CardDefinition[];
export const HEROES = heroesJson as HeroDefinition[];
export const KEYWORDS = keywordsJson as KeywordDefinition[];

export const CARDS_BY_ID: ReadonlyMap<string, CardDefinition> = new Map(CARDS.map((c) => [c.id, c]));
export const HEROES_BY_ID: ReadonlyMap<string, HeroDefinition> = new Map(HEROES.map((h) => [h.id, h]));
