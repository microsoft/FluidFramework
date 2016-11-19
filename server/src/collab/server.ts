import { default as shareDb } from './db';
var WebSocket = require('ws');
var WebSocketJSONStream = require('websocket-json-stream');

// Initializes a new web socket collab server
export function initialie(server) {
    let webSocketServer = new WebSocket.Server({ server: server });
    webSocketServer.on('connection', (ws, req) => {
        let stream = new WebSocketJSONStream(ws);
        shareDb.listen(stream);
    });
}