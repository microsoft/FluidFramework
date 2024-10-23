/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface for an access token.
 */
export interface IAccessToken {
	accessToken: string;
}

/**
 * Interface to generate an access token. This is need to provide keyless access
 * to the service.
 */
export interface IAccessTokenGenerator {
	/**
	 * Generate access token for the given tenantId and documentId if present.
	 * @param tenantId - Tenant id.
	 * @param documentId - Document id.
	 * @param customClaims - Custom claims to be added to the token.
	 */
	generateToken(tenantId: string, documentId?: string, customClaims?: any): Promise<IAccessToken>;
}
