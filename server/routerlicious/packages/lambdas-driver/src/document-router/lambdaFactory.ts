/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "@microsoft/fluid-server-services-core";
import { Provider } from "nconf";
import { DocumentLambda } from "./documentLambda";

export class DocumentLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private readonly documentLambdaFactory: IPartitionLambdaFactory,
        private readonly activityTimeout?: number,
    ) {
        super();

        // Forward on any factory errors
        this.documentLambdaFactory.on("error", (error) => {
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const lambda = new DocumentLambda(this.documentLambdaFactory, config, context, this.activityTimeout);
        return lambda;
    }

    public async dispose(): Promise<void> {
        await this.documentLambdaFactory.dispose();
    }
}
