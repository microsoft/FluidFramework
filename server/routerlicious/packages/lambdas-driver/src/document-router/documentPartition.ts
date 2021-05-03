/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { inspect } from "util";
import {
    IContextErrorData,
    IPartitionConfig,
    IPartitionLambda,
    IPartitionLambdaConfig,
    IPartitionLambdaFactory,
    IQueuedMessage,
    LambdaCloseType,
} from "@fluidframework/server-services-core";
import { QueueObject, queue } from "async";
import * as _ from "lodash";
import { DocumentContext } from "./documentContext";

export class DocumentPartition {
    private readonly q: QueueObject<IQueuedMessage>;
    private readonly lambdaP: Promise<IPartitionLambda>;
    private lambda: IPartitionLambda | undefined;
    private corrupt = false;
    private closed = false;
    private activityTimeoutTime: number | undefined;

    constructor(
        factory: IPartitionLambdaFactory,
        config: IPartitionConfig,
        private readonly tenantId: string,
        private readonly documentId: string,
        public readonly context: DocumentContext,
        private readonly activityTimeout: number) {
        this.updateActivityTime();

        const documentConfig: IPartitionLambdaConfig = {
            leaderEpoch: config.leaderEpoch,
            tenantId,
            documentId,
        };

        this.q = queue(
            (message: IQueuedMessage, callback) => {
                // Winston.verbose(`${message.topic}:${message.partition}@${message.offset}`);
                try {
                    if (!this.corrupt) {
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        const optionalPromise = this.lambda!.handler(message);
                        if (optionalPromise) {
                            optionalPromise
                                .then(callback as any)
                                .catch((error) => {
                                    this.markAsCorrupt(message, error);
                                    callback();
                                });
                            return;
                        }
                    } else {
                        // Until we can dead letter - simply checkpoint as handled
                        this.context.checkpoint(message);
                    }
                } catch (error) {
                    // TODO dead letter queue for bad messages, etc... when the lambda is throwing an exception
                    // for now we will simply continue on to keep the queue flowing
                    this.markAsCorrupt(message, error);
                }

                // Handle the next message
                callback();
            },
            1);
        this.q.pause();

        this.context.on("error", (error: any, errorData: IContextErrorData) => {
            if (errorData.restart) {
                // ensure no more messages are processed by this partition
                // while the process is restarting / closing
                this.close(LambdaCloseType.Error);
            }
        });

        // Create the lambda to handle the document messages
        this.lambdaP = factory.create(documentConfig, context, this.updateActivityTime.bind(this));
        this.lambdaP.then(
            (lambda) => {
                this.lambda = lambda;
                this.q.resume();
            },
            (error) => {
                context.error(error, { restart: true, tenantId, documentId });
                this.q.kill();
            });
    }

    public process(message: IQueuedMessage) {
        if (this.closed) {
            return;
        }

        void this.q.push(message);
        this.updateActivityTime();
    }

    public close(closeType: LambdaCloseType) {
        if (this.closed) {
            return;
        }

        this.closed = true;

        // Stop any future processing
        this.q.kill();

        if (this.lambda) {
            this.lambda.close(closeType);
        } else {
            this.lambdaP.then(
                (lambda) => {
                    lambda.close(closeType);
                },
                (error) => {
                    // Lambda was never created - ignoring
                });
        }
    }

    public isInactive(now: number = Date.now()) {
        return !this.context.hasPendingWork() && this.activityTimeoutTime && now > this.activityTimeoutTime;
    }

    /**
     * Marks this document partition as corrupt
     * Future messages will be checkpointed but no real processing will happen
     */
    private markAsCorrupt(message: IQueuedMessage, error: any) {
        this.corrupt = true;
        this.context.log?.error(
            `Marking document as corrupted due to error: ${inspect(error)}`,
            {
                messageMetaData: {
                    documentId: this.documentId,
                    tenantId: this.tenantId,
                },
            });
        this.context.error(error, { restart: false, tenantId: this.tenantId, documentId: this.documentId });
        this.context.checkpoint(message);
    }

    private updateActivityTime() {
        this.activityTimeoutTime = Date.now() + this.activityTimeout;
    }
}
