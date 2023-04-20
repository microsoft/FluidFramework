/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentStorageService } from "@fluidframework/driver-definitions";
import { DocumentServiceProxy } from "../../documentServiceProxy";
import { ICompressionStorageConfig , DocumentStorageServiceCompressionAdapter } from "./documentStorageServiceCompressionAdapter";

export class DocumentServiceCompressionAdapter extends DocumentServiceProxy {
	private readonly originConnectToStorage: () => Promise<IDocumentStorageService>;
	constructor(service: IDocumentService, private readonly _config: ICompressionStorageConfig) {
		super(service);
		this.originConnectToStorage = this.service.connectToStorage.bind(this.service);
		service.connectToStorage = this.connectToStorageOverride.bind(this);
	}

	public async connectToStorageOverride(): Promise<IDocumentStorageService> {
		if(this.hasStorage()) {
			return this.originConnectToStorage();
		}
		else {
			const storage = await this.originConnectToStorage();
			const wrapped = new DocumentStorageServiceCompressionAdapter(storage, this._config);
			this.saveStorage(wrapped);
			return wrapped;
		}
	}
}
