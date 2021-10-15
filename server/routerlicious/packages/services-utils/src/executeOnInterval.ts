/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Lumberjack } from "@fluidframework/server-services-telemetry";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class Scheduler {
    public static executeOnInterval(
        api: () => Promise<any>,
        intervalInMs: number,
        callName: string,
        onErrorFn?: () => void,
        shouldRetryError?: (error) => boolean): ScheduledJob {
        let error;

        const scheduledJob = new ScheduledJob();

        const execute = () => {
            if (!scheduledJob.isJobRunning()) {
                Lumberjack.info(`Job has been killed ${callName}`);
                return scheduledJob;
            }

            api()
                .then((res) => {
                    Lumberjack.info(`Success executing ${callName}`);
                })
                .catch((err) => {
                    error = err;
                    Lumberjack.error(`Error running ${callName}`, undefined, err);
                    if (onErrorFn !== undefined) {
                        onErrorFn();
                    }
                })
                .finally(() => {
                    if (shouldRetryError !== undefined && !shouldRetryError(error)) {
                        Lumberjack.info(`Should not retry error ${callName}`);
                        scheduledJob.killJob();
                        return;
                    }

                    setTimeout(() => execute(), intervalInMs);
                });
            return scheduledJob;
        };

        return execute();
    }
}

export class ScheduledJob {
    private _jobRunning: boolean;

    constructor() {
        this._jobRunning = true;
    }

    public isJobRunning(): boolean {
        return this._jobRunning;
    }

    public killJob() {
        this._jobRunning = false;
    }
}
