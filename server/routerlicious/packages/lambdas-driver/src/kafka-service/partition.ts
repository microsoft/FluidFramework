/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IConsumer,
    IQueuedMessage,
    IPartitionLambda,
    IPartitionLambdaFactory,
    ILogger,
    LambdaCloseType,
    IContextErrorData,
} from "@fluidframework/server-services-core";
import { AsyncQueue, queue } from "async";
import * as _ from "lodash";
import { Provider } from "nconf";
import { CheckpointManager } from "./checkpointManager";
import { Context } from "./context";

/**
 * Partition of a message stream. Manages routing messages to individual handlers. And then maintaining the
 * overall partition offset.
 */
export class Partition extends EventEmitter {
    private q: AsyncQueue<IQueuedMessage>;
    private readonly lambdaP: Promise<IPartitionLambda>;
    private lambda: IPartitionLambda;
    private readonly checkpointManager: CheckpointManager;
    private readonly context: Context;
    private closed = false;

    constructor(
        private readonly id: number,
        leaderEpoch: number,
        factory: IPartitionLambdaFactory,
        consumer: IConsumer,
        config: Provider,
        private readonly logger?: ILogger) {
        super();

        // Should we pass epoch with the context?
        const clonedConfig = _.cloneDeep((config as any).get());
        clonedConfig.leaderEpoch = leaderEpoch;
        const partitionConfig = new Provider({}).defaults(clonedConfig).use("memory");

        this.checkpointManager = new CheckpointManager(id, consumer);
        this.context = new Context(this.checkpointManager);
        this.context.on("error", (error: any, errorData: IContextErrorData) => {
            this.emit("error", error, errorData);
        });

        // Create the incoming message queue
        this.q = queue(
            (message: IQueuedMessage, callback) => {
                try {
                    this.lambda.handler(message);
                    callback();
                } catch (error) {
                    callback(error);
                }
            },
            1);
        this.q.pause();

        this.lambdaP = factory.create(partitionConfig, this.context);
        this.lambdaP.then(
            (lambda) => {
                this.lambda = lambda;
                this.q.resume();
            },
            (error) => {
                const errorData: IContextErrorData = {
                    restart: true,
                };
                this.emit("error", error, errorData);
                this.q.kill();
            });

        this.q.error = (error) => {
            const errorData: IContextErrorData = {
                restart: true,
            };
            this.emit("error", error, errorData);
        };
    }

    public process(rawMessage: IQueuedMessage) {
        if (this.closed) {
            return;
        }

        this.q.push(rawMessage);
    }

    public close(closeType: LambdaCloseType): void {
        this.closed = true;

        // Stop any pending message processing
        this.q.kill();

        // Close checkpoint related classes
        this.checkpointManager.close();
        this.context.close();

        // Notify the lambda (should it be resolved) of the close
        this.lambdaP.then(
            (lambda) => {
                lambda.close(closeType);
            },
            (error) => {
                // Lambda never existed - no need to close
            });

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
                return resolve();
            }

            // Wait until the queue is drained
            this.logger?.info(`Waiting for queue to drain for partition ${this.id}`);

            this.q.drain = () => {
                this.logger?.info(`Drained partition ${this.id}`);
                resolve();
            };
        });
        await drainedP;

        // Checkpoint at the latest offset
        await this.checkpointManager.flush();
    }
}
