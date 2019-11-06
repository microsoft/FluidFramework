/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICollection,
    IContext,
    IPartitionLambda,
    IPartitionLambdaFactory,
    MongoManager,
} from "@microsoft/fluid-server-services-core";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import { CopierLambda } from "./lambda";

export class CopierLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private mongoManager: MongoManager,
        private rawOpCollection: ICollection<any>) {
        super();
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new CopierLambda(this.rawOpCollection, context);
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }
}
