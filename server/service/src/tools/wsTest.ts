/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as commander from "commander";
import * as ws from "isomorphic-ws";
import * as rs from "randomstring";

function generateRandomBatchMessages(length: number): string[] {
    const messages = new Array<string>();

    for (let i = 0; i < length; i++) {
        const str = rs.generate(1024);
        messages.push(str);
    }

    return messages;
}

export function sendIter(socket: ws, index: number, total: number, batchMessages: string[]) {
    for (index = 0; index < total; index++) {
        const messages = [];
        for (let i = 0; i < batchMessages.length; i++) {
            const msg = { id: i + index * batchMessages.length, start: Date.now(), str: batchMessages[i] };
            messages.push(msg);
        }

        socket.send(JSON.stringify(messages));
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

    socket.send(JSON.stringify(messages));

    // Starting with setTimeout - will upgrade to immediate
    setTimeout(
        () => {
            send(socket, index + 1, total, batchMessages);
        },
        0);
}

export async function runTest(batches: number, batchMessages: string[], iter: boolean): Promise<any> {
    const socket = new ws("ws://jarvis:4000");

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
            const msgs = JSON.parse(msgsRaw.data as string);
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

commander
    .version("0.1.0")
    .option("-m, --batchSize [batchSize]", "batch size", parseInt, 10)
    .option("-b, --batches [batches]", "total batches", parseInt, 10)
    .option("-s, --size [size]", "message size", parseInt, 1024)
    .parse(process.argv);

console.log(commander.batchSize);
console.log(commander.batches);

const randomMessages = generateRandomBatchMessages(commander.batchSize);
runTest(commander.batches, randomMessages, false).then((stats) => {
    console.log(JSON.stringify(stats, null, 2));
});
