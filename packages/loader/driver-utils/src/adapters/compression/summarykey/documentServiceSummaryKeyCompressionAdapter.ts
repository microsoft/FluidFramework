/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentStorageService } from "@fluidframework/driver-definitions";
import { DocumentServiceProxy } from "../../../documentServiceProxy";
import { ICompressionStorageConfig } from "../";
import {
	DocumentStorageServiceCompressionAdapter,
} from "./documentStorageServiceSummaryKeyCompressionAdapter";


export class DocumentServiceCompressionAdapter extends DocumentServiceProxy {
	constructor(service: IDocumentService, private readonly _config: ICompressionStorageConfig) {
		super(service);
	}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		const storage = await super.connectToStorage();
		const wrapped = new DocumentStorageServiceCompressionAdapter(storage, this._config);
		await wrapped.getSnapshotTree();
		return wrapped;
	}
}
