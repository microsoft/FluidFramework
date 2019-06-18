/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IConsumer, IKafkaMessage, IPartitionLambda, IPartitionLambdaFactory } from "@prague/services-core";
import { AsyncQueue, queue } from "async";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import * as winston from "winston";
import { CheckpointManager } from "./checkpointManager";
import { Context } from "./context";

/**
 * Partition of a message stream. Manages routing messages to individual handlers. And then maintaining the
 * overall partition offset.
 */
export class Partition extends EventEmitter {
    private q: AsyncQueue<IKafkaMessage>;
    private lambdaP: Promise<IPartitionLambda>;
    private lambda: IPartitionLambda;
    private checkpointManager: CheckpointManager;
    private context: Context;

    constructor(
        id: number,
        factory: IPartitionLambdaFactory,
        consumer: IConsumer,
        config: Provider) {
        super();

        this.checkpointManager = new CheckpointManager(id, consumer);
        this.context = new Context(this.checkpointManager);
        this.context.on("error", (error: any, restart: boolean) => {
            this.emit("error", error, restart);
        });

        // Create the incoming message queue
        this.q = queue(
            (message: IKafkaMessage, callback) => {
                try {
                    this.lambda.handler(message);
                    callback();
                } catch (error) {
                    callback(error);
                }
            },
            1);
        this.q.pause();

        this.lambdaP = factory.create(config, this.context);
        this.lambdaP.then(
            (lambda) => {
                this.lambda = lambda;
                this.q.resume();
            },
            (error) => {
                this.emit("error", error, true);
                this.q.kill();
            });

        this.q.error = (error) => {
            this.emit("error", error, true);
        };
    }

    public process(rawMessage: IKafkaMessage) {
        this.q.push(rawMessage);
    }

    public close(): void {
        // Stop any pending message processing
        this.q.kill();

        // Close checkpoint related classes
        this.checkpointManager.close();
        this.context.close();

        // Notify the lambda (should it be resolved) of the close
        this.lambdaP.then(
            (lambda) => {
                lambda.close();
            },
            (error) => {
                // lambda never existed - no need to close
            });

        return;
    }

    /**
     * Stops processing on the partition
     */
    public async drain(): Promise<void> {
        // Drain the queue of any pending operations
        const drainedP = new Promise<void>((resolve, reject) => {
            // If not entries in the queue we can exit immediatley
            if (this.q.length() === 0) {
                winston.info("No pending work exiting early");
                return resolve();
            }

            // Wait until the queue is drained
            winston.info("Waiting for queue to drain");
            this.q.drain = () => {
                winston.info("Drained");
                resolve();
            };
        });
        await drainedP;

        // checkpoint at the latest offset
        await this.checkpointManager.flush();
    }
}
