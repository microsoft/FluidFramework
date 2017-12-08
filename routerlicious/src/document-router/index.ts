import { Provider } from "nconf";
import { IPartitionLambdaFactory, IPlugin } from "../kafka-service/lambdas";
import { DocumentLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const pluginConfig = config.get("documentLambda") as string | Object;
    const plugin = (typeof pluginConfig === "object" ? pluginConfig : require(pluginConfig)) as IPlugin;

    // Factory used to create document lambda processors
    const factory = await plugin.create(config);

    return new DocumentLambdaFactory(factory);
}

// This probably needs to be a function off of something else - that way the inner lambda
// can return something custom

export const id = "document-router";
