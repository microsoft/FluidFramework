import { EventEmitter } from "events";
import { Provider } from "nconf";
import { ITaskMessageSender, ITenantManager } from "../core";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { TmzLambda } from "./lambda";

export class TmzLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(
        private messageSender: ITaskMessageSender,
        private tenantManager: ITenantManager,
        private permissions: any) {
        super();

        this.messageSender.on("error", (error) => {
            // After a message queue error we need to recreate the lambda.
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        return new TmzLambda(
            this.messageSender,
            this.tenantManager,
            this.permissions,
            context);
    }

    public async dispose(): Promise<void> {
        await this.messageSender.close();
    }
}
