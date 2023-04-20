/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentDeltaConnection, IDocumentDeltaStorageService, IDocumentService, IDocumentStorageService, IResolvedUrl } from "@fluidframework/driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";


/**
 * This abstract class implements IDocumentService interface. It uses delegation pattern.
 * It delegates all calls to IDocumentService implementation passed to constructor.
 */

export abstract class DocumentServiceProxy implements IDocumentService {

	constructor (private readonly _service: IDocumentService) {}

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

	public saveStorage(storage: IDocumentStorageService): void {
		if(this._service.saveStorage !== undefined) {
			this._service.saveStorage(storage);
		}
		else {
			throw new Error("saveStorage is not implemented");
		}
	}

	public hasStorage(): boolean {
		if(this._service.hasStorage !== undefined) {
			return this._service.hasStorage();
		}
		else {
			throw new Error("hasStorage is not implemented");
		}
	}

}

