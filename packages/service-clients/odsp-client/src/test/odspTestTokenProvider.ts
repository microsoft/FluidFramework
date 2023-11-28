/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as jwt from "jsonwebtoken";
import { TokenResponse } from "@fluidframework/odsp-driver-definitions";
import { IOdspTokenProvider } from "../token";

export class OdspTestTokenProvider implements IOdspTokenProvider {
	constructor() {}

	public async fetchWebsocketToken(siteUrl: string, refresh: boolean): Promise<TokenResponse> {
		const pushScopes = [
			"offline_access",
			"https://pushchannel.1drv.ms/PushChannel.ReadWrite.All",
		];
		return {
			fromCache: true,
			token: this.generateToken(siteUrl, pushScopes),
		};
	}

	public async fetchStorageToken(siteUrl: string, refresh: boolean): Promise<TokenResponse> {
		const sharePointScopes = [`${siteUrl}/Container.Selected`];
		return {
			fromCache: true,
			token: this.generateToken(siteUrl, sharePointScopes),
		};
	}

	private generateToken(siteUrl: string, scopes: string[]): string {
		const secretKey = process.env.client__secret; // Replace with your secret key
		const expiresIn = "1h"; // Set the token expiration time as per your requirement

		const payload = {
			siteUrl,
			scopes,
		};

		const token: string = jwt.sign(payload, secretKey, { expiresIn });
		return token;
	}
}
