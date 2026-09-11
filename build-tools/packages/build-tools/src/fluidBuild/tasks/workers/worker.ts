/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { parentPort } from "worker_threads";

import { apiExtractorWorker } from "./apiExtractorWorker.js";
import { lint } from "./eslintWorker.js";
import { compile, fluidCompile } from "./tscWorker.js";

export interface WorkerMessage {
	workerName: string;
	command: string;
	cwd: string;
}

/**
 * Error information transferred from a worker back to the main thread.
 *
 * @remarks
 * Process based workers communicate over IPC, which does not preserve `Error` instances, so errors
 * are copied field by field. Values that are thrown but are not `Error`s leave every field
 * `undefined`.
 */
export interface WorkerError {
	name?: string | undefined;
	message?: string | undefined;
	stack?: string | undefined;
}

export interface WorkerExecResult {
	code: number;
	error?: WorkerError; // unhandled exception, main thread should rerun it.
	memoryUsage?: NodeJS.MemoryUsage;
}

const workers: { [key: string]: (message: WorkerMessage) => Promise<WorkerExecResult> } = {
	"tsc": compile,
	"fluid-tsc": fluidCompile,
	"eslint": lint,
	"api-extractor": apiExtractorWorker,
};

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
	} catch (e) {
		// any unhandled exception thrown is going to rerun on main thread.
		// The thrown value is not necessarily an Error, so read the fields it would have without
		// coercing it: non-Errors leave them undefined, which is the pre-existing behavior.
		const thrown = e as Partial<Error>;
		res = {
			error: {
				name: thrown.name,
				message: thrown.message,
				stack: thrown.stack,
			},
			code: -1,
		};
	}
	return collectMemoryUsage ? { ...res, memoryUsage: process.memoryUsage() } : res;
}

if (parentPort) {
	parentPort.on("message", (message: WorkerMessage) => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		messageHandler(message).then(parentPort!.postMessage.bind(parentPort));
	});
} else if (process.send) {
	collectMemoryUsage = process.argv.includes("--memoryUsage");
	process.on("message", (message: WorkerMessage) => {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		messageHandler(message).then(process.send!.bind(process));
	});
	process.on("uncaughtException", (error) => {
		console.error(`ERROR: Uncaught exception. ${error.message}\n${error.stack}`);
		process.exit(-1);
	});
	process.on("unhandledRejection", (reason) => {
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
