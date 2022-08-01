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
    /**
     * {@link https://jwt.io/introduction/ | JSON Web Token (JWT)} value.
     */
    jwt: string;

    /**
     * Flag indicating whether token was obtained from local cache.
     * Undefined indicates that the source of the token could not be determined.
     */
    fromCache?: boolean;
}

/**
 * Abstracts the token fetching mechanism for a hosting application.
 * The hosting application is responsible for providing an implementation.
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

    /**
     * A callback triggered directly after creating the document. In this callback the client has the opportunity, to
     * verify against an authorization service, if the user who claims to create the document is the same user who
     * created it.
     *
     * @remarks Notes:
     * * Using the callback may have performance impact on the document creation process.
     * * Any exceptions thrown in the callback would fail the creation workflow
     * (see {@link RouterliciousDocumentServiceFactory.createContainer} for more details).
     *
     * @param documentId - Document ID.
     * @param creationToken - A special token that doesn't provide any kind of access, but it has the user's payload
     * and document id. It can be used to validate the identity of the document creator.
     */
    documentPostCreateCallback?(documentId: string, creationToken: string): Promise<void>;
}
