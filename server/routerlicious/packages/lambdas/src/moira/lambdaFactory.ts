/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import {
	IContext,
	IPartitionLambda,
	IPartitionLambdaConfig,
	IPartitionLambdaFactory,
	IServiceConfiguration,
	MongoManager,
} from "@fluidframework/server-services-core";

import { MoiraLambda } from "./lambda";

/**
 * @internal
 */
export class MoiraLambdaFactory
	extends EventEmitter
	implements IPartitionLambdaFactory<IPartitionLambdaConfig>
{
	constructor(
		private readonly mongoManager: MongoManager,
		private readonly serviceConfiguration: IServiceConfiguration,
	) {
		super();
	}

	public async create(
		config: IPartitionLambdaConfig,
		context: IContext,
	): Promise<IPartitionLambda> {
		// Takes in the io as well as the collection. I can probably keep the same lambda but only ever give it stuff
		// from a single document
		return new MoiraLambda(
			context,
			this.serviceConfiguration,
			config.tenantId,
			config.documentId,
		);
	}

	public async dispose(): Promise<void> {
		await this.mongoManager.close();
	}
}
