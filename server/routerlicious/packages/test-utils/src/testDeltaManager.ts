/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import type { IDeltaService } from "@fluidframework/server-services-core";

/**
 * @internal
 */
export class TestDeltaManager implements IDeltaService {
	async getDeltas(
		collectionName: string,
		tenantId: string,
		documentId: string,
		from?: number,
		to?: number,
	): Promise<ISequencedDocumentMessage[]> {
		return [];
	}
	async getDeltasFromStorage(
		collectionName: string,
		tenantId: string,
		documentId: string,
		fromTerm: number,
		toTerm: number,
		fromSeq?: number,
		toSeq?: number,
	): Promise<ISequencedDocumentMessage[]> {
		return [];
	}
	async getDeltasFromSummaryAndStorage(
		collectionName: string,
		tenantId: string,
		documentId: string,
		from?: number,
		to?: number,
	): Promise<ISequencedDocumentMessage[]> {
		return [];
	}
}
