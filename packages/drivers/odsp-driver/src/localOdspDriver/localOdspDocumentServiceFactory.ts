/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { ISummaryTree } from "@fluidframework/driver-definitions";
import { IDocumentService, IResolvedUrl } from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/driver-utils/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { ICacheAndTracker } from "../epochTracker.js";
import { OdspDocumentServiceFactoryCore } from "../odspDocumentServiceFactoryCore.js";
import { createOdspLogger, getOdspResolvedUrl } from "../odspUtils.js";

import { LocalOdspDocumentService } from "./localOdspDocumentService.js";

/**
 * Factory for creating sharepoint document service with a provided snapshot.
 *
 * @remarks Use if you don't want to connect to any kind of external/internal storages and want to provide
 * content directly.
 */
export class LocalOdspDocumentServiceFactory extends OdspDocumentServiceFactoryCore {
	private readonly logger: ITelemetryLoggerExt = createOdspLogger();

	constructor(private readonly localSnapshot: Uint8Array | string) {
		super(
			(_options) => this.throwUnsupportedUsageError("Getting storage token"),
			(_options) => this.throwUnsupportedUsageError("Getting websocket token"),
		);
	}

	private throwUnsupportedUsageError(unsupportedFuncName: string): never {
		const toThrow = new UsageError(
			`${unsupportedFuncName} is not supported by LocalOdspDocumentServiceFactory`,
		);
		this.logger.sendErrorEvent({ eventName: "UnsupportedUsage" }, toThrow);
		throw toThrow;
	}

	public createContainer(
		_createNewSummary: ISummaryTree | undefined,
		_createNewResolvedUrl: IResolvedUrl,
		logger?: ITelemetryBaseLogger,
		_clientIsSummarizer?: boolean,
	): never {
		const toThrow = new UsageError(
			'"createContainer" is not supported by LocalOdspDocumentServiceFactory',
		);
		this.logger.sendErrorEvent({ eventName: "UnsupportedUsage" }, toThrow);
		throw toThrow;
	}

	protected async createDocumentServiceCore(
		resolvedUrl: IResolvedUrl,
		odspLogger: ITelemetryLoggerExt,
		_cacheAndTrackerArg?: ICacheAndTracker,
		_clientIsSummarizer?: boolean,
	): Promise<IDocumentService> {
		if (_cacheAndTrackerArg !== undefined) {
			throw new UsageError('Invalid usage. "_cacheAndTrackerArg" should not be provided');
		}
		if (_clientIsSummarizer) {
			throw new UsageError('Invalid usage. "_clientIsSummarizer" should not be provided');
		}
		return new LocalOdspDocumentService(
			getOdspResolvedUrl(resolvedUrl),
			odspLogger,
			this.localSnapshot,
		);
	}
}
