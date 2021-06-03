/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { inspect } from "util";
import { Deferred } from "@fluidframework/common-utils";
import { promiseTimeout } from "@fluidframework/server-services-client";
import {
    IConsumer,
    IContextErrorData,
    ILogger,
    IPartitionLambdaFactory,
    IRunner,
} from "@fluidframework/server-services-core";
import { PartitionManager } from "./partitionManager";

export class KafkaRunner implements IRunner {
    private deferred: Deferred<void> | undefined;
    private partitionManager: PartitionManager | undefined;
    private stopped: boolean = false;

    constructor(
        private readonly factory: IPartitionLambdaFactory,
        private readonly consumer: IConsumer) {
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public start(logger: ILogger | undefined): Promise<void> {
        if (this.deferred) {
            throw new Error("Already started");
        }

        const deferred = new Deferred<void>();

        this.deferred = deferred;

        process.on("warning", (msg) => {
            console.trace("Warning", msg);
        });

        this.factory.on("error", (error) => {
            deferred.reject(error);
        });

        this.partitionManager = new PartitionManager(this.factory, this.consumer, logger);
        this.partitionManager.on("error", (error, errorData: IContextErrorData) => {
            const metadata = {
                messageMetaData: {
                    documentId: errorData?.documentId,
                    tenantId: errorData?.tenantId,
                },
            };

            if (errorData && !errorData.restart) {
                logger?.error("KakfaRunner encountered an error that is not configured to trigger restart.", metadata);
                logger?.error(inspect(error), metadata);
            } else {
                logger?.error("KakfaRunner encountered an error that will trigger a restart.", metadata);
                logger?.error(inspect(error), metadata);
                deferred.reject(error);
            }
        });

        this.stopped = false;

        return deferred.promise;
    }

    /**
     * Signals to stop the service
     */
    public async stop(): Promise<void> {
        if (!this.deferred || this.stopped) {
            return;
        }

        this.stopped = true;

        // Stop listening for new updates
        await this.consumer.pause();

        // Stop the partition manager
        await this.partitionManager?.stop();

        // Dispose the factory
        await this.factory.dispose();

        // Close the underlying consumer, but setting a timeout for safety
        await promiseTimeout(30000, this.consumer.close());

        // Mark ourselves done once the partition manager has stopped
        this.deferred.resolve();
        this.deferred = undefined;
    }
}
