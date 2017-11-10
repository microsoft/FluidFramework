import { Provider } from "nconf";
import * as winston from "winston";
// import * as WebSocket from "ws";
import * as agent from "../agent";
import * as api from "../api-core";
import * as core from "../core";
import * as utils from "../utils";

// Remove (mdaumi): We need one io.

export function register(
    webSocketServer: core.IWebSocketServer,
    config: Provider,
    mongoManager: utils.MongoManager,
    producer: utils.kafkaProducer.IProducer,
    documentsCollectionName: string,
    metricClientConfig: any) {

    const metricLogger = agent.createMetricClient(metricClientConfig);

    webSocketServer.on("connection", (socket: core.IWebSocket) => {
        // Message sent when a ping operation is submitted to the router
        socket.on("message", (msg) => {
            const message = JSON.parse(msg) as api.IPingMessage;
            // Ack the unacked message.
            if (!message.acked) {
                message.acked = true;
                socket.send(JSON.stringify(message));
            } else {
                // Only write if the traces are correctly timestamped twice.
                if (message.traces !== undefined && message.traces.length === 2) {
                    metricLogger.writeLatencyMetric("pinglatency", message.traces)
                    .catch((error) => {
                        winston.error(error.stack);
                    });
                }
            }
        });
    });
}

/*
export function register(
    config: Provider,
    mongoManager: utils.MongoManager,
    producer: utils.kafkaProducer.IProducer,
    documentsCollectionName: string,
    metricClientConfig: any) {

    setTimeout(() => {
        const metricLogger = agent.createMetricClient(metricClientConfig);
        winston.info(`Trying to create a websocket connection!`);
        const webSocketServer = new WebSocket.Server( {port: 3000} );

        webSocketServer.on("connection", (socket: any) => {
            // Message sent when a ping operation is submitted to the router
            socket.on("message", (msg) => {
                const message = JSON.parse(msg) as api.IPingMessage;
                // Ack the unacked message.
                if (!message.acked) {
                    message.acked = true;
                    socket.send(JSON.stringify(message));
                } else {
                    // Only write if the traces are correctly timestamped twice.
                    if (message.traces !== undefined && message.traces.length === 2) {
                        metricLogger.writeLatencyMetric("pinglatency", message.traces)
                        .catch((error) => {
                            winston.error(error.stack);
                        });
                    }
                }
            });
        });
    }, 1000);
}*/
