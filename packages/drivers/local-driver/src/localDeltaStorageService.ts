/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/driver-definitions";
import { IDocumentDeltaStorageService, IStream } from "@fluidframework/driver-definitions/internal";
import { streamFromMessages } from "@fluidframework/driver-utils/internal";
import { IDatabaseManager } from "@fluidframework/server-services-core";

/**
 * Provides access to the underlying delta storage on the server for local driver.
 * @internal
 */
export class LocalDeltaStorageService implements IDocumentDeltaStorageService {
	constructor(
		private readonly tenantId: string,
		private readonly id: string,
		private readonly databaseManager: IDatabaseManager,
	) {}

	public fetchMessages(
		from: number,
		to: number | undefined,
		abortSignal?: AbortSignal,
		cachedOnly?: boolean,
	): IStream<ISequencedDocumentMessage[]> {
		return streamFromMessages(this.getCore(from, to));
	}

	private async getCore(from: number, to?: number) {
		const query = { documentId: this.id, tenantId: this.tenantId };
		query["operation.sequenceNumber"] = {};
		query["operation.sequenceNumber"].$gt = from - 1; // from is inclusive

		// This looks like a bug. It used to work without setting $lt key. Now it does not
		// Need follow up
		query["operation.sequenceNumber"].$lt = to ?? Number.MAX_SAFE_INTEGER;

		const allDeltas = await this.databaseManager.getDeltaCollection(this.tenantId, this.id);
		const dbDeltas = await allDeltas.find(query, { "operation.sequenceNumber": 1 });
		const messages = dbDeltas.map((delta) => delta.operation);
		return messages;
	}
}
