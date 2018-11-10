import * as core from "@prague/routerlicious/dist/core";
import * as utils from "@prague/routerlicious/dist/utils";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import * as redis from "redis";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { ScriptoriumLambda } from "./lambda";

export class ScriptoriumLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private mongoManager: utils.MongoManager,
        private collection: core.ICollection<any>,
        private io: redis.RedisClient) {
        super();

        this.io.on("error", (error) => {
            // After an IO error we need to recreate the lambda
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        // Takes in the io as well as the collection. I can probably keep the same lambda but only ever give it stuff
        // from a single document
        return new ScriptoriumLambda(this.io, this.collection, context);
    }

    public async dispose(): Promise<void> {
        const mongoClosedP = this.mongoManager.close();
        const publisherP = this.io.quit();
        await Promise.all([mongoClosedP, publisherP]);
    }
}
