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
        private opCollection: ICollection<any>,
        private contentCollection: ICollection<any>) {
        super();
        console.log("lambda factory constructor");
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        // Takes in the io as well as the collection. I can probably keep the same lambda but only ever give it stuff
        // from a single document
        console.log("lambda factory create");
        return new CopierLambda(context); // this.opCollection, this.contentCollection, context);
    }

    public async dispose(): Promise<void> {
        console.log("lambda factory dispose");
        await this.mongoManager.close();
    }

    public throwaway() {
        return [this.opCollection, this.contentCollection];
    }
}
