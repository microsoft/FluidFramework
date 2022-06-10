/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";

export function executeOnInterval(
    api: () => Promise<any>,
    intervalInMs: number,
    callName: string,
    onErrorFn?: (error) => void,
    shouldTerminateOnError?: (error) => boolean): ScheduledJob {
    const scheduledJob = new ScheduledJob();

    const execute = () => {
        if (!scheduledJob.isRunning()) {
            Lumberjack.info(`Job has been killed ${callName}`);
            return scheduledJob;
        }

        (async () => api())()
            .then((res) => {
                Lumberjack.info(`Success executing ${callName}`);
            })
            .catch((error) => {
                Lumberjack.error(`Error running ${callName}`, undefined, error);
                if (onErrorFn !== undefined) {
                    onErrorFn(error);
                }
                // eslint-disable-next-line @typescript-eslint/prefer-optional-chain
                if (shouldTerminateOnError !== undefined && shouldTerminateOnError(error)) {
                    Lumberjack.info(`Terminating job on error ${error} for ${callName}`);
                    scheduledJob.kill();
                    return;
                }
            })
            .finally(() => {
                if (scheduledJob.isRunning()) {
                    setTimeout(execute, intervalInMs);
                }
            });
        return scheduledJob;
    };

    return execute();
}

export class ScheduledJob {
    private _jobRunning: boolean;

    constructor() {
        this._jobRunning = true;
    }

    public isRunning(): boolean {
        return this._jobRunning;
    }

    public kill() {
        this._jobRunning = false;
    }
}
