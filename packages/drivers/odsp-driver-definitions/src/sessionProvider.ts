/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl } from "@fluidframework/driver-definitions";

export interface ISocketStorageDiscovery {
	/**
	 * Socket storage discovery api response
	 */

	// The id of the web socket
	id: string;

	// SPO gives us runtimeTenantId, we remap it to tenantId
	// See getSocketStorageDiscovery
	runtimeTenantId?: string;
	tenantId: string;

	snapshotStorageUrl: string;
	deltaStorageUrl: string;

	/**
	 * PUSH URL
	 */
	deltaStreamSocketUrl: string;

	/**
	 * The access token for PushChannel. Optionally returned, depending on implementation.
	 * OneDrive for Consumer implementation returns it and OneDrive for Business implementation
	 * does not return it and instead expects token to be returned via `getWebsocketToken` callback
	 * passed as a parameter to `OdspDocumentService.create()` factory.
	 */
	socketToken?: string;

	/**
	 * This is the time within which client has to refresh the session on (ODSP) relay service.
	 */
	refreshSessionDurationSeconds?: number;
}

export interface IProvideSessionAwareDriverFactory {
	/**
	 * An interface that allows a concrete instance of a driver factory to interrogate itself
	 * to find out if it is session aware.
	 */
	readonly ISessionAwareDriverFactory: ISessionAwareDriverFactory;
}

export interface ISessionAwareDriverFactory extends IProvideSessionAwareDriverFactory {
	/**
	 * An interface that allows a concrete instance of a driver factory to call the `getRelayServiceSessionInfo`
	 * function if it session aware.
	 */
	getRelayServiceSessionInfo(
		resolvedUrl: IResolvedUrl,
	): Promise<ISocketStorageDiscovery | undefined>;
}
