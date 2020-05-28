/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IContext,
    IPartitionLambda,
    IPartitionLambdaFactory,
    ITaskMessageSender,
    ITenantManager,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import { ForemanLambda } from "./lambda";

export class ForemanLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private readonly messageSender: ITaskMessageSender,
        private readonly tenantManager: ITenantManager,
        private readonly permissions: any) {
        super();

        this.messageSender.on("error", (error) => {
            // After a message queue error we need to recreate the lambda.
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const tenantId = config.get("tenantId");
        const documentId = config.get("documentId");
        return new ForemanLambda(
            this.messageSender,
            this.tenantManager,
            this.permissions,
            context,
            tenantId,
            documentId);
    }

    public async dispose(): Promise<void> {
        await this.messageSender.close();
    }
}
