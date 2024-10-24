/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Interface for a Fluid access token.
 */
export interface IFluidAccessToken {
	fluidAccessToken: string;
}

/**
 * Interface to generate a Fluid access token. This is need to provide keyless access
 * to the service.
 */
export interface IFluidAccessTokenGenerator {
	/**
	 * Generate a Fluid access token.
	 * @param tenantId - The tenant id.
	 * @param bearerAuthToken - The bearer token.
	 * @param requestBody - The request body.
	 */
	generateFluidToken(
		tenantId: string,
		bearerAuthToken: string,
		requestBody?: Record<string, any>,
	): Promise<IFluidAccessToken>;
}
