// Registro degli effetti `custom` (CLAUDE.md, principio 3): codice specifico per una carta solo quando
// il DSL non basta. Ogni handler sta in un file `<handler>.ts` in questa cartella, con un commento che
// spiega perché il DSL non è sufficiente, e va registrato qui. Gli handler arrivano in T1.14.

import type { Ctx } from "../../context";
import type { EffectSource } from "../../effects";

export type CustomHandler = (ctx: Ctx, source: EffectSource) => void;

export const CUSTOM_HANDLERS: Readonly<Record<string, CustomHandler>> = {};
