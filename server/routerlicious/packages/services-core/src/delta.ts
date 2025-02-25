/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";

/**
 * @internal
 */
export interface IDeltaService {
	getDeltas(
		collectionName: string,
		tenantId: string,
		documentId: string,
		from?: number,
		to?: number,
		caller?: string,
		fetchReason?: string,
	): Promise<ISequencedDocumentMessage[]>;

	getDeltasFromStorage(
		collectionName: string,
		tenantId: string,
		documentId: string,
		fromTerm: number,
		toTerm: number,
		fromSeq?: number,
		toSeq?: number,
	): Promise<ISequencedDocumentMessage[]>;

	getDeltasFromSummaryAndStorage(
		collectionName: string,
		tenantId: string,
		documentId: string,
		from?: number,
		to?: number,
	): Promise<ISequencedDocumentMessage[]>;
}
