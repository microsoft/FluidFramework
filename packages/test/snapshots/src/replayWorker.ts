/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import threads from "worker_threads";
import { IWorkerArgs, processOneNode } from "./replayMultipleFiles";

const data = threads.workerData as IWorkerArgs;
processOneNode(data)
	.then(() => threads.parentPort.postMessage("true"))
	.catch((error) => {
		const typedError = error as Error;
		if (typeof error === "object" && error !== null && typedError.message !== undefined) {
			threads.parentPort.postMessage(typedError.stack ?? typedError.message);
		} else {
			threads.parentPort.postMessage(`Error AAA processing ${data.folder}`);
		}
	});
