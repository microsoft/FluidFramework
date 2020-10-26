/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
     * Fetches the orderer token from host
     * @param refresh - Optional flag indicating whether token fetch must bypass local cache
     * @returns TokenResponse object representing token value along with flag indicating
     * whether token came from cache.
     */
    fetchOrdererToken(refresh?: boolean): Promise<ITokenResponse>;

    /**
     * Fetches the storage token from host
     * @param refresh - Optional flag indicating whether token fetch must bypass local cache
     * @returns TokenResponse object representing token value along with flag indicating
     * whether token came from cache.
     */
    fetchStorageToken(refresh?: boolean): Promise<ITokenResponse>;
}
