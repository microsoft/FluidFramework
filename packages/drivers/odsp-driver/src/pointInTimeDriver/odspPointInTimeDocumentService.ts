/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	type IClient,
	type IDocumentDeltaConnection,
	type IDocumentDeltaStorageService,
	type IDocumentService,
	type IDocumentServiceEvents,
	type IDocumentServicePolicies,
	type IDocumentStorageService,
	type IResolvedUrl,
} from "@fluidframework/driver-definitions/internal";

/**
 * A document service that combines a historical snapshot with live ODSP delta services for paused replay.
 *
 * @internal
 */
export class OdspPointInTimeDocumentService
	extends TypedEventEmitter<IDocumentServiceEvents>
	implements IDocumentService
{
	public constructor(
		public readonly resolvedUrl: IResolvedUrl,
		private readonly historicalDocumentService: IDocumentService,
		private readonly liveDocumentService: IDocumentService,
	) {
		super();
		this.liveDocumentService.on("metadataUpdate", this.metadataUpdateHandler);
	}

	public get policies(): IDocumentServicePolicies | undefined {
		return this.liveDocumentService.policies;
	}

	public dispose(): void {
		this.liveDocumentService.off("metadataUpdate", this.metadataUpdateHandler);
		this.historicalDocumentService.dispose();
		this.liveDocumentService.dispose();
	}

	public async connectToStorage(): Promise<IDocumentStorageService> {
		return this.historicalDocumentService.connectToStorage();
	}

	public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
		return this.liveDocumentService.connectToDeltaStorage();
	}

	public async connectToDeltaStream(client: IClient): Promise<IDocumentDeltaConnection> {
		return this.liveDocumentService.connectToDeltaStream(client);
	}

	private readonly metadataUpdateHandler = (metadata: Record<string, string>): void => {
		this.emit("metadataUpdate", metadata);
	};

}
