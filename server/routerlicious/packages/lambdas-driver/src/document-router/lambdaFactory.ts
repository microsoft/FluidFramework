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
 * @internal
 */
export class DocumentLambdaFactory<T> extends EventEmitter implements IPartitionLambdaFactory<T> {
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

	public async create(config: T, context: IContext): Promise<IPartitionLambda> {
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
