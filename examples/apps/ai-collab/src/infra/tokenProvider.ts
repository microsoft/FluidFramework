/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import {
	AuthenticationResult,
	InteractionRequiredAuthError,
	PublicClientApplication,
} from "@azure/msal-browser";
import { IOdspTokenProvider, TokenResponse } from "@fluidframework/odsp-client/beta";

// Sample implementation of the IOdspTokenProvider interface.
// Provides the token that the Fluid service expects when asked for the Fluid container and for the WebSocket connection.
export class SampleOdspTokenProvider implements IOdspTokenProvider {
	private readonly intializedPublicClientApplication: PublicClientApplication;
	constructor(publicClientApplication: PublicClientApplication) {
		this.intializedPublicClientApplication = publicClientApplication;
	}

	// Fetch the token for the orderer service
	public async fetchWebsocketToken(): Promise<TokenResponse> {
		const pushScope = ["offline_access https://pushchannel.1drv.ms/PushChannel.ReadWrite.All"];
		const token = await this.fetchTokens(pushScope);
		return {
			fromCache: true,
			token,
		};
	}

	// Fetch the token for the storage service
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
				throw error;
			}
		}
		return response.accessToken;
	}
}
