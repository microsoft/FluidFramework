/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TokenResponse } from "@fluidframework/odsp-driver-definitions";

/**
 * Abstracts the token fetching mechanism for a hosting application.
 * The hosting application is responsible for providing an implementation.
 * @beta
 */
export interface IOdspTokenProvider {
	/**
	 * Fetches the orderer token from host.
	 *
	 * @param siteUrl - Site url representing ODSP resource location. It points to the specific SharePoint site where you can store and access the containers you create.
	 * @param refresh - Optional flag indicating whether token fetch must bypass local cache.
	 * This likely indicates that some previous request failed authorization due to an expired token,
	 * and so a fresh token is required.
	 *
	 * Default: `false`.
	 */
	fetchWebsocketToken(siteUrl: string, refresh: boolean): Promise<TokenResponse>;

	/**
	 * Fetches the storage token from host.
	 *
	 * @param siteUrl - Site url representing ODSP resource location. It points to the specific SharePoint site where you can store and access the containers you create.
	 * @param refresh - Optional flag indicating whether token fetch must bypass local cache.
	 * This likely indicates that some previous request failed authorization due to an expired token,
	 * and so a fresh token is required.
	 *
	 * Default: `false`.
	 */
	fetchStorageToken(siteUrl: string, refresh: boolean): Promise<TokenResponse>;
}
