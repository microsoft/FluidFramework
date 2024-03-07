/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentStorageService } from "@fluidframework/driver-definitions";
import { DocumentServiceProxy } from "../../documentServiceProxy.js";
import { DocumentStorageServiceCompressionAdapter as DocumentStorageServiceSummaryBlobCompressionAdapter } from "./summaryblob/index.js";
import { ICompressionStorageConfig } from "./compressionTypes.js";

export class DocumentServiceCompressionAdapter extends DocumentServiceProxy {
	constructor(
		service: IDocumentService,
		private readonly _config: ICompressionStorageConfig,
	) {
		super(service);
		// Back-compat Old driver
		if (service.on !== undefined) {
			service.on("metadataUpdate", (metadata: Record<string, string>) =>
				this.emit("metadataUpdate", metadata),
			);
		}
	}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		const storage = await super.connectToStorage();
		const wrapped = new DocumentStorageServiceSummaryBlobCompressionAdapter(
			storage,
			this._config,
		);
		await wrapped.getSnapshotTree();
		return wrapped;
	}
}
