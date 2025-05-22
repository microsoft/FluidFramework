/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import {
	IContext,
	IPublisher,
	IPartitionLambda,
	IPartitionLambdaFactory,
	IServiceConfiguration,
	IClientManager,
} from "@fluidframework/server-services-core";

import { BroadcasterLambda } from "./lambda";

/**
 * @internal
 */
export class BroadcasterLambdaFactory extends EventEmitter implements IPartitionLambdaFactory {
	constructor(
		private readonly publisher: IPublisher,
		private readonly serviceConfiguration: IServiceConfiguration,
		private readonly clientManager: IClientManager | undefined,
	) {
		super();

		this.publisher.on("error", (error) => {
			// After an IO error we need to recreate the lambda
			this.emit("error", error);
		});
	}

	public async create(config: undefined, context: IContext): Promise<IPartitionLambda> {
		return new BroadcasterLambda(
			this.publisher,
			context,
			this.serviceConfiguration,
			this.clientManager,
		);
	}

	public async dispose(): Promise<void> {
		await this.publisher.close();
	}
}
