/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentStorageService } from "@fluidframework/driver-definitions";
import { DocumentServiceProxy } from "../../documentServiceProxy";
import { ICompressionStorageConfig, SummaryCompressionProcessor } from "..";
import { DocumentStorageServiceCompressionAdapter as DocumentStorageServiceSummaryBlobCompressionAdapter } from "./summaryblob";
import { DocumentStorageServiceCompressionAdapter as DocumentStorageServiceSummaryKeyCompressionAdapter } from "./summarykey";

export class DocumentServiceCompressionAdapter extends DocumentServiceProxy {
	constructor(service: IDocumentService, private readonly _config: ICompressionStorageConfig) {
		super(service);
	}

	private storageServiceConstructor(): new (
		storage: IDocumentStorageService,
		config: ICompressionStorageConfig,
	) => IDocumentStorageService {
		if (this._config.processor === SummaryCompressionProcessor.SummaryKey) {
			return DocumentStorageServiceSummaryKeyCompressionAdapter;
		} else if (this._config.processor === SummaryCompressionProcessor.SummaryBlob) {
			return DocumentStorageServiceSummaryBlobCompressionAdapter;
		} else {
			throw new Error(`Invalid processor type ${this._config.processor}`);
		}
	}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		const storage = await super.connectToStorage();
		const wrapped = new (this.storageServiceConstructor())(storage, this._config);
		await wrapped.getSnapshotTree();
		return wrapped;
	}
}
