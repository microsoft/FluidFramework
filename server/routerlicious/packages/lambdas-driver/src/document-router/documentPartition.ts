/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartitionLambda, IPartitionLambdaFactory, IQueuedMessage } from "@fluidframework/server-services-core";
import { AsyncQueue, queue } from "async";
import * as _ from "lodash";
import { Provider } from "nconf";
import * as winston from "winston";
import { DocumentContext } from "./documentContext";

export class DocumentPartition {
    private readonly q: AsyncQueue<IQueuedMessage>;
    private readonly lambdaP: Promise<IPartitionLambda>;
    private lambda: IPartitionLambda;
    private corrupt = false;
    private closed = false;
    private activityTimeoutTime: number;

    constructor(
        factory: IPartitionLambdaFactory,
        config: Provider,
        tenantId: string,
        documentId: string,
        public readonly context: DocumentContext,
        private readonly activityTimeout: number) {
        this.updateActivityTime();

        // Default to the git tenant if not specified
        const clonedConfig = _.cloneDeep((config as any).get());
        clonedConfig.tenantId = tenantId;
        clonedConfig.documentId = documentId;
        const documentConfig = new Provider({}).defaults(clonedConfig).use("memory");

        this.q = queue(
            (message: IQueuedMessage, callback) => {
                // Winston.verbose(`${message.topic}:${message.partition}@${message.offset}`);
                try {
                    if (!this.corrupt) {
                        this.lambda.handler(message);
                    } else {
                        // Until we can dead letter - simply checkpoint as handled
                        this.context.checkpoint(message);
                    }
                } catch (error) {
                    // TODO dead letter queue for bad messages, etc... when the lambda is throwing an exception
                    // for now we will simply continue on to keep the queue flowing
                    winston.error("Error processing partition message", error);
                    context.error(error, false);
                    this.corrupt = true;
                }

                // Handle the next message
                callback();
            },
            1);
        this.q.pause();

        this.context.on("error", (error: any, restart: boolean) => {
            if (restart) {
                // ensure no more messages are processed by this partition
                // while the process is restarting / closing
                this.close();
            }
        });

        // Create the lambda to handle the document messages
        this.lambdaP = factory.create(documentConfig, context);
        this.lambdaP.then(
            (lambda) => {
                this.lambda = lambda;
                this.q.resume();
            },
            (error) => {
                context.error(error, true);
                this.q.kill();
            });
    }

    public process(message: IQueuedMessage) {
        if (this.closed) {
            return;
        }

        this.q.push(message);
        this.updateActivityTime();
    }

    public close() {
        if (this.closed) {
            return;
        }

        this.closed = true;

        // Stop any future processing
        this.q.kill();

        if (this.lambda) {
            this.lambda.close();
        } else {
            this.lambdaP.then(
                (lambda) => {
                    lambda.close();
                },
                (error) => {
                    // Lambda was never created - ignoring
                });
        }
    }

    public isInactive(now: number = Date.now()) {
        return now > this.activityTimeoutTime;
    }

    private updateActivityTime() {
        this.activityTimeoutTime = Date.now() + this.activityTimeout;
    }
}
