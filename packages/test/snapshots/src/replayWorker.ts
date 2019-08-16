/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as threads from "worker_threads";
import { IWorkerArgs, processOneFile } from "./replayMultipleFiles";

const data = threads.workerData as IWorkerArgs;
processOneFile(data)
    .catch((error) => {
        if (typeof error === "object" && error !== null && (error as Error).message !== undefined) {
            threads.parentPort.postMessage((error as Error).message);
        } else {
            threads.parentPort.postMessage(`Error AAA processing ${data.folder}`);
        }
    });
