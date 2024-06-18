/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDocumentService,
	IDocumentStorageService,
} from "@fluidframework/driver-definitions/internal";

import { DocumentServiceProxy } from "../../documentServiceProxy.js";

import { ICompressionStorageConfig } from "./compressionTypes.js";
import { DocumentStorageServiceCompressionAdapter as DocumentStorageServiceSummaryBlobCompressionAdapter } from "./summaryblob/index.js";

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

	/**
	 *
	 * error TS2375: Type 'DocumentStorageServiceCompressionAdapter' is not assignable to type 'IDocumentStorageService' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
	 * @fluidframework/driver-utils:   Types of property 'policies' are incompatible.
	 * @fluidframework/driver-utils:     Type 'IDocumentStorageServicePolicies | undefined' is not assignable to type 'IDocumentStorageServicePolicies'.
	 * @fluidframework/driver-utils:       Type 'undefined' is not assignable to type 'IDocumentStorageServicePolicies'.
	 */
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
