/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DocumentLambdaFactory } from "@fluidframework/server-lambdas-driver";
import {
    DefaultServiceConfiguration,
    IPartitionConfig,
    IPartitionLambdaFactory,
} from "@fluidframework/server-services-core";
import nconf from "nconf";

/**
 * Lambda plugin definition
 */
export interface IPlugin {
    /**
     * Creates and returns a new lambda factory. Config is provided should the factory need to load any resources
     * prior to being fully constructed.
     */
    create(config: nconf.Provider): Promise<IPartitionLambdaFactory>;
}

export async function createDocumentRouter(config: nconf.Provider): Promise<IPartitionLambdaFactory<IPartitionConfig>> {
    // eslint-disable-next-line @typescript-eslint/ban-types
    const pluginConfig = config.get("documentLambda") as string | object;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const plugin = (typeof pluginConfig === "object" ? pluginConfig : require(pluginConfig)) as IPlugin;

    // Factory used to create document lambda processors
    const factory = await plugin.create(config);

    return new DocumentLambdaFactory(factory, DefaultServiceConfiguration.documentLambda);
}
