// Avvio del server autoritativo (M3): `npm run dev:server`. Porta da PORT, default 2567.
// Variabili da packages/server/.env se c'è (vedi .env.example): con Supabase configurato
// ci sono account, mazzi salvati e storico (T5.3), altrimenti si gioca come ospiti.
import { existsSync } from "node:fs";
import { server } from "./app";
import { DEFAULT_PORT } from "./config";
import { configureStore } from "./room";
import { storeFromEnv } from "./supabase-store";

if (existsSync(".env")) process.loadEnvFile(".env");

const store = storeFromEnv();
configureStore(store);

const port = Number(process.env.PORT ?? DEFAULT_PORT);
await server.listen(port);
console.log(`DottorScudo TCG — server in ascolto su ws://localhost:${port}`);
console.log(store ? "Supabase configurato: account, mazzi e storico attivi." : "Supabase non configurato: solo ospiti e mazzi precostruiti.");
