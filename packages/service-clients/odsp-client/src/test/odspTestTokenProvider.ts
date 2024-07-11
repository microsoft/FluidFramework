/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	IPublicClientConfig,
	TokenRequestCredentials,
} from "@fluidframework/odsp-doclib-utils/internal";
import { getFetchTokenUrl, unauthPostAsync } from "@fluidframework/odsp-doclib-utils/internal";

import type { TokenResponse } from "../interfaces.js";
import type { IOdspTokenProvider } from "../token.js";

import type { OdspTestCredentials } from "./odspClient.spec.js";

/**
 * This class implements the IOdspTokenProvider interface and provides methods for fetching push and storage tokens.
 */
export class OdspTestTokenProvider implements IOdspTokenProvider {
	private readonly creds: OdspTestCredentials;

	public constructor(credentials: OdspTestCredentials) {
		this.creds = credentials;
	}

	public async fetchWebsocketToken(siteUrl: string, refresh: boolean): Promise<TokenResponse> {
		const pushScope = "offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All";
		const tokens = await this.fetchTokens(siteUrl, pushScope);
		return {
			fromCache: false,
			token: tokens.accessToken,
		};
	}

	public async fetchStorageToken(siteUrl: string, refresh: boolean): Promise<TokenResponse> {
		const sharePointScopes = `${siteUrl}/Container.Selected`;
		const tokens = await this.fetchTokens(siteUrl, sharePointScopes);
		return {
			fromCache: false,
			token: tokens.accessToken,
		};
	}

	private async fetchTokens(
		siteUrl: string,
		scope: string,
	): Promise<{
		accessToken: string;
		refreshToken?: string;
	}> {
		const server = new URL(siteUrl).host;
		const clientConfig: IPublicClientConfig = {
			clientId: this.creds.clientId,
		};
		const credentials: TokenRequestCredentials = {
			grant_type: "password",
			username: this.creds.username,
			password: this.creds.password,
		};
		const body = {
			scope,
			client_id: clientConfig.clientId,
			...credentials,
		};
		const response = await unauthPostAsync(
			getFetchTokenUrl(server),
			new URLSearchParams(body),
		);

		const parsedResponse = (await response.json()) as Record<string, unknown>;

		const accessToken = parsedResponse.access_token;
		assert(accessToken !== undefined, 'Response did not include "access_token".');
		assert(
			typeof accessToken === "string",
			'"access_token" was malformed. Expected a string.',
		);

		const refreshToken = parsedResponse.refresh_token;
		if (refreshToken !== undefined) {
			assert(
				typeof refreshToken === "string",
				'"refreshToken" was malformed. Expected a string.',
			);
		}

		return { accessToken, refreshToken };
	}
}
