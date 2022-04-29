/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parentPort } from "worker_threads";
import { compile } from "./tscWorker";
import { lint } from "./eslintWorker";

export interface WorkerMessage {
    workerName: string,
    command: string,
    cwd: string,
};

export interface WorkerExecResult {
    code: number,
    error?: Error,  // unhandled exception, main thread should rerun it.
    memoryUsage?: NodeJS.MemoryUsage,
}

const workers: { [key: string]: (message: WorkerMessage) => Promise<WorkerExecResult> } = {
    "tsc": compile,
    "eslint": lint,
}

let collectMemoryUsage = false;

async function messageHandler(msg: WorkerMessage): Promise<WorkerExecResult> {
    let res: WorkerExecResult;
    try {
        const worker = workers[msg.workerName];
        if (worker) {
            // await here so that if the promise is rejected, the try/catch will catch it
            res = await worker(msg);
        } else {
            throw new Error(`Invalid workerName ${msg.workerName}`);
        }
    } catch (e: any) {
        // any unhandled exception thrown is going to rerun on main thread.
        res = {
            error: {
                name: e.name,
                message: e.message,
                stack: e.stack,
            },
            code: -1,
        };
    }
    return collectMemoryUsage ? { ...res, memoryUsage: process.memoryUsage() } : res;
}

if (parentPort) {
    parentPort.on("message", (message: WorkerMessage) => {
        messageHandler(message).then(parentPort!.postMessage.bind(parentPort));
    });
} else if (process.send) {
    collectMemoryUsage = process.argv.includes("--memoryUsage");
    process.on('message', (message: WorkerMessage) => {
        messageHandler(message).then(process.send!.bind(process));
    });
    process.on("uncaughtException", (error) => {
        console.error(`ERROR: Uncaught exception. ${error.message}\n${error.stack}`);
        process.exit(-1);
    });
    process.on("unhandledRejection", (reason, promise) => {
        console.error(`ERROR: Unhandled promise rejection. ${reason}`);
        process.exit(-1);
    });
    process.on("beforeExit", () => {
        console.error("ERROR: Process exited");
        process.exit(-1);
    });
} else {
    throw new Error("Invalid worker invocation");
}
