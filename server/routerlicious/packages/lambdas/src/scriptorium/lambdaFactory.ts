/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
	ICollection,
	IContext,
	IPartitionLambda,
	IPartitionLambdaFactory,
	MongoManager,
} from "@fluidframework/server-services-core";
import { ScriptoriumLambda } from "./lambda";

/**
 * @internal
 */
export class ScriptoriumLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
	constructor(
		private readonly mongoManager: MongoManager,
		private readonly opCollection: ICollection<any>,
		private readonly providerConfig: Record<string, any> | undefined,
	) {
		super();
	}

	public async create(config: undefined, context: IContext): Promise<IPartitionLambda> {
		// Takes in the io as well as the collection. I can probably keep the same lambda but only ever give it stuff
		// from a single document
		return new ScriptoriumLambda(
			this.opCollection,
			context,
			this.providerConfig,
			this.mongoManager.healthCheck,
		);
	}

	public async dispose(): Promise<void> {
		await this.mongoManager.close();
	}
}
