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
} from "@fluidframework/driver-definitions/internal";

/**
 * This abstract class implements IDocumentService interface. It uses delegation pattern.
 * It delegates all calls to IDocumentService implementation passed to constructor.
 */

export abstract class DocumentServiceProxy
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	constructor(private readonly _service: IDocumentService) {
		super();
	}

	public get service(): IDocumentService {
		return this._service;
	}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		return this._service.connectToStorage();
	}

	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		return this._service.connectToDeltaStorage();
	}

	public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		return this._service.connectToDeltaStream(client);
	}

	public dispose(error?: any): void {
		this._service.dispose(error);
	}

	public get resolvedUrl(): IResolvedUrl {
		return this._service.resolvedUrl;
	}
}
