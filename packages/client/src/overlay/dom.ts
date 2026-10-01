// Overlay HTML sopra il canvas (T5.3): liste, filtri e moduli vengono meglio in HTML che in Phaser.
// Gli elementi si aggiungono con scene.add.dom, così scalano con il gioco e spariscono con la scena.
// Solo presentazione: dati e regole arrivano dall'engine e da Supabase.

const CSS = `
.ds-ui { font-family: 'Trebuchet MS', 'Segoe UI', sans-serif; color: #f4eedc; box-sizing: border-box; }
.ds-ui * { box-sizing: border-box; font-family: inherit; }
.ds-panel { background: #3b4252; border: 2px solid #d8b26a; border-radius: 12px; padding: 10px 12px; }
.ds-row { display: flex; gap: 8px; align-items: center; }
.ds-col { display: flex; flex-direction: column; gap: 8px; }
.ds-muted { color: #a9b0bf; font-size: 13px; }
.ds-error { color: #ff8a7a; font-size: 13px; }
.ds-ui input, .ds-ui select { background: #f4eedc; color: #22262f; border: 2px solid #d8b26a; border-radius: 8px; padding: 6px 8px; font-size: 15px; min-width: 0; }
.ds-ui button { background: #d8b26a; color: #22262f; border: none; border-radius: 8px; padding: 7px 12px; font-size: 15px; font-weight: bold; cursor: pointer; }
.ds-ui button:hover { filter: brightness(1.08); }
.ds-ui button:disabled { opacity: 0.45; cursor: default; filter: none; }
.ds-ui button.ds-secondary { background: #5a6274; color: #f4eedc; }
.ds-ui button.ds-danger { background: #e05a47; color: #f4eedc; }
.ds-link { background: none !important; color: #d8b26a !important; padding: 0 !important; text-decoration: underline; font-weight: normal !important; }
`;

let injected = false;

/** Inserisce una volta sola il foglio di stile degli overlay. */
export function ensureStyles(): void {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.append(style);
}

type Child = Node | string | null | undefined | false;

/** Piccolo helper per creare elementi: el("button", { class: "x", onclick }, "Testo"). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, unknown>> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = String(value);
    else if (key === "style") node.setAttribute("style", String(value));
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2), value as EventListener);
    else if (key in node) (node as unknown as Record<string, unknown>)[key] = value;
    else node.setAttribute(key, String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}
