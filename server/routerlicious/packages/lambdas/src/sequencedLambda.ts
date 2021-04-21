/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext, IQueuedMessage, IPartitionLambda } from "@fluidframework/server-services-core";
import { QueueObject, queue } from "async";

/**
 * A sequenced lambda processes incoming messages one at a time based on a promise returned by the message handler.
 */
export abstract class SequencedLambda implements IPartitionLambda {
    protected tenantId: string | undefined;
    protected documentId: string | undefined;

    private readonly q: QueueObject<IQueuedMessage>;

    constructor(protected context: IContext) {
        this.q = queue((message: IQueuedMessage, callback) => {
            this.handlerCore(message).then(
                () => {
                    callback();
                },
                (error) => {
                    callback(error);
                });
        }, 1);

        this.q.error((error) => {
            context.error(error, {
                restart: true,
                tenantId: this.tenantId,
                documentId: this.documentId,
            });
        });
    }

    public handler(message: IQueuedMessage): void {
        void this.q.push(message);
    }

    public close() {
        this.q.kill();
    }

    /**
     * Derived classes override this method to do per message processing. The sequenced lambda will only move on
     * to the next message once the returned promise is resolved.
     */
    protected abstract handlerCore(message: IQueuedMessage): Promise<void>;
}
