/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IOdspUrlParts } from "@fluidframework/odsp-driver-definitions";

/**
 * Socket storage discovery api response
 */
export interface ISocketStorageDiscovery {
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

export interface OdspFluidDataStoreLocator extends IOdspUrlParts {
	dataStorePath: string;
	appName?: string;
	containerPackageName?: string;
	fileVersion?: string;
	context?: string;
}

export enum SharingLinkHeader {
	// Can be used in request made to resolver, to tell the resolver that the passed in URL is a sharing link
	// which can be redeemed at server to get permissions.
	isSharingLinkToRedeem = "isSharingLinkToRedeem",
}

export interface ISharingLinkHeader {
	[SharingLinkHeader.isSharingLinkToRedeem]: boolean;
}

export enum ClpCompliantAppHeader {
	// Can be used in request made to resolver, to tell the resolver that the host app is CLP compliant.
	// Odsp will not return Classified, labeled, or protected documents if the host app cannot support them.
	isClpCompliantApp = "X-CLP-Compliant-App",
}

export interface IClpCompliantAppHeader {
	[ClpCompliantAppHeader.isClpCompliantApp]: boolean;
}

declare module "@fluidframework/core-interfaces" {
	export interface IRequestHeader
		extends Partial<ISharingLinkHeader>,
			Partial<IClpCompliantAppHeader> {}
}
