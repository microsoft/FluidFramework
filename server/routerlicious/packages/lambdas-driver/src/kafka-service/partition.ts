/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IConsumer,
    IQueuedMessage,
    IPartitionConfig,
    IPartitionLambda,
    IPartitionLambdaFactory,
    ILogger,
    LambdaCloseType,
    IContextErrorData,
} from "@fluidframework/server-services-core";
import { QueueObject, queue } from "async";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { CheckpointManager } from "./checkpointManager";
import { Context } from "./context";

/**
 * Partition of a message stream. Manages routing messages to individual handlers. And then maintaining the
 * overall partition offset.
 */
export class Partition extends EventEmitter {
    private readonly q: QueueObject<IQueuedMessage>;
    private lambdaP: Promise<IPartitionLambda> | undefined;
    private lambda: IPartitionLambda | undefined;
    private readonly checkpointManager: CheckpointManager;
    private readonly context: Context;
    private closed = false;

    constructor(
        private readonly id: number,
        leaderEpoch: number,
        factory: IPartitionLambdaFactory<IPartitionConfig>,
        consumer: IConsumer,
        private readonly logger?: ILogger) {
        super();

        // Should we pass epoch with the context?
        const partitionConfig: IPartitionConfig = { leaderEpoch };

        this.checkpointManager = new CheckpointManager(id, consumer);
        this.context = new Context(this.checkpointManager, this.logger);
        this.context.on("error", (error: any, errorData: IContextErrorData) => {
            this.emit("error", error, errorData);
        });

        // Create the incoming message queue
        this.q = queue(
            (message: IQueuedMessage, callback) => {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const optionalPromise = this.lambda!.handler(message);
                    if (optionalPromise) {
                        optionalPromise
                            .then(callback as any)
                            .catch(callback);
                        return;
                    }

                    callback();
                } catch (error: any) {
                    callback(error);
                }
            },
            1);
        this.q.pause();

        this.lambdaP = factory.create(partitionConfig, this.context);
        this.lambdaP.then(
            (lambda) => {
                this.lambda = lambda;
                this.lambdaP = undefined;
                this.q.resume();
            },
            (error) => {
                if (this.closed) {
                    return;
                }

                const errorData: IContextErrorData = {
                    restart: true,
                };
                this.emit("error", error, errorData);
                this.q.kill();
            });

        this.q.error((error) => {
            const errorData: IContextErrorData = {
                restart: true,
            };
            this.emit("error", error, errorData);
        });
    }

    public process(rawMessage: IQueuedMessage) {
        if (this.closed) {
            return;
        }

        void this.q.push(rawMessage);
    }

    public close(closeType: LambdaCloseType): void {
        this.closed = true;

        // Stop any pending message processing
        this.q.kill();

        // Close checkpoint related classes
        this.checkpointManager.close();
        this.context.close();

        // Notify the lambda of the close
        if (this.lambda) {
            this.lambda.close(closeType);
            this.lambda = undefined;
        } else if (this.lambdaP) {
            // asynchronously close the lambda since it's not created yet
            this.lambdaP
                .then(
                    (lambda) => {
                        lambda.close(closeType);
                    },
                    (error) => {
                        // Lambda never existed - no need to close
                    })
                .finally(() => {
                    this.lambda = undefined;
                    this.lambdaP = undefined;
                });
        }

        this.removeAllListeners();
    }

    /**
     * Stops processing on the partition
     */
    public async drain(): Promise<void> {
        // Drain the queue of any pending operations
        const drainedP = new Promise<void>((resolve, reject) => {
            // If not entries in the queue we can exit immediatley
            if (this.q.length() === 0) {
                this.logger?.info(`No pending work for partition ${this.id}. Exiting early`);
                Lumberjack.info(`No pending work for partition ${this.id}. Exiting early`);
                return resolve();
            }

            // Wait until the queue is drained
            this.logger?.info(`Waiting for queue to drain for partition ${this.id}`);
            Lumberjack.info(`Waiting for queue to drain for partition ${this.id}`);

            this.q.drain(() => {
                this.logger?.info(`Drained partition ${this.id}`);
                Lumberjack.info(`Drained partition ${this.id}`);
                resolve();
            });
        });
        await drainedP;

        // Checkpoint at the latest offset
        await this.checkpointManager.flush();
    }
}
