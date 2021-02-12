/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DefaultServiceConfiguration, IPartitionLambdaFactory, IPlugin } from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import { DocumentLambdaFactory } from "./lambdaFactory";

export * from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    // eslint-disable-next-line @typescript-eslint/ban-types
    const pluginConfig = config.get("documentLambda") as string | object;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const plugin = (typeof pluginConfig === "object" ? pluginConfig : require(pluginConfig)) as IPlugin;

    // Factory used to create document lambda processors
    const factory = await plugin.create(config);

    return new DocumentLambdaFactory(factory, DefaultServiceConfiguration.documentLambda);
}
