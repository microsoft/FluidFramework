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

/**
 * This abstract class implements IDocumentServiceFactory interface. It uses delegation pattern.
 * It delegates all calls to IDocumentServiceFactory implementation passed to constructor.
 */

export abstract class DocumentServiceFactoryProxy implements IDocumentServiceFactory {
	constructor(private readonly _serviceFactory: IDocumentServiceFactory) {}

	public get serviceFactory(): IDocumentServiceFactory {
		return this._serviceFactory;
	}

	public async createContainer(
		createNewSummary: ISummaryTree | undefined,
		createNewResolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		return this.serviceFactory.createContainer(
			createNewSummary,
			createNewResolvedUrl,
			logger,
			clientIsSummarizer,
		);
	}

	public async createDocumentService(
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		return this.serviceFactory.createDocumentService(resolvedUrl, logger, clientIsSummarizer);
	}
}
