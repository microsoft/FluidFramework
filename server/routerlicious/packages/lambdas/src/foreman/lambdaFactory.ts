/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IContext,
    IPartitionLambda,
    IPartitionLambdaConfig,
    IPartitionLambdaFactory,
    ITaskMessageSender,
    ITenantManager,
    TokenGenerator,
} from "@fluidframework/server-services-core";
import { ForemanLambda } from "./lambda";

export class ForemanLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private readonly messageSender: ITaskMessageSender,
        private readonly tenantManager: ITenantManager,
        private readonly tokenGenerator: TokenGenerator,
        private readonly permissions: any) {
        super();

        this.messageSender.on("error", (error) => {
            // After a message queue error we need to recreate the lambda.
            this.emit("error", error);
        });
    }

    public async create(config: IPartitionLambdaConfig, context: IContext): Promise<IPartitionLambda> {
        return new ForemanLambda(
            this.messageSender,
            this.tenantManager,
            this.tokenGenerator,
            this.permissions,
            context,
            config.tenantId,
            config.documentId);
    }

    public async dispose(): Promise<void> {
        await this.messageSender.close();
    }
}
