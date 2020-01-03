/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
    IContext,
    IClosablePublisher,
    IPartitionLambda,
    IPartitionLambdaFactory,
} from "@microsoft/fluid-server-services-core";
import { Provider } from "nconf";
import { BroadcasterLambda } from "./lambda";

export class BroadcasterLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(private readonly publisher: IClosablePublisher) {
        super();

        this.publisher.on("error", (error) => {
            // After an IO error we need to recreate the lambda
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new BroadcasterLambda(this.publisher, context);
    }

    public async dispose(): Promise<void> {
        await this.publisher.close();
    }
}
