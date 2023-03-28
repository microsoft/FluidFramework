/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
	IDocumentDeltaStorageService,
	IDocumentService,
	IDocumentStorageService,
	IResolvedUrl,
} from "@fluidframework/driver-definitions";
import { UsageError } from "@fluidframework/driver-utils";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions";
import { IClient } from "@fluidframework/protocol-definitions";
import { LocalOdspDeltaStorageService } from "./localOdspDeltaStorageService";
import { LocalOdspDocumentStorageService } from "./localOdspDocumentStorageManager";

/**
 * IDocumentService implementation that provides explicit snapshot to the document storage service.
 */
export class LocalOdspDocumentService implements IDocumentService {
	public policies = { storageOnly: true };
	private storageManager?: LocalOdspDocumentStorageService;

	constructor(
		private readonly odspResolvedUrl: IOdspResolvedUrl,
		private readonly logger: ITelemetryLogger,
		private readonly localSnapshot: Uint8Array | string,
	) {}

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

	public dispose(_error?: any): void {
		// Do nothing
	}
}
