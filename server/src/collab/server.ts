import * as WebSocketJSONStream from "websocket-json-stream";
import * as WebSocket from "ws";
import { default as shareDb } from "./db";

// Initializes a new web socket collab server
export function initialize(server) {
    let webSocketServer = new WebSocket.Server({ server });
    webSocketServer.on("connection", (ws, req) => {
        let stream = new WebSocketJSONStream(ws);
        shareDb.listen(stream);
    });
}
