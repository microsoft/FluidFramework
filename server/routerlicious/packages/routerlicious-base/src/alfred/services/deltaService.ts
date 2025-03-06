/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { toUtf8 } from "@fluidframework/server-common-utils";
import {
	ICollection,
	IDeltaService,
	ISequencedOperationMessage,
	ITenantManager,
} from "@fluidframework/server-services-core";

/**
 * @internal
 */
export class DeltaService implements IDeltaService {
	constructor(
		protected readonly deltasCollection: ICollection<ISequencedOperationMessage>,
		protected readonly tenantManager: ITenantManager,
	) {}

	public async getDeltas(
		collectionName: string,
		tenantId: string,
		documentId: string,
		from?: number,
		to?: number,
	): Promise<ISequencedDocumentMessage[]> {
		// Create an optional filter to restrict the delta range
		const query: any = { documentId, tenantId };
		if (from !== undefined || to !== undefined) {
			query["operation.sequenceNumber"] = {};

			if (from !== undefined) {
				query["operation.sequenceNumber"].$gt = from;
			}

			if (to !== undefined) {
				query["operation.sequenceNumber"].$lt = to;
			}
		}

		const sort = { "operation.sequenceNumber": 1 };
		return this.queryDeltas(collectionName, query, sort);
	}

	public async getDeltasFromStorage(
		collectionName: string,
		tenantId: string,
		documentId: string,
		fromSeq?: number,
		toSeq?: number,
	): Promise<ISequencedDocumentMessage[]> {
		const query: any = { documentId, tenantId, scheduledDeletionTime: { $exists: false } };
		query["operation.sequenceNumber"] = {};
		if (fromSeq !== undefined) {
			query["operation.sequenceNumber"].$gt = fromSeq;
		}
		if (toSeq !== undefined) {
			query["operation.sequenceNumber"].$lt = toSeq;
		}

		const sort = { "operation.sequenceNumber": 1 };
		return this.queryDeltas(collectionName, query, sort);
	}

	private async queryDeltas(
		collectionName: string,
		query: any,
		sort: any,
	): Promise<ISequencedDocumentMessage[]> {
		const dbDeltas = await this.deltasCollection.find(query, sort);
		return dbDeltas.map((delta) => delta.operation);
	}

	public async getDeltasFromSummaryAndStorage(
		collectionName: string,
		tenantId: string,
		documentId: string,
		from?: number,
		to?: number,
	) {
		const gitManager = await this.tenantManager.getTenantGitManager(tenantId, documentId);

		const existingRef = await gitManager.getRef(encodeURIComponent(documentId));
		if (!existingRef) {
			return this.getDeltasFromStorage(collectionName, tenantId, documentId, from, to);
		} else {
			const opsContent = await gitManager.getContent(
				existingRef.object.sha,
				".logTail/logTail",
			);
			const opsFromSummary = JSON.parse(
				toUtf8(opsContent.content, opsContent.encoding),
			) as ISequencedDocumentMessage[];

			const fromSeq =
				opsFromSummary.length > 0
					? opsFromSummary[opsFromSummary.length - 1].sequenceNumber
					: from;
			const opsFromStorage = await this.getDeltasFromStorage(
				collectionName,
				tenantId,
				documentId,
				fromSeq,
				to,
			);

			const ops = opsFromSummary.concat(opsFromStorage);
			if (ops.length === 0) {
				return ops;
			}
			let fromIndex = 0;
			if (from) {
				const firstSeq = ops[0].sequenceNumber;
				if (from - firstSeq >= -1) {
					fromIndex += from - firstSeq + 1;
				}
			}
			let toIndex = ops.length - 1;
			if (to) {
				const lastSeq = ops[ops.length - 1].sequenceNumber;
				if (lastSeq - to >= -1) {
					toIndex -= lastSeq - to + 1;
				}
			}
			if (toIndex - fromIndex > 0) {
				return ops.slice(fromIndex, toIndex + 1);
			}
			return [];
		}
	}
}
