/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import { IClient } from "@fluidframework/driver-definitions";
import {
	IDocumentDeltaConnection,
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentStorageService,
	IResolvedUrl,
	ISequencedDocumentMessage,
} from "@fluidframework/driver-definitions/internal";

import { MockDocumentDeltaStorageService } from "./mockDeltaStorage.js";
import { MockDocumentDeltaConnection } from "./mockDocumentDeltaConnection.js";

/**
 * Mock Document Service for testing.
 *
 * @internal
 */
export class MockDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	public get deltaStorageMessages(): ISequencedDocumentMessage[] {
		return this._deltaStorageMessages;
	}

	private nextClientId: number = 0;

	private readonly _deltaStorageMessages: ISequencedDocumentMessage[] = [];

	constructor(
		private readonly deltaStorageFactory?: () => IDocumentDeltaStorageService,
		private readonly deltaConnectionFactory?: (client?: IClient) => IDocumentDeltaConnection,
	) {
		super();
	}

	public dispose(): void {}

	// TODO: Issue-2109 Implement detach container api or put appropriate comment.
	public get resolvedUrl(): IResolvedUrl {
		throw new Error("Not implemented");
	}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		throw new Error("Method not implemented.");
	}
	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		return this.deltaStorageFactory === undefined
			? new MockDocumentDeltaStorageService(this.deltaStorageMessages)
			: this.deltaStorageFactory();
	}
	public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		return this.deltaConnectionFactory === undefined
			? new MockDocumentDeltaConnection(`mock_client_${this.nextClientId++}`)
			: this.deltaConnectionFactory(client);
	}
}
