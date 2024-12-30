/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromUtf8ToBase64 } from "@fluidframework/common-utils";
import { ISequencedDocumentMessage, ScopeType } from "@fluidframework/protocol-definitions";
import { BasicRestWrapper } from "@fluidframework/server-services-client";
import { IDeltaService } from "@fluidframework/server-services-core";
import { getGlobalTelemetryContext } from "@fluidframework/server-services-telemetry";
import { TenantManager } from "./tenant";

/**
 * Manager to fetch deltas from Alfred using the internal URL.
 * @internal
 */
export class DeltaManager implements IDeltaService {
	constructor(
		private readonly authEndpoint,
		private readonly internalAlfredUrl: string,
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
		const resultP = restWrapper.get<ISequencedDocumentMessage[]>(
			`/deltas/${tenantId}/${documentId}`,
			{ from, to, caller: caller ?? "Unknown" },
		);
		return resultP;
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

	private async getAccessToken(
		tenantId: string,
		documentId: string,
		scopes: ScopeType[],
		includeDisabledTenant = false,
	): Promise<string> {
		const tenantManager = new TenantManager(this.authEndpoint, "");
		const tokenP = await tenantManager.signToken(
			tenantId,
			documentId,
			scopes,
			undefined,
			undefined,
			undefined,
			undefined,
			includeDisabledTenant,
		);
		return tokenP;
	}

	private async getBasicRestWrapper(tenantId: string, documentId: string, baseUrl: string) {
		const accessToken = await this.getAccessToken(tenantId, documentId, [ScopeType.DocRead]);

		const defaultQueryString = {
			token: fromUtf8ToBase64(`${tenantId}`),
		};

		const getDefaultHeaders = () => {
			const token = { jwt: accessToken };
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
			() => getGlobalTelemetryContext().getProperties().correlationId /* getCorrelationId */,
			() => getGlobalTelemetryContext().getProperties() /* getTelemetryContextProperties */,
		);
		return restWrapper;
	}
}
