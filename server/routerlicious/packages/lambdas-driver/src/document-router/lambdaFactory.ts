/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IContext,
    IDocumentLambdaServerConfiguration,
    IPartitionLambda,
    IPartitionLambdaFactory,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import { DocumentLambda } from "./documentLambda";

export class DocumentLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private readonly documentLambdaFactory: IPartitionLambdaFactory,
        private readonly documentLambdaServerConfiguration: IDocumentLambdaServerConfiguration,
    ) {
        super();

        // Forward on any factory errors
        this.documentLambdaFactory.on("error", (error) => {
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new DocumentLambda(
            this.documentLambdaFactory,
            config,
            context,
            this.documentLambdaServerConfiguration);
    }

    public async dispose(): Promise<void> {
        await this.documentLambdaFactory.dispose();
    }
}
