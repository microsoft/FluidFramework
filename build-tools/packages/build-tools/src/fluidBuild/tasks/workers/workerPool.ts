/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChildProcess, fork } from "node:child_process";
import { EventEmitter } from "node:events";
import { freemem } from "node:os";
import { Readable } from "node:stream";
import { Worker } from "node:worker_threads";

import { WorkerExecResult, WorkerMessage } from "./worker";

export interface WorkerExecResultWithOutput extends WorkerExecResult {
	stdout: string;
	stderr: string;
}

export class WorkerPool {
	private readonly threadWorkerPool: Worker[] = [];
	private readonly processWorkerPool: ChildProcess[] = [];
	constructor(
		public readonly useWorkerThreads: boolean,
		private readonly memoryUsageLimit: number,
	) {}

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
			worker = fork(
				`${__dirname}/worker.js`,
				this.memoryUsageLimit !== Number.POSITIVE_INFINITY ? ["--memoryUsage"] : undefined,
				{ silent: true },
			);
		}
		return worker;
	}

	public async runOnWorker(
		workerName: string,
		command: string,
		cwd: string,
	): Promise<WorkerExecResultWithOutput> {
		const workerMessage: WorkerMessage = { workerName, command, cwd };
		const cleanup: (() => void)[] = [];
		const installTemporaryListener = (
			object: EventEmitter | Readable,
			event: string,
			handler: any,
		) => {
			object.on(event, handler);
			cleanup.push(() => object.off(event, handler));
		};
		const setupWorker = (
			worker: Worker | ChildProcess,
			res: (value: WorkerExecResultWithOutput) => void,
		) => {
			let stdout = "";
			let stderr = "";

			if (worker.stdout) {
				installTemporaryListener(worker.stdout, "data", (chunk: any) => {
					stdout += chunk;
				});
			}
			if (worker.stderr) {
				installTemporaryListener(worker.stderr, "data", (chunk: any) => {
					stderr += chunk;
				});
			}

			worker.once("message", (result: WorkerExecResult) => {
				res({ ...result, stdout, stderr });
			});
		};
		try {
			if (this.useWorkerThreads) {
				const worker = this.getThreadWorker();
				const res = await new Promise<WorkerExecResultWithOutput>((res) => {
					setupWorker(worker, res);
					worker.postMessage(workerMessage);
				});
				this.threadWorkerPool.push(worker);
				return res;
			} else {
				const worker = this.getProcessWorker();
				const res = await new Promise<WorkerExecResultWithOutput>((res, rej) => {
					const setupErrorListener = (event: string) => {
						installTemporaryListener(worker, event, () => {
							rej(new Error(`Worker ${event}`));
						});
					};

					setupWorker(worker, res);

					setupErrorListener("close");
					setupErrorListener("disconnect");
					setupErrorListener("error");
					setupErrorListener("exit");
					worker.send(workerMessage);
				});

				// Workers accumulate memory use over time.
				// Since recreating workers fixes this, but takes time,
				// recreate them only when the memory use becomes too high.

				const freeMemory = freemem();
				// As a heuristic to avoid memory pressure, lower threshold if running out of memory.
				const currentMemoryLimit = Math.min(this.memoryUsageLimit, freeMemory / 2);
				const bytesPerGiB = 1024 * 1024 * 1024;

				if (
					// Don't keep worker if using more than currentMemoryLimit bytes of memory.
					(res.memoryUsage?.rss ?? 0) > currentMemoryLimit ||
					// In case memoryUsage is not available,
					// or as a last resort when something other than this worker is using up all the memory
					// kill the worker if there is less than 4 GB of memory free.
					freeMemory < 4 * bytesPerGiB
				) {
					// This typically happens around 21 times in a full clean build of client, and much less if any in an incremental build,
					// so it should not be too verbose to log.
					console.info(
						`Freeing worker ${worker.pid} due to memory pressure. Free memory: ${freeMemory / bytesPerGiB} GiB, rss: ${res.memoryUsage?.rss ? res.memoryUsage?.rss / bytesPerGiB : undefined} GiB, memoryUsageLimit: ${this.memoryUsageLimit / bytesPerGiB} GiB, currentMemoryLimit: ${currentMemoryLimit / bytesPerGiB} GiB`,
					);
					worker.kill();
				} else {
					this.processWorkerPool.push(worker);
				}
				return res;
			}
		} finally {
			cleanup.forEach((value) => value());
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
