/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScopeType } from "@fluidframework/protocol-definitions";
import { IOdspTokenProvider } from "../token";
import { TokenResponse } from "@fluidframework/odsp-driver-definitions";

/**
 * Provides an in memory implementation of {@link @fluidframework/routerlicious-driver#ITokenProvider} that can be
 * used to insecurely connect to the Fluid Relay.
 *
 * As the name implies, this is not secure and should not be used in production.
 * It simply makes examples where authentication is not relevant easier to bootstrap.
 */
export class OdspTestTokenProvider implements IOdspTokenProvider {
	constructor() {}

	/**
	 * {@inheritDoc @fluidframework/routerlicious-driver#ITokenProvider.fetchOrdererToken}
	 */
	public async fetchWebsocketToken(tenantId: string, refresh: boolean): Promise<TokenResponse> {
		return {
			fromCache: true,
			token: ""
		};
	}

	/**
	 * {@inheritDoc @fluidframework/routerlicious-driver#ITokenProvider.fetchStorageToken}
	 */
	public async fetchStorageToken(tenantId: string, refresh: boolean): Promise<TokenResponse> {
		return {
			fromCache: true,
			token: ""
		};
	}
}
