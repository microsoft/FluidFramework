/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import fs from "fs";
import { ReplayArgs, ReplayTool } from "@fluid-internal/replay-tool";
import { Deferred } from "@fluidframework/common-utils";

const fileLocation: string = "content/snapshotTestContent";

const numberOfThreads = 2;

process.setMaxListeners(20);

export enum Mode {
    Write,   // Write out files
    Compare, // Compare to files stored on disk
    Stress,  // Do stress testing without writing or comparing out files.
}

export interface IWorkerArgs {
    folder: string;
    mode: Mode;
    snapFreq: number;
}

class ConcurrencyLimiter {
    private readonly promises: Promise<void>[] = [];
    private deferred: Deferred<void> | undefined;

    constructor(private limit: number) { }

    async addWork(worker: () => Promise<void>) {
        this.limit--;
        if (this.limit < 0) {
            assert(this.deferred === undefined);
            this.deferred = new Deferred<void>();
            await this.deferred.promise;
            assert(this.deferred === undefined);
            assert(this.limit >= 0);
        }

        const p = worker().then(() => {
            this.limit++;
            if (this.deferred) {
                assert(this.limit === 0);
                this.deferred.resolve();
                this.deferred = undefined;
            }
        });
        this.promises.push(p);
    }

    async waitAll() {
        return Promise.all(this.promises);
    }
}

export async function processOneFile(args: IWorkerArgs) {
    const replayArgs = new ReplayArgs();

    replayArgs.verbose = false;
    replayArgs.inDirName = args.folder;
    replayArgs.outDirName = args.folder;
    replayArgs.snapFreq = args.snapFreq;

    replayArgs.write = args.mode === Mode.Write;
    replayArgs.compare = args.mode === Mode.Compare;
    // Make it easier to see problems in stress tests
    replayArgs.expandFiles = args.mode === Mode.Stress;

    // Worker threads does not listen to unhandled promise rejections. So set a listener and
    // throw error so that worker thread could pass the message to parent thread.
    const listener = (error) => {
        throw new Error(error);
    };
    process.once("unhandledRejection", listener);

    // This will speed up test duration by ~17%, at the expense of losing a bit on coverage.
    // replayArgs.overlappingContainers = 1;

    const res = await new ReplayTool(replayArgs).Go();
    if (!res) {
        throw new Error(`Error processing ${args.folder}`);
    }
}

export async function processContent(mode: Mode, concurrently = true) {
    // "worker_threads" does not resolve without --experimental-worker flag on command line
    let threads: typeof import("worker_threads");
    try {
        threads = await import("worker_threads");
    } catch (err) {
    }

    const limiter = new ConcurrencyLimiter(numberOfThreads);

    for (const node of fs.readdirSync(fileLocation, { withFileTypes: true })) {
        if (!node.isDirectory()) {
            continue;
        }
        const folder = `${fileLocation}/${node.name}`;
        const messages = `${folder}/messages.json`;
        if (!fs.existsSync(messages)) {
            console.error(`Can't locate ${messages}`);
            continue;
        }

        // SnapFreq is the most interesting options to tweak
        // On one hand we want to generate snapshots often, ideally every 50 ops
        // This allows us to exercise more cases and increases chances of finding bugs.
        // At the same time that generates more files in repository, and adds to the size of it
        // Thus using two passes:
        // 1) Stress test - testing eventual consistency only
        // 2) Testing backward compat - only testing snapshots at every 1000 ops
        const snapFreq = mode === Mode.Stress ? 50 : 1000;
        const data: IWorkerArgs = {
            folder,
            mode,
            snapFreq,
        };

        if (!concurrently || !threads) {
            await processOneFile(data);
            continue;
        }

        await (async (workerData: IWorkerArgs) => limiter.addWork(async () => new Promise((resolve, reject) => {
            const worker = new threads.Worker("./dist/replayWorker.js", { workerData });
            worker.setMaxListeners(20);

            worker.once("message", (error: string) => {
                worker.removeAllListeners();
                if (mode === Mode.Compare) {
                    // eslint-disable-next-line max-len
                    const extra = "If you changed snapshot representation and validated new format is backward compatible, you can run `npm run test:generate` to regenerate baseline snapshots";
                    reject(new Error(`${error}\n${extra}`));
                } else {
                    reject(new Error(error));
                }
            });

            worker.once("error", (error) => {
                worker.removeAllListeners();
                reject(error);
            });

            worker.once("exit", (code) => {
                worker.removeAllListeners();
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
                resolve();
            });
        })))(data);
    }

    return limiter.waitAll();
}
