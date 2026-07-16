/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IDocumentServiceFactory } from "@fluidframework/driver-definitions/internal";
import { DocumentServiceFactoryProxy } from "@fluidframework/driver-utils/internal";

import { OdspDocumentServiceFactoryCore } from "../odspDocumentServiceFactoryCore.js";

/**
 * Creates read-only document services materialized at a requested Fluid sequence number.
 *
 * @internal
 */
export class OdspPointInTimeDocumentServiceFactory extends DocumentServiceFactoryProxy {
	public constructor(
		private readonly odspDocumentServiceFactory: OdspDocumentServiceFactoryCore,
		private readonly targetSequenceNumber: number,
	) {
		super(odspDocumentServiceFactory);
	}

	public override async createDocumentService(
		resolvedUrl: Parameters<OdspDocumentServiceFactoryCore["createDocumentService"]>[0],
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	) {
		return this.odspDocumentServiceFactory.createPointInTimeDocumentService(
			resolvedUrl,
			this.targetSequenceNumber,
			logger,
			clientIsSummarizer,
		);
	}
}

/**
 * Decorates an ODSP document service factory for point-in-time loading.
 *
 * @internal
 */
export function createOdspPointInTimeDocumentServiceFactory(
	documentServiceFactory: IDocumentServiceFactory,
	targetSequenceNumber: number,
): OdspPointInTimeDocumentServiceFactory {
	if (!(documentServiceFactory instanceof OdspDocumentServiceFactoryCore)) {
		throw new Error(
			"Point-in-time loading requires an OdspDocumentServiceFactoryCore document service factory.",
		);
	}

	return new OdspPointInTimeDocumentServiceFactory(
		documentServiceFactory,
		targetSequenceNumber,
	);
}
