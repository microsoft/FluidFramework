/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ws from "isomorphic-ws";
import { parseWs, routerliciousWs } from "./config";

export function sendIter(socket: ws, index: number, total: number, batchMessages: string[]) {
    for (index = 0; index < total; index++) {
        const messages = [];
        for (let i = 0; i < batchMessages.length; i++) {
            const msg = { id: i + index * batchMessages.length, start: Date.now(), str: batchMessages[i] };
            messages.push(msg);
        }

        socket.send(parseWs ? JSON.stringify(messages) : messages);
    }
}

export function send(socket: ws, index: number, total: number, batchMessages: string[]) {
    if (index === total) {
        return;
    }

    const messages = [];
    for (let i = 0; i < batchMessages.length; i++) {
        const msg = { id: i + index * batchMessages.length, start: Date.now(), str: batchMessages[i] };
        messages.push(msg);
    }

    socket.send(parseWs ? JSON.stringify(messages) : messages);

    // Starting with setTimeout - will upgrade to immediate
    setTimeout(
        () => {
            send(socket, index + 1, total, batchMessages);
        },
        0);
}

export async function runTest(batches: number, batchMessages: string[], iter: boolean): Promise<any> {
    const socket = new ws(routerliciousWs);

    return new Promise<any>((resolve) => {
        let start: number;
        let latencySum = 0;
        const totalMessages = batches * batchMessages.length;

        socket.onopen = () => {
            start = Date.now();
            if (iter) {
                sendIter(socket, 0, batches, batchMessages);
            } else {
                send(socket, 0, batches, batchMessages);
            }
        };

        socket.onmessage = (msgsRaw) => {
            const msgs = parseWs ? JSON.parse(msgsRaw.data as string) : msgsRaw;
            for (const msg of msgs) {
                const latency = Date.now() - msg.start;
                latencySum += latency;

                if (msg.id === totalMessages - 1) {
                    const end = Date.now();
                    const totalTime = end - start;
                    socket.close();

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
        };
    });
}
