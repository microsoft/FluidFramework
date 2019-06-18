/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as services from "@prague/services";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "@prague/services-core";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import { BroadcasterLambda } from "./lambda";

export class BroadcasterLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(private io: services.SocketIoRedisPublisher) {
        super();

        this.io.on("error", (error) => {
            // After an IO error we need to recreate the lambda
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new BroadcasterLambda(this.io, context);
    }

    public async dispose(): Promise<void> {
        await this.io.close();
    }
}
