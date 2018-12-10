import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "@prague/lambdas";
import { ITaskMessageSender, ITenantManager } from "@prague/services-core";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import { AzureMediaServicesManager } from "./amsUtils";
import { RotographLambda } from "./lambda";

export class RotographLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    private AMSHelper: AzureMediaServicesManager;
    constructor(
        private messageSender: ITaskMessageSender,
        private tenantManager: ITenantManager,
        private config: any) {
        super();

        this.AMSHelper = new AzureMediaServicesManager(config);
        this.AMSHelper.getToken();
        this.messageSender.on("error", (error) => {
            // After a message queue error we need to recreate the lambda.
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {

        return new RotographLambda(
            this.config.permissions,
            context,
            this.AMSHelper,
            this.tenantManager);
    }

    public async dispose(): Promise<void> {
        await this.messageSender.close();
    }
}
