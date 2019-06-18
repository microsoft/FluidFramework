/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartitionLambdaFactory, IPlugin } from "@prague/services-core";
import { Provider } from "nconf";
import { DocumentLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const pluginConfig = config.get("documentLambda") as string | object;
    // tslint:disable-next-line:non-literal-require
    const plugin = (typeof pluginConfig === "object" ? pluginConfig : require(pluginConfig)) as IPlugin;

    // Factory used to create document lambda processors
    const factory = await plugin.create(config);

    return new DocumentLambdaFactory(factory);
}
