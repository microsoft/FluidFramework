/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import {
	IDocumentService,
	IDocumentServiceFactory,
	IDocumentStorageService,
	IResolvedUrl,
	ISummaryContext,
} from "@fluidframework/driver-definitions/internal";

/**
 * @deprecated - unused
 * Wraps the given IDocumentStorageService to override the `uploadSummaryWithContext` method. It calls the
 * `uploadSummaryCb` whenever a summary is uploaded by the client. The summary context can be updated in the
 * callback before it is uploaded to the server.
 * @internal
 */
export function wrapDocumentStorageService(
	innerDocStorageService: IDocumentStorageService,
	uploadSummaryCb: (summaryTree: ISummaryTree, context: ISummaryContext) => ISummaryContext,
) {
	const outerDocStorageService = Object.create(innerDocStorageService) as IDocumentStorageService;
	outerDocStorageService.uploadSummaryWithContext = async (
		summary: ISummaryTree,
		context: ISummaryContext,
	): Promise<string> => {
		const newContext = uploadSummaryCb(summary, context);
		return innerDocStorageService.uploadSummaryWithContext(summary, newContext);
	};
	return outerDocStorageService;
}

/**
 * @deprecated - unused
 * Wraps the given IDocumentService to override the `connectToStorage` method. The intent is to plumb the
 * `uploadSummaryCb` to the IDocumentStorageService so that it is called whenever a summary is uploaded by
 * the client.
 * The document storage service that is created in `connectToStorage` is wrapped by calling `wrapDocumentStorageService`
 * to pass in the `uploadSummaryCb`.
 * @internal
 */
export function wrapDocumentService(
	innerDocService: IDocumentService,
	uploadSummaryCb: (summaryTree: ISummaryTree, context: ISummaryContext) => ISummaryContext,
) {
	const outerDocService = Object.create(innerDocService) as IDocumentService;
	outerDocService.connectToStorage = async (): Promise<IDocumentStorageService> => {
		const storageService = await innerDocService.connectToStorage();
		return wrapDocumentStorageService(storageService, uploadSummaryCb);
	};
	return outerDocService;
}

/**
 * @deprecated - unused
 * Wraps the given IDocumentServiceFactory to override the `createDocumentService` method. The intent is to plumb
 * the `uploadSummaryCb` all the way to the IDocumentStorageService so that it is called whenever a summary is
 * uploaded by the client.
 * The document service that is created in `createDocumentService` is wrapped by calling `wrapDocumentService` to
 * pass in the `uploadSummaryCb`.
 * @internal
 */
export function wrapDocumentServiceFactory(
	innerDocServiceFactory: IDocumentServiceFactory,
	uploadSummaryCb: (summaryTree: ISummaryTree, context: ISummaryContext) => ISummaryContext,
) {
	const outerDocServiceFactory = Object.create(innerDocServiceFactory) as IDocumentServiceFactory;
	outerDocServiceFactory.createDocumentService = async (
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> => {
		const documentService = await innerDocServiceFactory.createDocumentService(
			resolvedUrl,
			logger,
			clientIsSummarizer,
		);
		return wrapDocumentService(documentService, uploadSummaryCb);
	};
	return outerDocServiceFactory;
}
