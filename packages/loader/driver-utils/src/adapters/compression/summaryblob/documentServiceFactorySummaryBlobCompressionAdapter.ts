/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import {
	IDocumentService,
	IDocumentServiceFactory,
	IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { DocumentServiceFactoryProxy } from "../../../documentServiceFactoryProxy";
import { ICompressionStorageConfig } from "../";
import { DocumentStorageServiceCompressionAdapter } from "./documentStorageServiceSummaryBlobCompressionAdapter";
import { DocumentServiceCompressionAdapter } from "./documentServiceSummaryBlobCompressionAdapter";

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
			const newAppSumary = DocumentStorageServiceCompressionAdapter.compressSummary(
				createNewSummary.tree[".app"] as ISummaryTree,
				this._config,
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
