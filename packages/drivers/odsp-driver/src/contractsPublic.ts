/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IOdspUrlParts } from "@fluidframework/odsp-driver-definitions/internal";

/**
 * @legacy
 * @beta
 */
export interface OdspFluidDataStoreLocator extends IOdspUrlParts {
	dataStorePath: string;
	appName?: string;
	containerPackageName?: string;
	fileVersion?: string;
	context?: string;
}

/**
 * @internal
 */
export enum SharingLinkHeader {
	/**
	 * Can be used in request made to resolver, to tell the resolver that the passed in URL is a sharing link
	 * which can be redeemed at server to get permissions.
	 */
	isSharingLinkToRedeem = "isSharingLinkToRedeem",
	/**
	 * When isSharingLinkToRedeem is true, this header can be used to tell the server that the redemption of the sharing link
	 * is meant to be non-durable.
	 */
	isRedemptionNonDurable = "isRedemptionNonDurable",
}

/**
 * @internal
 */
export interface ISharingLinkHeader {
	[SharingLinkHeader.isSharingLinkToRedeem]: boolean;
	[SharingLinkHeader.isRedemptionNonDurable]: boolean;
}
/**
 * @internal
 */
export enum ClpCompliantAppHeader {
	// Can be used in request made to resolver, to tell the resolver that the host app is CLP compliant.
	// Odsp will not return Classified, labeled, or protected documents if the host app cannot support them.
	isClpCompliantApp = "X-CLP-Compliant-App",
}

/**
 * @internal
 */
export interface IClpCompliantAppHeader {
	[ClpCompliantAppHeader.isClpCompliantApp]: boolean;
}

/**
 * @internal
 */
export enum FileMetadataHeader {
	/**
	 * ETag (entity tag) identifier for a specific version of the file.
	 * When provided, it will be sent to the snapshot API in the If-Match header.
	 */
	eTag = "eTag",
}
/**
 * @internal
 */
export interface IFileMetadataHeader {
	[FileMetadataHeader.eTag]: string;
}

declare module "@fluidframework/core-interfaces" {
	export interface IRequestHeader
		extends Partial<ISharingLinkHeader>,
			Partial<IClpCompliantAppHeader>,
			Partial<IFileMetadataHeader> {}
}
