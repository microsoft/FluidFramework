/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";

export async function executeOnInterval<T>(
    api: () => Promise<T>,
    intervalInMs: number,
    callName: string): Promise<void> {
    await api()
        .then((res) => {
            Lumberjack.info(`Success executing ${callName}`, undefined);
        })
        .catch((error) => {
            Lumberjack.error(`Error running ${callName}`, undefined, error);
        })
        .finally(() => {
            if (intervalInMs) {
                const timeoutP = async () => new Promise((resolve) => {
                    setTimeout(resolve, intervalInMs);
                });
                // eslint-disable-next-line @typescript-eslint/no-floating-promises
                timeoutP().then(async () => executeOnInterval(api, intervalInMs, callName));
            }
        });
}
