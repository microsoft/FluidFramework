/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { ReplayArgs, ReplayTool } from "@fluidframework/replay-tool";

const fileLocation: string = "content/snapshotTestContent";

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
        process.removeListener("unhandledRejection", listener);
        throw new Error(error);
    };
    process.on("unhandledRejection", listener);

    // This will speed up test duration by ~17%, at the expense of losing a bit on coverage.
    // replayArgs.overlappingContainers = 1;

    const res = await new ReplayTool(replayArgs).Go();
    if (!res) {
        throw new Error(`Error processing ${args.folder}`);
    }
}

export async function processContent(mode: Mode, concurrently = true) {
    const promises: Promise<unknown>[] = [];

    // "worker_threads" does not resolve without --experimental-worker flag on command line
    let threads: typeof import("worker_threads");
    try {
        threads = await import("worker_threads");
        threads.Worker.EventEmitter.defaultMaxListeners = 20;
    } catch (err) {
    }

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
        const workerData: IWorkerArgs = {
            folder,
            mode,
            snapFreq,
        };

        if (!concurrently || !threads) {
            console.log(folder);
            await processOneFile(workerData);
            continue;
        }

        const work = new Promise((resolve, reject) => {
            const worker = new threads.Worker("./dist/replayWorker.js", { workerData });

            worker.on("message", (error: string) => {
                if (mode === Mode.Compare) {
                    // eslint-disable-next-line max-len
                    const extra = "If you changed snapshot representation and validated new format is backward compatible, you can run `npm run test:generate` to regenerate baseline snapshots";
                    reject(new Error(`${error}\n${extra}`));
                } else {
                    reject(new Error(error));
                }
            });

            worker.on("error", (error) => {
                reject(error);
            });

            worker.on("exit", (code) => {
                if (code !== 0) {
                    reject(new Error(`Worker stopped with exit code ${code}`));
                }
                resolve();
            });
        });

        promises.push(work);
    }

    return Promise.all(promises);
}
