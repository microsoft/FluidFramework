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
	create(
		config: nconf.Provider,
		customization?: Record<string, any>,
	): Promise<IPartitionLambdaFactory>;
}

export async function createDocumentRouter(
	config: nconf.Provider,
	customization?: Record<string, any>,
): Promise<IPartitionLambdaFactory<IPartitionConfig>> {
	const pluginConfig = config.get("documentLambda") as string | object;
	const plugin = // eslint-disable-next-line @typescript-eslint/no-require-imports
		(typeof pluginConfig === "object" ? pluginConfig : require(pluginConfig)) as IPlugin;

	// Factory used to create document lambda processors
	const factory = await plugin.create(config, customization);

	return new DocumentLambdaFactory(factory, DefaultServiceConfiguration.documentLambda);
}
