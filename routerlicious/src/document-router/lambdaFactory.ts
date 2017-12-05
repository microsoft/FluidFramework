import { Provider } from "nconf";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { DocumentLambda } from "./documentLambda";

export class DocumentLambdaFactory implements IPartitionLambdaFactory {
    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const plugin = require(config.get("documentLambda"));
        const factory = plugin.create() as IPartitionLambdaFactory;

        return new DocumentLambda(factory, config, context);
    }
}
