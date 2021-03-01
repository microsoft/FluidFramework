/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as child_process from "child_process";
import { Worker } from "worker_threads";
import { WorkerMessage, WorkerExecResult } from "./worker";

export interface WorkerExecResultWithOutput extends WorkerExecResult {
    stdout: string,
    stderr: string,
}

export class WorkerPool {
    private readonly threadWorkerPool: Worker[] = [];
    private readonly processWorkerPool: child_process.ChildProcess[] = [];
    constructor(public readonly useWorkerThreads: boolean) {
    }

    private getThreadWorker() {
        let worker: Worker | undefined = this.threadWorkerPool.pop();
        if (!worker) {
            worker = new Worker(`${__dirname}/worker.js`, { stdout: true, stderr: true });
        }
        return worker;
    }

    private getProcessWorker() {
        let worker: child_process.ChildProcess | undefined = this.processWorkerPool.pop();
        if (!worker) {
            worker = child_process.fork(`${__dirname}/worker.js`, undefined, { silent: true });
        }
        return worker;
    }

    public async runOnWorker(workerName: string, command: string, cwd: string): Promise<WorkerExecResultWithOutput> {
        const workerMessage: WorkerMessage = { workerName, command, cwd };
        const cleanup: (() => void)[] = [];
        const installTemporaryListener = (object: EventEmitter, event: string, handler: any) => {
            object.on(event, handler);
            cleanup.push(() => object.off(event, handler));
        }
        const setupWorker = (worker: Worker | child_process.ChildProcess, res: (value: WorkerExecResultWithOutput) => void) => {
            let stdout = "";
            let stderr = "";
            installTemporaryListener(worker.stdout, "data", (chunk: any) => { stdout += chunk; });
            installTemporaryListener(worker.stderr, "data", (chunk: any) => { stderr += chunk; });
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
                const res = new Promise<WorkerExecResultWithOutput>((res, rej) => {
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

                this.processWorkerPool.push(worker);
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
