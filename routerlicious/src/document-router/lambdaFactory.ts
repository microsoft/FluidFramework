import { Provider } from "nconf";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { DocumentLambda } from "./documentLambda";

export class DocumentLambdaFactory implements IPartitionLambdaFactory {
    constructor(private documentLambdaFactory: IPartitionLambdaFactory) {
    }

    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const lambda = new DocumentLambda(this.documentLambdaFactory, config, context);
        return lambda;
    }

    public async dispose(): Promise<void> {
        await this.documentLambdaFactory.dispose();
    }
}
