/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentService,
	IDocumentServiceFactory,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";

import { DocumentServiceFactoryProxy } from "../../documentServiceFactoryProxy.js";

import { ICompressionStorageConfig } from "./compressionTypes.js";
import { DocumentServiceCompressionAdapter } from "./documentServiceCompressionAdapter.js";
import { DocumentStorageServiceCompressionAdapter as DocumentStorageServiceSummaryBlobCompressionAdapter } from "./summaryblob/index.js";

export class DocumentServiceFactoryCompressionAdapter extends DocumentServiceFactoryProxy {
	constructor(
		serviceFactory: IDocumentServiceFactory,
		private readonly _config: ICompressionStorageConfig,
	) {
		super(serviceFactory);
	}

	public async createContainer(
		createNewSummary: ISummaryTree | undefined,
		createNewResolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		if (createNewSummary !== undefined) {
			const configForInitial = this._config;
			const newAppSumary =
				DocumentStorageServiceSummaryBlobCompressionAdapter.compressSummary(
					createNewSummary.tree[".app"] as ISummaryTree,
					configForInitial,
				);
			createNewSummary.tree[".app"] = newAppSumary;
		}
		const service = await this.serviceFactory.createContainer(
			createNewSummary,
			createNewResolvedUrl,
			logger,
			clientIsSummarizer,
		);
		return new DocumentServiceCompressionAdapter(service, this._config);
	}

	public async createDocumentService(resolvedUrl: IResolvedUrl): Promise<IDocumentService> {
		const service = await this.serviceFactory.createDocumentService(resolvedUrl);
		return new DocumentServiceCompressionAdapter(service, this._config);
	}
}
