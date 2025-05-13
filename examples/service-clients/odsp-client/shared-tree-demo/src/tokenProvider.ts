/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PublicClientApplication } from "@azure/msal-browser";
import { IOdspTokenProvider, TokenResponse } from "@fluidframework/odsp-client/beta";

// Helper function to authenticate the user
export async function createMsalInstance(): Promise<PublicClientApplication> {
	// Get the client id (app id) from the environment variables
	const clientId = process.env.SPE_CLIENT_ID;

	if (clientId === undefined) {
		throw new Error("SPE_CLIENT_ID is not defined");
	}

	const tenantId = process.env.SPE_ENTRA_TENANT_ID;
	if (tenantId === undefined) {
		throw new Error("SPE_ENTRA_TENANT_ID is not defined");
	}

	// Create the MSAL instance
	const msalConfig = {
		auth: {
			clientId,
			authority: `https://login.microsoftonline.com/${tenantId}/`,
			tenantId,
		},
	};

	// Initialize the MSAL instance
	const msalInstance = new PublicClientApplication(msalConfig);
	await msalInstance.initialize();

	return msalInstance;
}

export class OdspTestTokenProvider implements IOdspTokenProvider {
	private readonly msalInstance: Promise<PublicClientApplication> = createMsalInstance();

	public async fetchWebsocketToken(siteUrl: string, refresh: boolean): Promise<TokenResponse> {
		const pushScope = ["offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All"];
		const token = await this.fetchTokens(pushScope);
		return {
			fromCache: true,
			token,
		};
	}

	public async fetchStorageToken(siteUrl: string, refresh: boolean): Promise<TokenResponse> {
		const storageScope = [`${siteUrl}/Container.Selected`];

		const token = await this.fetchTokens(storageScope);

		return {
			fromCache: true,
			token,
		};
	}

	private async fetchTokens(scope: string[]): Promise<string> {
		const msal = await this.msalInstance;
		const accounts = msal.getAllAccounts();
		let response;

		if (accounts.length === 0) {
			try {
				// This will only work if loginPopup is synchronous, otherwise, you may need to handle the response in a different way
				response = await msal.loginPopup({
					scopes: ["FileStorageContainer.Selected"],
				});
			} catch (error) {
				throw new Error(`MSAL error: ${error}`);
			}
		} else {
			response = { account: accounts[0] };
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
		msal.setActiveAccount(response.account);

		try {
			const result = await msal.acquireTokenSilent({ scopes: scope });
			return result.accessToken;
		} catch (error) {
			throw new Error(`MSAL error: ${error}`);
		}
	}
}
