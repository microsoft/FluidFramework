/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	PublicClientApplication,
	AuthenticationResult,
	InteractionRequiredAuthError,
} from "@azure/msal-browser";
import { IOdspTokenProvider } from "@fluid-experimental/odsp-client";
import { TokenResponse } from "@fluidframework/odsp-driver-definitions";

export async function fetchTokens(
	siteUrl: string,
	clientId: string,
): Promise<{ storageToken: string; pushToken: string }> {
	const msalConfig = {
		auth: {
			clientId,
			authority: "https://login.microsoftonline.com/common/",
		},
	};

	const graphScopes = ["FileStorageContainer.Selected"];

	const msalInstance = new PublicClientApplication(msalConfig);
	const pushScope = ["offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All"];
	const storageScope = [`${siteUrl}/Container.Selected`];
	const response = await msalInstance.loginPopup({ scopes: graphScopes });

	msalInstance.setActiveAccount(response.account);

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
		const pushResult: AuthenticationResult = await msalInstance.acquireTokenSilent(pushRequest);

		// Return token
		return {
			storageToken: storageResult.accessToken,
			pushToken: pushResult.accessToken,
		};
	} catch (error) {
		if (error instanceof InteractionRequiredAuthError) {
			msalInstance.setActiveAccount(null);
			// If silent token acquisition fails, fall back to interactive flow
			const storageRequest = {
				scopes: storageScope,
			};
			const storageResult: AuthenticationResult =
				await msalInstance.acquireTokenPopup(storageRequest);

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
		} else {
			// Handle any other error
			console.error(error);
			throw error;
		}
	}
}

export class OdspTestTokenProvider implements IOdspTokenProvider {
	constructor() {}

	public async fetchWebsocketToken(siteUrl: string, refresh: boolean): Promise<TokenResponse> {
		const token = await this.fetchTokens(siteUrl, "");
		return {
			fromCache: true,
			token: token.pushToken,
		};
	}

	public async fetchStorageToken(siteUrl: string, refresh: boolean): Promise<TokenResponse> {
		const token = await this.fetchTokens(siteUrl, "");
		return {
			fromCache: true,
			token: token.storageToken,
		};
	}

	private async fetchTokens(
		siteUrl: string,
		clientId: string,
	): Promise<{ storageToken: string; pushToken: string }> {
		const msalConfig = {
			auth: {
				clientId,
				authority: "https://login.microsoftonline.com/common/",
			},
		};

		const graphScopes = ["FileStorageContainer.Selected"];

		const msalInstance = new PublicClientApplication(msalConfig);
		const pushScope = ["offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All"];
		const storageScope = [`${siteUrl}/Container.Selected`];
		const response = await msalInstance.loginPopup({ scopes: graphScopes });

		msalInstance.setActiveAccount(response.account);

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
			if (error instanceof InteractionRequiredAuthError) {
				msalInstance.setActiveAccount(null);
				// If silent token acquisition fails, fall back to interactive flow
				const storageRequest = {
					scopes: storageScope,
				};
				const storageResult: AuthenticationResult =
					await msalInstance.acquireTokenPopup(storageRequest);

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
			} else {
				// Handle any other error
				console.error(error);
				throw error;
			}
		}
	}
}
