// Avvio del server autoritativo (M3): `npm run dev:server`. Porta da PORT, default 2567.
import { server } from "./app";
import { DEFAULT_PORT } from "./config";

const port = Number(process.env.PORT ?? DEFAULT_PORT);
await server.listen(port);
console.log(`DottorScudo TCG — server in ascolto su ws://localhost:${port}`);
