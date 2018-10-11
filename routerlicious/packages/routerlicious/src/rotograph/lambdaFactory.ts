import { EventEmitter } from "events";
import { Provider } from "nconf";
import { ITaskMessageSender } from "../core";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { RotographLambda } from "./lambda";

export class RotographLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private messageSender: ITaskMessageSender,
        private permissions: any) {
        super();

        this.messageSender.on("error", (error) => {
            // After a message queue error we need to recreate the lambda.
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new RotographLambda(
            this.permissions,
            context);
    }

    public async dispose(): Promise<void> {
        await this.messageSender.close();
    }
}
