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

import { CopierLambda } from "./lambda";

/**
 * @internal
 */
export class CopierLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
	constructor(
		private readonly mongoManager: MongoManager,
		private readonly rawOpCollection: ICollection<any>,
	) {
		super();
	}

	public async create(config: undefined, context: IContext): Promise<IPartitionLambda> {
		return new CopierLambda(this.rawOpCollection, context);
	}

	public async dispose(): Promise<void> {
		await this.mongoManager.close();
	}
}
