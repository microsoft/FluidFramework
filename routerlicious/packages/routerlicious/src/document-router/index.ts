// tslint:disable:ban-types
import { Provider } from "nconf";
import { IPartitionLambdaFactory, IPlugin } from "../kafka-service/lambdas";
import { DocumentLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const pluginConfig = config.get("documentLambda") as string | Object;
    // tslint:disable-next-line:non-literal-require
    const plugin = (typeof pluginConfig === "object" ? pluginConfig : require(pluginConfig)) as IPlugin;

    // Factory used to create document lambda processors
    const factory = await plugin.create(config);

    return new DocumentLambdaFactory(factory);
}
