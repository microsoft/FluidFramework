/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import {
	IContext,
	IDocumentLambdaServerConfiguration,
	IPartitionLambdaConfig,
	IPartitionLambda,
	IPartitionLambdaFactory,
} from "@fluidframework/server-services-core";
import { DocumentLambda } from "./documentLambda";

/**
 * @typeParam TConfig - The configuration type for the lambdas created by this factory
 * @internal
 */
export class DocumentLambdaFactory<TConfig>
	extends EventEmitter
	implements IPartitionLambdaFactory<TConfig>
{
	constructor(
		private readonly documentLambdaFactory: IPartitionLambdaFactory<IPartitionLambdaConfig>,
		private readonly documentLambdaServerConfiguration: IDocumentLambdaServerConfiguration,
	) {
		super();

		// Forward on any factory errors
		this.documentLambdaFactory.on("error", (error) => {
			this.emit("error", error);
		});
	}

	public async create(config: TConfig, context: IContext): Promise<IPartitionLambda> {
		return new DocumentLambda(
			this.documentLambdaFactory,
			context,
			this.documentLambdaServerConfiguration,
		);
	}

	public async dispose(): Promise<void> {
		await this.documentLambdaFactory.dispose();
	}
}
