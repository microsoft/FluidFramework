/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { PublicClientApplication } from "@azure/msal-browser";
import { IOdspTokenProvider } from "@fluid-experimental/odsp-client";
import { TokenResponse } from "@fluidframework/odsp-driver-definitions";

export class OdspTestTokenProvider implements IOdspTokenProvider {
	private readonly msalInstance: PublicClientApplication;
	constructor(clientId: string) {
		const msalConfig = {
			auth: {
				clientId,
				authority: "https://login.microsoftonline.com/common/",
			},
		};
		this.msalInstance = new PublicClientApplication(msalConfig);
	}

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
		const accounts = this.msalInstance.getAllAccounts();
		let response;

		if (accounts.length === 0) {
			try {
				// This will only work if loginPopup is synchronous, otherwise, you may need to handle the response in a different way
				response = await this.msalInstance.loginPopup({
					scopes: ["FileStorageContainer.Selected"],
				});
			} catch (error) {
				throw new Error(`MSAL error: ${error}`);
			}
		} else {
			response = { account: accounts[0] };
		}

		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
		this.msalInstance.setActiveAccount(response.account);

		try {
			const result = await this.msalInstance.acquireTokenSilent({ scopes: scope });
			return result.accessToken;
		} catch (error) {
			throw new Error(`MSAL error: ${error}`);
		}
	}
}
