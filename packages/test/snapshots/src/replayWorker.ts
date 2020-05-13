/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import threads from "worker_threads";
import { IWorkerArgs, processOneFile } from "./replayMultipleFiles";

const data = threads.workerData as IWorkerArgs;
processOneFile(data)
    .catch((error) => {
        // eslint-disable-next-line no-null/no-null
        if (typeof error === "object" && error !== null && (error as Error).message !== undefined) {
            threads.parentPort.postMessage((error as Error).message);
        } else {
            threads.parentPort.postMessage(`Error AAA processing ${data.folder}`);
        }
    });
