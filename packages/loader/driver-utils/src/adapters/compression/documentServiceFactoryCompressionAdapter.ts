/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/common-definitions";
import { IDocumentService, IDocumentServiceFactory, IResolvedUrl } from "@fluidframework/driver-definitions";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { ICompressionStorageConfig } from "../predefinedAdapters";
import { DocumentServiceFactoryProxy } from "../../documentServiceFactoryProxy";



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
	): Promise<IDocumentService>{
		const service = await this.serviceFactory.createContainer(
			createNewSummary,
			createNewResolvedUrl,
			logger,
			clientIsSummarizer,
		);
		return service;
	}

	public async createDocumentService(
		resolvedUrl: IResolvedUrl,
	): Promise<IDocumentService> {
		const service = await this.serviceFactory.createDocumentService(resolvedUrl);
		return service;
	}


}