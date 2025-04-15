/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDatabaseManager,
	IDocumentStorage,
	IWebSocketServer,
	ILogger,
	IDocumentRepository,
	ICheckpointRepository,
	CheckpointService,
} from "@fluidframework/server-services-core";
import { IConcreteNodeFactory } from "./interfaces";
import { LocalNode } from "./localNode";

/**
 * @internal
 */
export class LocalNodeFactory implements IConcreteNodeFactory {
	constructor(
		private readonly hostname: string,
		private readonly address: string,
		private readonly storage: IDocumentStorage,
		private readonly databaseManager: IDatabaseManager,
		private readonly documentRepository: IDocumentRepository,
		private readonly deliCheckpointRepository: ICheckpointRepository,
		private readonly scribeCheckpointRepository: ICheckpointRepository,
		private readonly deliCheckpointService: CheckpointService,
		private readonly scribeCheckpointService: CheckpointService,
		private readonly timeoutLength: number,
		private readonly webSocketServerFactory: () => IWebSocketServer,
		private readonly maxMessageSize: number,
		private readonly logger: ILogger,
	) {}

	public async create(): Promise<LocalNode> {
		const node = LocalNode.connect(
			`${this.hostname}-${crypto.randomUUID()}`,
			this.address,
			this.storage,
			this.databaseManager,
			this.documentRepository,
			this.deliCheckpointRepository,
			this.scribeCheckpointRepository,
			this.deliCheckpointService,
			this.scribeCheckpointService,
			this.timeoutLength,
			this.webSocketServerFactory,
			this.maxMessageSize,
			this.logger,
		);

		return node;
	}
}
