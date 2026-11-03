/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type {
	IDocumentService,
	IDocumentServiceFactory,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/driver-utils/internal";

/**
 * A document service factory that can materialize a document at a specific sequence number.
 *
 * @remarks
 * This is a capability a driver's {@link IDocumentServiceFactory} may additionally implement. The
 * loader detects it (see {@link asPointInTimeCapableFactory}) so that
 * {@link loadContainerToSequenceNumber} can drive point-in-time loading without the caller having to
 * wrap or decorate their factory. The driver owns selecting a snapshot at or before the target and
 * replaying the remaining ops on top of it.
 */
interface IPointInTimeCapableDocumentServiceFactory {
	/**
	 * Creates a read-only document service materialized at `targetSequenceNumber`: storage serves a
	 * snapshot at or before the target and delta storage supplies the ops needed to advance to it.
	 */
	createPointInTimeDocumentService(
		resolvedUrl: IResolvedUrl,
		targetSequenceNumber: number,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService>;
}

/**
 * Returns the factory typed as point-in-time capable if it implements
 * {@link IPointInTimeCapableDocumentServiceFactory}, otherwise `undefined`.
 */
export function asPointInTimeCapableFactory(
	factory: IDocumentServiceFactory,
): (IDocumentServiceFactory & IPointInTimeCapableDocumentServiceFactory) | undefined {
	return typeof (factory as Partial<IPointInTimeCapableDocumentServiceFactory>)
		.createPointInTimeDocumentService === "function"
		? (factory as IDocumentServiceFactory & IPointInTimeCapableDocumentServiceFactory)
		: undefined;
}

/**
 * Adapts a point-in-time capable factory to a plain {@link IDocumentServiceFactory} that always
 * materializes the configured target sequence number.
 *
 * @remarks
 * The loader plumbs the caller's target through this adapter so the container's normal
 * `createDocumentService(resolvedUrl)` call routes to `createPointInTimeDocumentService`. This keeps
 * point-in-time loading a single-call experience for the caller (see
 * {@link loadContainerToSequenceNumber}) - they never build or pass a decorated factory themselves.
 */
export class PointInTimeDocumentServiceFactory implements IDocumentServiceFactory {
	public constructor(
		private readonly inner: IPointInTimeCapableDocumentServiceFactory,
		private readonly targetSequenceNumber: number,
	) {}

	public async createDocumentService(
		resolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		return this.inner.createPointInTimeDocumentService(
			resolvedUrl,
			this.targetSequenceNumber,
			logger,
			clientIsSummarizer,
		);
	}

	public async createContainer(): Promise<IDocumentService> {
		throw new UsageError(
			"A point-in-time document service factory cannot be used to create containers.",
		);
	}
}
