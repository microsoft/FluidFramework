/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext, IKafkaMessage, IPartitionLambda } from "@prague/services-core";

export class NoOpLambda implements IPartitionLambda {
    constructor(private context: IContext) {
    }

    public handler(message: IKafkaMessage): void {
        this.context.checkpoint(message.offset);
    }

    public close(): void {
    }
}
