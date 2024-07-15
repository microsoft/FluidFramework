/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AuthenticationResult,
	InteractionRequiredAuthError,
	PublicClientApplication,
} from "@azure/msal-browser";
import { IOdspTokenProvider } from "@fluid-experimental/odsp-client";
import { TokenResponse } from "@fluidframework/odsp-driver-definitions/beta";

// Sample implementation of the IOdspTokenProvider interface
// This class is used to provide the token for the Fluid container and
// the token for the WebSocket connection used by the Fluid service
export class SampleOdspTokenProvider implements IOdspTokenProvider {
	private readonly intializedPublicClientApplication: PublicClientApplication;
	constructor(publicClientApplication: PublicClientApplication) {
		this.intializedPublicClientApplication = publicClientApplication;
	}

	// Fetch the token for the Fluid service
	public async fetchWebsocketToken(): Promise<TokenResponse> {
		const pushScope = ["offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All"];
		const token = await this.fetchTokens(pushScope);
		return {
			fromCache: true,
			token,
		};
	}

	// Fetch the token for Fluid container
	public async fetchStorageToken(siteUrl: string): Promise<TokenResponse> {
		const storageScope = [`${siteUrl}/Container.Selected`];

		const token = await this.fetchTokens(storageScope);

		return {
			fromCache: true,
			token,
		};
	}

	private async fetchTokens(scope: string[]): Promise<string> {
		let response: AuthenticationResult;
		try {
			response = await this.intializedPublicClientApplication.acquireTokenSilent({
				scopes: scope,
			});
		} catch (error) {
			if (error instanceof InteractionRequiredAuthError) {
				response = await this.intializedPublicClientApplication.acquireTokenPopup({
					scopes: scope,
				});
			} else {
				throw new Error(`MSAL error: ${error}`);
			}
		}
		return response.accessToken;
	}
}
