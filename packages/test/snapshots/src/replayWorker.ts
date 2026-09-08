/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import threads from "node:worker_threads";

import { IWorkerArgs, processOneNode } from "./replayMultipleFiles.js";

const data = threads.workerData as IWorkerArgs | null;
assert(!!data, `replayWorker: worker data is ${JSON.stringify(data)}`);
const parentPort = threads.parentPort;
assert(parentPort !== null, "replayWorker: parent port is null");
processOneNode(data)
	.then(() => parentPort.postMessage("true"))
	.catch((error) => {
		const typedError = error as Error;
		if (typeof error === "object" && error !== null && typedError.message !== undefined) {
			parentPort.postMessage(typedError.stack ?? typedError.message);
		} else {
			parentPort.postMessage(`Error AAA processing ${data.folder}`);
		}
	});
