/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PublicClientApplication, AuthenticationResult } from "@azure/msal-browser";
import { IOdspTokenProvider } from "@fluid-experimental/odsp-client";
import { TokenResponse } from "@fluidframework/odsp-driver-definitions";

export class OdspTestTokenProvider implements IOdspTokenProvider {
	private readonly clientId: string;
	constructor(clientId: string) {
		this.clientId = clientId;
	}

	public async fetchWebsocketToken(siteUrl: string, refresh: boolean): Promise<TokenResponse> {
		const token = await this.fetchTokens(siteUrl);
		return {
			fromCache: true,
			token: token.pushToken,
		};
	}

	public async fetchStorageToken(siteUrl: string, refresh: boolean): Promise<TokenResponse> {
		const token = await this.fetchTokens(siteUrl);
		return {
			fromCache: true,
			token: token.storageToken,
		};
	}

	private async fetchTokens(
		siteUrl: string,
	): Promise<{ storageToken: string; pushToken: string }> {
		const msalConfig = {
			auth: {
				clientId: this.clientId,
				authority: "https://login.microsoftonline.com/common/",
			},
		};

		const msalInstance = new PublicClientApplication(msalConfig);
		const pushScope = ["offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All"];
		const storageScope = [`${siteUrl}/Container.Selected`];

		const accounts = msalInstance.getAllAccounts();
		if (accounts.length === 0) {
			await msalInstance.loginRedirect();
		}

		try {
			// Attempt to acquire token silently
			const storageRequest = {
				scopes: storageScope,
			};
			const storageResult: AuthenticationResult =
				await msalInstance.acquireTokenSilent(storageRequest);

			const pushRequest = {
				scopes: pushScope,
			};
			const pushResult: AuthenticationResult =
				await msalInstance.acquireTokenSilent(pushRequest);

			// Return token
			return {
				storageToken: storageResult.accessToken,
				pushToken: pushResult.accessToken,
			};
		} catch (error) {
			throw new Error(`MSAL error: ${error}`);
		}
	}
}
