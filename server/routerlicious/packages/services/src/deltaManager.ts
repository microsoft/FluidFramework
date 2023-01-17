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
    constructor(private readonly authEndpoint, private readonly internalAlfredUrl: string) {
    }

    public async getDeltas(
        _collectionName: string,
        tenantId: string,
        documentId: string,
        from: number,
        to: number): Promise<ISequencedDocumentMessage[]> {
        const baseUrl = `${this.internalAlfredUrl}`;
        const restWrapper = await this.getBasicRestWrapper(tenantId, documentId, baseUrl);
        const result = restWrapper.get<ISequencedDocumentMessage[]>(`/deltas/${tenantId}/${documentId}`, { from, to });
        return result;
    }

    public async getDeltasFromStorage(collectionName: string, tenantId: string, documentId: string, fromTerm: number, toTerm: number, fromSeq?: number, toSeq?: number): Promise<ISequencedDocumentMessage[]> {
        throw new Error("Method not implemented.");
    }

    public async getDeltasFromSummaryAndStorage(collectionName: string, tenantId: string, documentId: string, from?: number, to?: number): Promise<ISequencedDocumentMessage[]> {
        throw new Error("Method not implemented.");
    }

    private async getKey(tenantId: string, includeDisabledTenant = false): Promise<string> {
        const tenantManager = new TenantManager(this.authEndpoint, "");
        const key = await tenantManager.getKey(tenantId, includeDisabledTenant);
        return key;
    }

    private async getBasicRestWrapper(tenantId: string, documentId: string, baseUrl: string) {
        const key = await this.getKey(tenantId);

        const defaultQueryString = {
            token: fromUtf8ToBase64(`${tenantId}`),
        };

        const getDefaultHeaders = () => {
            const token = { jwt: generateToken(tenantId, documentId, key, [ScopeType.DocRead]) };
            return ({
                Authorization: `Basic ${token.jwt}`,
            });
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
            getCorrelationId);
        return restWrapper;
    }
}
