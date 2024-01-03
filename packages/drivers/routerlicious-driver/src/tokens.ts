/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITokenClaims } from "@fluidframework/protocol-definitions";

/**
 * Abstracts the discovery of claims contained within a token.
 * @internal
 */
export interface ITokenService {
	/**
	 * Extracts the {@link @fluidframework/protocol-definitions#ITokenClaims | token claims} from the provided
	 * {@link https://jwt.io/introduction/ | JSON Web Token (JWT)} string representation.
	 */
	extractClaims(token: string): ITokenClaims;
}

/**
 * @public
 */
export interface ITokenResponse {
	/**
	 * {@link https://jwt.io/introduction/ | JSON Web Token (JWT)} value.
	 */
	jwt: string;

	/**
	 * A flag indicating whether token was obtained from local cache.
	 *
	 * @remarks `undefined` indicates that the source of the token could not be determined.
	 */
	fromCache?: boolean;
}

/**
 * Abstracts the token fetching mechanism for a hosting application.
 * The hosting application is responsible for providing an implementation.
 * @public
 */
export interface ITokenProvider {
	/**
	 * Fetches the orderer token from host.
	 *
	 * @param tenantId - Tenant ID.
	 * @param documentId - Optional. Document ID is only required for document-scoped requests.
	 * @param refresh - Optional flag indicating whether token fetch must bypass local cache.
	 * This likely indicates that some previous request failed authorization due to an expired token,
	 * and so a fresh token is required.
	 *
	 * Default: `false`.
	 *
	 * NOTE: This parameter will be made required in the future.
	 */
	fetchOrdererToken(
		tenantId: string,
		documentId?: string,
		refresh?: boolean,
	): Promise<ITokenResponse>;

	/**
	 * Fetches the storage token from host.
	 *
	 * @param tenantId - Tenant ID.
	 * @param documentId - Document ID.
	 * @param refresh - Optional flag indicating whether token fetch must bypass local cache.
	 * This likely indicates that some previous request failed authorization due to an expired token,
	 * and so a fresh token is required.
	 *
	 * Default: `false`.
	 *
	 * NOTE: This parameter will be made required in the future.
	 */
	fetchStorageToken(
		tenantId: string,
		documentId: string,
		refresh?: boolean,
	): Promise<ITokenResponse>;

	/**
	 * A callback triggered directly after creating the document. In this callback the client has the opportunity, to
	 * verify against an authorization service, if the user who claims to create the document is the same user who
	 * created it.
	 *
	 * @remarks Notes:
	 *
	 * * Using the callback may have performance impact on the document creation process.
	 *
	 * * Any exceptions thrown in the callback would fail the creation workflow
	 * (see {@link RouterliciousDocumentServiceFactory.createContainer} for more details).
	 *
	 * @param documentId - Document ID.
	 * @param creationToken - A special token that doesn't provide any kind of access, but it has the user's payload
	 * and document id. It can be used to validate the identity of the document creator.
	 */
	documentPostCreateCallback?(documentId: string, creationToken: string): Promise<void>;
}
