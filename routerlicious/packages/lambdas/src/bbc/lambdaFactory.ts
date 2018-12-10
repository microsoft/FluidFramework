import * as services from "@prague/services";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { BBCLambda } from "./lambda";

export class BBCLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(private io: services.SocketIoRedisPublisher) {
        super();

        this.io.on("error", (error) => {
            // After an IO error we need to recreate the lambda
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new BBCLambda(this.io, context);
    }

    public async dispose(): Promise<void> {
        await this.io.close();
    }
}
