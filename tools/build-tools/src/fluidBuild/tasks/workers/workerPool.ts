/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChildProcess, fork } from "child_process";
import { EventEmitter } from "events";
import { Readable } from "stream";
import { Worker } from "worker_threads";
import { WorkerMessage, WorkerExecResult } from "./worker";

export interface WorkerExecResultWithOutput extends WorkerExecResult {
    stdout: string,
    stderr: string,
}

export class WorkerPool {
    private readonly threadWorkerPool: Worker[] = [];
    private readonly processWorkerPool: ChildProcess[] = [];
    constructor(
        public readonly useWorkerThreads: boolean,
        private readonly memoryUsageLimit: number,
    ) {
    }

    private getThreadWorker() {
        let worker: Worker | undefined = this.threadWorkerPool.pop();
        if (!worker) {
            worker = new Worker(`${__dirname}/worker.js`, { stdout: true, stderr: true });
        }
        return worker;
    }

    private getProcessWorker() {
        let worker: ChildProcess | undefined = this.processWorkerPool.pop();
        if (!worker) {
            worker = fork(`${__dirname}/worker.js`,
                this.memoryUsageLimit !== -1 ? ["--memoryUsage"] : undefined,
                { silent: true }
            );
        }
        return worker;
    }

    public async runOnWorker(workerName: string, command: string, cwd: string): Promise<WorkerExecResultWithOutput> {
        const workerMessage: WorkerMessage = { workerName, command, cwd };
        const cleanup: (() => void)[] = [];
        const installTemporaryListener = (object: EventEmitter | Readable, event: string, handler: any) => {
            object.on(event, handler);
            cleanup.push(() => object.off(event, handler));
        }
        const setupWorker = (worker: Worker | ChildProcess, res: (value: WorkerExecResultWithOutput) => void) => {
            let stdout = "";
            let stderr = "";

            if (worker.stdout) {
                installTemporaryListener(worker.stdout, "data", (chunk: any) => { stdout += chunk; });
            }
            if (worker.stderr) {
                installTemporaryListener(worker.stderr, "data", (chunk: any) => { stderr += chunk; });
            }

            worker.once("message", (result: WorkerExecResult) => {
                res({ ...result, stdout, stderr });
            });
        }
        try {
            if (this.useWorkerThreads) {
                const worker = this.getThreadWorker();
                const res = await new Promise<WorkerExecResultWithOutput>((res, rej) => {
                    setupWorker(worker, res);
                    worker.postMessage(workerMessage);
                });
                this.threadWorkerPool.push(worker);
                return res;
            } else {
                const worker = this.getProcessWorker();
                const res = await new Promise<WorkerExecResultWithOutput>((res, rej) => {
                    const setupErrorListener = (event: string) => {
                        installTemporaryListener(worker, event, () => { rej(new Error(`Worker ${event}`)); });
                    }

                    setupWorker(worker, res);

                    setupErrorListener("close");
                    setupErrorListener("disconnect");
                    setupErrorListener("error");
                    setupErrorListener("exit");
                    worker.send(workerMessage);
                });

                if (this.memoryUsageLimit >= 0 && (res.memoryUsage?.rss ?? 0) > this.memoryUsageLimit) {
                    // Don't keep worker using more then 1GB of memory
                    worker.kill();
                } else {
                    this.processWorkerPool.push(worker);
                }
                return res;
            }
        } finally {
            cleanup.forEach(value => value());
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
