/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext, IKafkaMessage, IPartitionLambda } from "@microsoft/fluid-server-services-core";

export class NoOpLambda implements IPartitionLambda {
    constructor(private readonly context: IContext) {
    }

    public handler(message: IKafkaMessage): void {
        this.context.checkpoint(message);
    }

    public close(): void {
    }
}
