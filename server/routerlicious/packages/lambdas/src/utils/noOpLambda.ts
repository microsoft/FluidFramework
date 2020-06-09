/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext, IQueuedMessage, IPartitionLambda } from "@fluidframework/server-services-core";

export class NoOpLambda implements IPartitionLambda {
    constructor(private readonly context: IContext) {
    }

    public handler(message: IQueuedMessage): void {
        this.context.checkpoint(message);
    }

    public close(): void {
    }
}
