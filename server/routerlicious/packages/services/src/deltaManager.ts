/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage, ScopeType } from "@fluidframework/protocol-definitions";
import { BasicRestWrapper } from "@fluidframework/server-services-client";
import { IDeltaService } from "@fluidframework/server-services-core";
import { generateToken, getCorrelationId } from "@fluidframework/server-services-utils";
import { TenantManager } from "./tenant";

/**
 * Manager to fetch deltas from Alfred using the internal URL.
 */
export class DeltaManager implements IDeltaService {
	constructor(
		private readonly authEndpoint,
		private readonly internalAlfredUrl: string,
		private readonly getDeltasRequestMaxOpsRange: number,
	) {}

	public async getDeltas(
		_collectionName: string,
		tenantId: string,
		documentId: string,
		from: number,
		to: number,
		caller?: string,
	): Promise<ISequencedDocumentMessage[]> {
		const baseUrl = `${this.internalAlfredUrl}`;
		const restWrapper = await this.getBasicRestWrapper(tenantId, documentId, baseUrl);

		// if requested size > getDeltasRequestMaxOpsRange, breakdown into chunks of size getDeltasRequestMaxOpsRange
		if (to - from - 1 > this.getDeltasRequestMaxOpsRange) {
			let getDeltasFrom = from;
			let getDeltasTo = from + this.getDeltasRequestMaxOpsRange + 1;
			const chunkResultP: Promise<ISequencedDocumentMessage[]>[] = [];
			while (getDeltasTo <= to && getDeltasTo - getDeltasFrom - 1 > 0) {
				chunkResultP.push(
					restWrapper.get<ISequencedDocumentMessage[]>(
						`/deltas/${tenantId}/${documentId}`,
						{ getDeltasFrom, getDeltasTo, caller },
					),
				);
				getDeltasFrom = getDeltasTo - 1;
				getDeltasTo = Math.min(to, getDeltasFrom + this.getDeltasRequestMaxOpsRange + 1);
			}
			return (await Promise.all(chunkResultP)).flat();
		} else {
			const resultP = restWrapper.get<ISequencedDocumentMessage[]>(
				`/deltas/${tenantId}/${documentId}`,
				{ from, to, caller },
			);
			return resultP;
		}
	}

	public async getDeltasFromStorage(
		collectionName: string,
		tenantId: string,
		documentId: string,
		fromTerm: number,
		toTerm: number,
		fromSeq?: number,
		toSeq?: number,
	): Promise<ISequencedDocumentMessage[]> {
		throw new Error("Method not implemented.");
	}

	public async getDeltasFromSummaryAndStorage(
		collectionName: string,
		tenantId: string,
		documentId: string,
		from?: number,
		to?: number,
	): Promise<ISequencedDocumentMessage[]> {
		throw new Error("Method not implemented.");
	}

	private async getKey(tenantId: string, includeDisabledTenant = false): Promise<string> {
		const tenantManager = new TenantManager(this.authEndpoint, "");
		const keyP = await tenantManager.getKey(tenantId, includeDisabledTenant);
		return keyP;
	}

	private async getBasicRestWrapper(tenantId: string, documentId: string, baseUrl: string) {
		const key = await this.getKey(tenantId);

		const defaultQueryString = {
			token: fromUtf8ToBase64(`${tenantId}`),
		};

		const getDefaultHeaders = () => {
			const token = { jwt: generateToken(tenantId, documentId, key, [ScopeType.DocRead]) };
			return {
				Authorization: `Basic ${token.jwt}`,
			};
		};

		const restWrapper = new BasicRestWrapper(
			baseUrl,
			defaultQueryString,
			undefined,
			undefined,
			getDefaultHeaders(),
			undefined,
			undefined,
			getDefaultHeaders,
			getCorrelationId,
		);
		return restWrapper;
	}
}
