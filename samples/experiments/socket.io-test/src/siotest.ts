/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as io from "socket.io-client";
import { parse, routerlicious } from "./config";

function sendIter(
    socket: SocketIOClient.Socket,
    index: number,
    total: number,
    batchMessages: string[],
    topic: string) {
    for (index = 0; index < total; index++) {
        const messages = [];
        for (let i = 0; i < batchMessages.length; i++) {
            const msg = { id: i + index * batchMessages.length, start: Date.now(), str: batchMessages[i] };
            messages.push(msg);
        }

        socket.emit(topic, parse ? JSON.stringify(messages) : messages);
    }
}

function send(socket: SocketIOClient.Socket, index: number, total: number, batchMessages: string[], topic: string) {
    if (index === total) {
        return;
    }

    const messages = [];
    for (let i = 0; i < batchMessages.length; i++) {
        const msg = { id: i + index * batchMessages.length, start: Date.now(), str: batchMessages[i] };
        messages.push(msg);
    }
    socket.emit(topic, parse ? JSON.stringify(messages) : messages);

    // Starting with setTimeout - will upgrade to immediate
    setTimeout(
        () => {
            send(socket, index + 1, total, batchMessages, topic);
        },
        0);
}

export async function runTest(batches: number, batchMessages: string[], iter: boolean, redis: boolean): Promise<any> {
    const socket = io(routerlicious, { transports: ["websocket"] });

    return new Promise<any>((resolve) => {
        const start = Date.now();
        let latencySum = 0;
        const totalMessages = batches * batchMessages.length;

        const topic = redis ? "relay2" : "relay";
        socket.on("connect", () => {
            if (iter) {
                sendIter(socket, 0, batches, batchMessages, topic);
            } else {
                send(socket, 0, batches, batchMessages, topic);
            }
        });

        socket.on("relaypong", (msgsRaw) => {
            const msgs = parse ? JSON.parse(msgsRaw) : msgsRaw;
            for (const msg of msgs) {
                const latency = Date.now() - msg.start;
                latencySum += latency;

                if (msg.id === totalMessages - 1) {
                    const end = Date.now();
                    const totalTime = end - start;
                    socket.disconnect();

                    resolve({
                        end,
                        latency: latencySum / totalMessages,
                        mbpsBandwidth: 1000 * (totalMessages / 1024) / totalTime,
                        messageBandwidth: 1000 * totalMessages / totalTime,
                        start,
                        totalMessages,
                        totalTime,
                    });
                }
            }
        });
    });
}
