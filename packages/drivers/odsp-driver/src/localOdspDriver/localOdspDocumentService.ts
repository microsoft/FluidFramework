/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter, type ILayerCompatDetails } from "@fluid-internal/client-utils";
import { IClient } from "@fluidframework/driver-definitions";
import {
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentServiceEvents,
	IDocumentStorageService,
	IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/driver-utils/internal";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions/internal";
import { ITelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import { LocalOdspDeltaStorageService } from "./localOdspDeltaStorageService.js";
import { LocalOdspDocumentStorageService } from "./localOdspDocumentStorageManager.js";
import { localOdspDriverCompatDetailsForLoader } from "./localOdspLayerCompatState.js";

/**
 * IDocumentService implementation that provides explicit snapshot to the document storage service.
 */
export class LocalOdspDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	public policies = { storageOnly: true };
	private storageManager?: LocalOdspDocumentStorageService;

	constructor(
		private readonly odspResolvedUrl: IOdspResolvedUrl,
		private readonly logger: ITelemetryLoggerExt,
		private readonly localSnapshot: Uint8Array | string,
	) {
		super();
	}

	/**
	 * The compatibility details of the Local ODSP Driver layer that is exposed to the Loader layer
	 * for validating Loader-Driver compatibility.
	 */
	public get ILayerCompatDetails(): ILayerCompatDetails {
		return localOdspDriverCompatDetailsForLoader;
	}

	public get resolvedUrl(): IResolvedUrl {
		return this.odspResolvedUrl;
	}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		this.storageManager = new LocalOdspDocumentStorageService(this.logger, this.localSnapshot);
		return this.storageManager;
	}

	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		return new LocalOdspDeltaStorageService(this.logger, this.storageManager?.ops ?? []);
	}

	public connectToDeltaStream(_client: IClient): never {
		const toThrow = new UsageError(
			'"connectToDeltaStream" is not supported by LocalOdspDocumentService',
		);
		this.logger.sendErrorEvent({ eventName: "UnsupportedUsage" }, toThrow);
		throw toThrow;
	}

	public dispose(error?: unknown): void {
		// Do nothing
	}
}
