/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRandom } from "@fluid-internal/stochastic-test-utils";
import { assert, delay } from "@fluidframework/common-utils";
import { DataObjectWithCounter } from "./dataObjectWithCounter";

export function start(dataObjectWithCounter: DataObjectWithCounter, count: number, random: IRandom) {
    dataObjectWithCounter.isRunning = true;
    sendOps(dataObjectWithCounter, count, random).catch((error) => { console.log(error); });
}

// The delay to wait between each created op
const delayPerOpMs = 100;
/**
 * @param dataObjectWithCounter - the dataObject to send ops from
 * @param count - number of ops performed
 * @param random - used to control randomization consistently across all clients
 *
 * Perform some count of ops and then potentially reference and unreference datastores
 */
export async function sendOps(dataObjectWithCounter: DataObjectWithCounter, count: number, random: IRandom) {
    assert(dataObjectWithCounter.isRunning === true, "Should be running to send ops");
    while (dataObjectWithCounter.isRunning) {
        let opsPerformed = 0;
        while (opsPerformed < count && dataObjectWithCounter.isRunning && !dataObjectWithCounter.disposed) {
            // This count is shared across dataObjects so this should reach clients * datastores * count
            await dataObjectWithCounter.sendOp();
            // This data is local and allows us to understand the number of changes a local client has created
            opsPerformed++;
            await delay(delayPerOpMs);
        }
        // TODO: Do something interesting, here is where the randomization logic should go
        random.integer(0, opsPerformed);
    }
}
