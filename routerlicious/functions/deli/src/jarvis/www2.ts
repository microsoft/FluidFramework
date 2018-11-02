import * as ws from "ws";

const server = new ws.Server({ port: 4040 });

// Connections will arrive from remote nodes
server.on("connection", (socket) => {
    console.log("Inbound WS connection");

    // Messages will be inbound from the remote server
    socket.on("message", (message) => {
        socket.send(message);
    });
});
