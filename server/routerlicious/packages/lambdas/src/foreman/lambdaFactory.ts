/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IContext,
    IPartitionLambda,
    IPartitionLambdaFactory,
    ITaskMessageSender,
    ITenantManager,
} from "@microsoft/fluid-server-services-core";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import { ForemanLambda } from "./lambda";

export class ForemanLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private messageSender: ITaskMessageSender,
        private tenantManager: ITenantManager,
        private permissions: any) {
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
