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
} from "@fluidframework/server-services-core";
import { v4 as uuid } from "uuid";
import { IConcreteNodeFactory } from "./interfaces";
import { LocalNode } from "./localNode";

export class LocalNodeFactory implements IConcreteNodeFactory {
	constructor(
		private readonly hostname: string,
		private readonly address: string,
		private readonly storage: IDocumentStorage,
		private readonly databaseManager: IDatabaseManager,
		private readonly documentRepository: IDocumentRepository,
		private readonly timeoutLength: number,
		private readonly webSocketServerFactory: () => IWebSocketServer,
		private readonly maxMessageSize: number,
		private readonly logger: ILogger,
	) {}

	public async create(): Promise<LocalNode> {
		const node = LocalNode.connect(
			`${this.hostname}-${uuid()}`,
			this.address,
			this.storage,
			this.databaseManager,
			this.documentRepository,
			this.timeoutLength,
			this.webSocketServerFactory,
			this.maxMessageSize,
			this.logger,
		);

		return node;
	}
}
