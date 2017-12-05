import { Provider } from "nconf";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import { DocumentLambda } from "./documentLambda";

export class DocumentLambdaFactory implements IPartitionLambdaFactory {
    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        const pluginConfig = config.get("documentLambda") as string | Object;
        const plugin = typeof pluginConfig === "object" ? pluginConfig : require(pluginConfig);
        const factory = plugin.create() as IPartitionLambdaFactory;

        return new DocumentLambda(factory, config, context);
    }
}
