/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Deferred } from "@fluidframework/common-utils";
import { IConsumer, IPartitionLambdaFactory } from "@microsoft/fluid-server-services-core";
import { IRunner } from "@microsoft/fluid-server-services-utils";
import { Provider } from "nconf";
import * as winston from "winston";
import { PartitionManager } from "./partitionManager";

export class KafkaRunner implements IRunner {
    private deferred: Deferred<void>;
    private partitionManager: PartitionManager;

    constructor(
        private readonly factory: IPartitionLambdaFactory,
        private readonly consumer: IConsumer,
        private readonly config: Provider) {
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public start(): Promise<void> {
        this.deferred = new Deferred<void>();

        process.on("warning", (msg) => {
            console.trace("Warning", msg);
        });

        this.factory.on("error", (error) => {
            this.deferred.reject(error);
        });

        this.partitionManager = new PartitionManager(this.factory, this.consumer, this.config);
        this.partitionManager.on("error", (error, restart) => {
            this.deferred.reject(error);
        });

        return this.deferred.promise;
    }

    /**
     * Signals to stop the service
     */
    public async stop(): Promise<void> {
        winston.info("Stop requested");

        // Stop listening for new updates
        await this.consumer.pause();

        // Mark ourselves done once the topic manager has stopped processing
        const stopP = this.partitionManager.stop();
        this.deferred.resolve(stopP);

        return this.deferred.promise;
    }
}
