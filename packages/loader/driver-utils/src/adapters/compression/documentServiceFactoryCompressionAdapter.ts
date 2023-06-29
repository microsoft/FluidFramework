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
import { DocumentServiceFactoryProxy } from "../../documentServiceFactoryProxy";
import { ICompressionStorageConfig } from "..";
import { DocumentStorageServiceCompressionAdapter as DocumentStorageServiceSummaryBlobCompressionAdapter } from "./summaryblob";
import { DocumentServiceCompressionAdapter } from "./documentServiceCompressionAdapter";

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
			// TODO : this is a hack to make sure that the initial summary is not compressed
			// We must prevent the initial summary from being compressed because
			// of the hack at packages/drivers/routerlicious-driver/src/createNewUtils.ts
			// where the binary blob is converted to a string using UTF-8 encoding
			// which is producing incorrect results for compressed data.
			const configForInitial = {
				...this._config,
				minSizeToCompress: Number.POSITIVE_INFINITY,
			};
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
