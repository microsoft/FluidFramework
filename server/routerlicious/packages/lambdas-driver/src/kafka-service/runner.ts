/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import { IConsumer, IContextErrorData, ILogger, IPartitionLambdaFactory } from "@fluidframework/server-services-core";
import { IRunner } from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import { PartitionManager } from "./partitionManager";

export class KafkaRunner implements IRunner {
    private deferred: Deferred<void> | undefined;
    private partitionManager: PartitionManager | undefined;

    constructor(
        private readonly factory: IPartitionLambdaFactory,
        private readonly consumer: IConsumer,
        private readonly config: Provider) {
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

        this.partitionManager = new PartitionManager(this.factory, this.consumer, this.config, logger);
        this.partitionManager.on("error", (error, errorData: IContextErrorData) => {
            deferred.reject(error);
        });

        return deferred.promise;
    }

    /**
     * Signals to stop the service
     */
    public async stop(): Promise<void> {
        if (!this.deferred) {
            return;
        }

        // Stop listening for new updates
        await this.consumer.pause();

        // Stop the partition manager
        await this.partitionManager?.stop();

        // Mark ourselves done once the partition manager has stopped
        this.deferred.resolve();
        this.deferred = undefined;
    }
}
