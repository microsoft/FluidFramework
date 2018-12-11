import {
    ICollection,
    IContext,
    IPartitionLambda,
    IPartitionLambdaFactory,
} from "@prague/services-core";
import { MongoManager } from "@prague/services-utils";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import { ScriptoriumLambda } from "./lambda";

export class ScriptoriumLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private mongoManager: MongoManager,
        private opCollection: ICollection<any>,
        private contentCollection: ICollection<any>) {
        super();
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        // Takes in the io as well as the collection. I can probably keep the same lambda but only ever give it stuff
        // from a single document
        return new ScriptoriumLambda(this.opCollection, this.contentCollection, context);
    }

    public async dispose(): Promise<void> {
        await this.mongoManager.close();
    }
}
