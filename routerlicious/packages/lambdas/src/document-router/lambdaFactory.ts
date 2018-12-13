import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "@prague/services-core";
import { EventEmitter } from "events";
import { Provider } from "nconf";
import { DocumentLambda } from "./documentLambda";

export class DocumentLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
    constructor(private documentLambdaFactory: IPartitionLambdaFactory) {
        super();

        // Forward on any factory errors
        this.documentLambdaFactory.on("error", (error) => {
            this.emit("error", error);
        });
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const lambda = new DocumentLambda(this.documentLambdaFactory, config, context);
        return lambda;
    }

    public async dispose(): Promise<void> {
        await this.documentLambdaFactory.dispose();
    }
}
