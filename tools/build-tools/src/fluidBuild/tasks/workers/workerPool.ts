/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as child_process from "child_process";
import { Worker } from "worker_threads";
import { WorkerMessage, WorkerExecResult } from "./worker";

export class WorkerPool {
    private readonly threadWorkerPool: Worker[] = [];
    private readonly processWorkerPool: child_process.ChildProcess[] = [];
    constructor(public readonly useWorkerThreads: boolean) {
    }

    private getThreadWorker() {
        let worker: Worker | undefined = this.threadWorkerPool.pop();
        if (!worker) {
            worker = new Worker(`${__dirname}/worker.js`);
        }
        return worker;
    }

    private getProcessWorker() {
        let worker: child_process.ChildProcess | undefined = this.processWorkerPool.pop();
        if (!worker) {
            worker = child_process.fork(`${__dirname}/worker.js`);
        }
        return worker;
    }

    public async runOnWorker(workerName: string, command: string, cwd: string): Promise<WorkerExecResult> {
        const workerMessage: WorkerMessage = { workerName, command, cwd };
        if (this.useWorkerThreads) {
            const worker = this.getThreadWorker();
            const p = new Promise<WorkerExecResult>((res, rej) => {
                worker.once("message", res);
                worker.postMessage(workerMessage);
            });
            const res = await p;
            this.threadWorkerPool.push(worker);
            return res;
        } else {
            const worker = this.getProcessWorker();

            const cleanup: (() => void)[] = [];
            const p = new Promise<WorkerExecResult>((res, rej) => {
                const setupErrorListener = (event: string) => {
                    const handler = () => {
                        rej(new Error(`Worker ${event}`));
                    };
                    worker.on(event, handler);
                    cleanup.push(() => { worker.off(event, handler) });
                }

                setupErrorListener("close");
                setupErrorListener("disconnect");
                setupErrorListener("error");
                setupErrorListener("exit");
                worker.once("message", res);
                worker.send(workerMessage);
            });

            try {
                const res = await p;
                this.processWorkerPool.push(worker);
                return res;
            } finally {
                cleanup.forEach(value => value());
            }
        }
    }

    public reset() {
        this.threadWorkerPool.forEach((worker) => {
            worker.terminate();
        });
        this.threadWorkerPool.length = 0;

        this.processWorkerPool.forEach((worker) => {
            worker.kill();
        });
        this.processWorkerPool.length = 0;
    }
}
