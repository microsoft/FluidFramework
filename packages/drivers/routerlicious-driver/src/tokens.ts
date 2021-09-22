/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims } from "@fluidframework/protocol-definitions";

/**
 * The ITokenService abstracts the discovery of claims contained within a token
 */
export interface ITokenService {
    extractClaims(token: string): ITokenClaims;
}

export interface ITokenResponse {
    // JWT value
    jwt: string;

    // Flag indicating whether token was obtained from local cache
    fromCache?: boolean;
}

/**
 * The ITokenProvider abstracts the token fetching mechanism for a host. Host will be responsible for
 * implementing the interfaces.
 */
export interface ITokenProvider {
    /**
     * Fetches the orderer token from host.
     * @param tenantId - Tenant ID.
     * @param documentId - Optional. Document ID is only required for document-scoped requests.
     * @param refresh - Optional flag indicating whether token fetch must bypass local cache.
     * @returns TokenResponse object representing token value along with flag indicating
     * whether token came from cache.
     */
    fetchOrdererToken(tenantId: string, documentId?: string, refresh?: boolean): Promise<ITokenResponse>;

    /**
     * Fetches the storage token from host.
     * @param tenantId - Tenant ID.
     * @param documentId - Document ID.
     * @param refresh - Optional flag indicating whether token fetch must bypass local cache.
     * @returns TokenResponse object representing token value along with flag indicating
     * whether token came from cache.
     */
    fetchStorageToken(tenantId: string, documentId: string, refresh?: boolean): Promise<ITokenResponse>;
}
