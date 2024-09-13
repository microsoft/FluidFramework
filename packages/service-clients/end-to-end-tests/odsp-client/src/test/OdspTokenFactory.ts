/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { IOdspTokenProvider } from "@fluidframework/odsp-client/internal";
import {
	IPublicClientConfig,
	TokenRequestCredentials,
	getFetchTokenUrl,
	unauthPostAsync,
} from "@fluidframework/odsp-doclib-utils/internal";
import { TokenResponse } from "@fluidframework/odsp-driver-definitions/internal";

import { IOdspCredentials } from "./OdspClientFactory.js";

/**
 * This class implements the IOdspTokenProvider interface and provides methods for fetching push and storage tokens.
 */
export class OdspTestTokenProvider implements IOdspTokenProvider {
	private readonly creds: IOdspCredentials;

	constructor(credentials: IOdspCredentials) {
		this.creds = credentials;
	}

	public async fetchWebsocketToken(siteUrl: string, refresh: boolean): Promise<TokenResponse> {
		const pushScope = "offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All";
		const tokens = await this.fetchTokens(siteUrl, pushScope);
		return {
			fromCache: true,
			token: tokens.accessToken,
		};
	}

	public async fetchStorageToken(siteUrl: string, refresh: boolean): Promise<TokenResponse> {
		const sharePointScopes = `${siteUrl}/Container.Selected`;
		const tokens = await this.fetchTokens(siteUrl, sharePointScopes);
		return {
			fromCache: true,
			token: tokens.accessToken,
		};
	}

	private async fetchTokens(
		siteUrl: string,
		scope: string,
	): Promise<{
		accessToken: string;
		refreshToken: string;
	}> {
		const server = new URL(siteUrl).host;
		const clientConfig: IPublicClientConfig = {
			clientId: this.creds.clientId,
		};
		const credentials: TokenRequestCredentials = {
			grant_type: "password",
			username: this.creds.email,
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
		if (!response.ok) {
			throw new Error(`Failed to obtain tokens: ${await response.text()}`);
		}

		const parsedResponse = await response.json();
		const accessToken = parsedResponse.access_token;
		const refreshToken = parsedResponse.refresh_token;

		return { accessToken, refreshToken };
	}
}
