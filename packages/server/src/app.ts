// Definizione del server (T3.1): una sola stanza, `game`. Usata da index.ts e dai test di integrazione.
import { defineRoom, defineServer } from "colyseus";
import { ROOM_NAME } from "./protocol";
import { GameRoom } from "./room";

export const server = defineServer({
  rooms: {
    [ROOM_NAME]: defineRoom(GameRoom),
  },
});
