/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentAttributes } from "@fluidframework/protocol-definitions";
import { fromBase64ToUtf8 } from "@fluidframework/server-common-utils";
import { IGitManager } from "@fluidframework/server-services-client";
import {
	CheckpointService,
	ICheckpoint,
	ICheckpointRepository,
	ICollection,
	IDatabaseManager,
	IDocument,
	IDocumentDetails,
	IDocumentRepository,
	IDocumentStorage,
	ISequencedOperationMessage,
} from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";

import { ILocalOrdererSetup } from "./interfaces";

export class LocalOrdererSetup implements ILocalOrdererSetup {
	constructor(
		private readonly tenantId: string,
		private readonly documentId: string,
		private readonly storage: IDocumentStorage,
		private readonly databaseManager: IDatabaseManager,
		private readonly documentRepository: IDocumentRepository,
		private readonly deliCheckpointRepository: ICheckpointRepository,
		private readonly scribeCheckpointRepository: ICheckpointRepository,
		private readonly deliCheckpointService: CheckpointService,
		private readonly scribeCheckpointService: CheckpointService,
		private readonly gitManager?: IGitManager,
	) {}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public documentP(): Promise<IDocumentDetails> {
		return this.storage.getOrCreateDocument(this.tenantId, this.documentId);
	}

	/**
	 * @deprecated use documentRepositoryP() instead
	 */
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public documentCollectionP(): Promise<ICollection<IDocument>> {
		Lumberjack.error("documentCollectionP() is deprecated but still used.");
		return this.databaseManager.getDocumentCollection();
	}
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public localCheckpointCollectionP(): Promise<ICollection<ICheckpoint>> {
		return this.databaseManager.getCheckpointCollection();
	}

	public async documentRepositoryP(): Promise<IDocumentRepository> {
		return this.documentRepository;
	}

	public async deliCheckpointRepositoryP(): Promise<ICheckpointRepository> {
		return this.deliCheckpointRepository;
	}

	public async scribeCheckpointRepositoryP(): Promise<ICheckpointRepository> {
		return this.scribeCheckpointRepository;
	}

	public async checkpointServiceP(service: string): Promise<CheckpointService> {
		return service === "deli" ? this.deliCheckpointService : this.scribeCheckpointService;
	}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public deltaCollectionP(): Promise<ICollection<any>> {
		return this.databaseManager.getDeltaCollection(this.tenantId, this.documentId);
	}

	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public scribeDeltaCollectionP(): Promise<ICollection<ISequencedOperationMessage>> {
		return this.databaseManager.getScribeDeltaCollection(this.tenantId, this.documentId);
	}

	public async protocolHeadP(): Promise<number> {
		if (!this.gitManager) {
			return 0;
		}

		const existingRef = await this.gitManager.getRef(encodeURIComponent(this.documentId));
		if (!existingRef) {
			return -1;
		}

		const content = await this.gitManager.getContent(
			existingRef.object.sha,
			".protocol/attributes",
		);
		const attributes = JSON.parse(fromBase64ToUtf8(content.content)) as IDocumentAttributes;

		return attributes.sequenceNumber;
	}

	public async scribeMessagesP(): Promise<ISequencedOperationMessage[]> {
		const scribeDeltaCollection = await this.scribeDeltaCollectionP();
		return scribeDeltaCollection.find(
			{
				documentId: this.documentId,
				tenantId: this.tenantId,
			},
			{ "operation.sequenceNumber": 1 },
		);
	}
}
