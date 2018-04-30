import { EventEmitter } from "events";
import { Provider } from "nconf";
import * as core from "../core";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as services from "../services";
import * as utils from "../utils";
import { ScriptoriumLambda } from "./lambda";

export class ScriptoriumLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private mongoManager: utils.MongoManager,
        private collection: core.ICollection<any>,
        private io: services.SocketIoRedisPublisher) {
        super();

        this.io.on("error", (error) => {
            // After an IO error we need to recreate the lambda
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new ScriptoriumLambda(this.io, this.collection, context);
    }

    public async dispose(): Promise<void> {
        const mongoClosedP = this.mongoManager.close();
        const publisherP = this.io.close();
        await Promise.all([mongoClosedP, publisherP]);
    }
}
