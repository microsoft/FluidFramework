/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IKafkaMessage, IPartitionLambda, IPartitionLambdaFactory } from "@prague/services-core";
import { AsyncQueue, queue } from "async";
import * as _ from "lodash";
import { Provider } from "nconf";
import * as winston from "winston";
import { DocumentContext } from "./documentContext";

export class DocumentPartition {
    private q: AsyncQueue<IKafkaMessage>;
    private lambdaP: Promise<IPartitionLambda>;
    private lambda: IPartitionLambda;
    private corrupt = false;

    constructor(
        factory: IPartitionLambdaFactory,
        config: Provider,
        tenantId: string,
        documentId: string,
        public context: DocumentContext) {

        // default to the git tenant if not specified
        const clonedConfig = _.cloneDeep((config as any).get());
        clonedConfig.tenantId = tenantId;
        clonedConfig.documentId = documentId;
        const documentConfig = new Provider({}).defaults(clonedConfig).use("memory");

        this.q = queue(
            (message: IKafkaMessage, callback) => {
                // winston.verbose(`${message.topic}:${message.partition}@${message.offset}`);
                try {
                    if (!this.corrupt) {
                        this.lambda.handler(message);
                    } else {
                        // Until we can dead letter - simply checkpoint as handled
                        this.context.checkpoint(message.offset);
                    }
                } catch (error) {
                    // TODO dead letter queue for bad messages, etc... when the lambda is throwing an exception
                    // for now we will simply continue on to keep the queue flowing
                    winston.error("Error processing partition message", error);
                    this.corrupt = true;
                }

                // handle the next message
                callback();
            },
            1);
        this.q.pause();

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

    public process(message: IKafkaMessage) {
        this.q.push(message);
    }

    public close() {
        // Stop any future processing
        this.q.kill();

        this.lambdaP.then(
            (lambda) => {
                lambda.close();
            },
            (error) => {
                // Lambda was never created - ignoring
            });
    }
}
