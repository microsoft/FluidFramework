/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";

/**
 * @legacy
 * @alpha
 */
export interface IOdspUrlParts {
	siteUrl: string;
	driveId: string;
	itemId: string;
}

/**
 * Sharing scope of the share links created for a file.
 * @legacy
 * @alpha
 */
export enum SharingLinkScope {
	organization = "organization",
	users = "users",
	anonymous = "anonymous",
	default = "default",
}

/**
 * View/edit permission role for a sharing link.
 * @legacy
 * @alpha
 */
export enum SharingLinkRole {
	view = "view",
	edit = "edit",
}

/**
 * Defines the permissions scope for a share link requested to be created during the creation the file in ODSP.
 * Providing these properties to the /snapshot api will also create and return the requested kind of sharing link.
 * @legacy
 * @alpha
 */
export interface ISharingLinkKind {
	scope: SharingLinkScope;
	/*
	 * If this parameter is not provided, the API will default to "edit" links (provided
	 * a valid createLinkScope setting is given).
	 */
	role?: SharingLinkRole;
}

/**
 * Sharing link data received from the /snapshot api response.
 * @legacy
 * @alpha
 */
export interface ISharingLink extends ISharingLinkKind {
	webUrl: string;
}

/**
 * Sharing link data created for the ODSP item.
 * Contains information about either sharing link created while creating a new file or
 * a redeemable share link created when loading an existing file
 * @legacy
 * @alpha
 */
export interface ShareLinkInfoType {
	/**
	 * We create a new file in ODSP with the /snapshot api call. Applications then need to make a separate apis call to
	 * create a sharing link for that file. To reduce the number of network calls, ODSP now provides a feature
	 * where we can create a share link along with creating a file by passing a query parameter called
	 * createShareLink (deprecated) or createLinkScope and createLinkRole. createLink object below saves the information
	 * from the /snapshot api response.
	 */
	createLink?: {
		/**
		 * Share link created when the file is created for the first time with /snapshot api call.
		 */
		link?: ISharingLink;

		/**
		 * Error message if creation of sharing link fails with /snapshot api call
		 */
		error?: any;

		shareId?: string;
	};

	/**
	 * This is used to save the network calls while doing trees/latest call as if the client does not have
	 * permission then this link can be redeemed for the permissions in the same network call.
	 */
	sharingLinkToRedeem?: string;
}
/**
 * @legacy
 * @alpha
 */
export interface IOdspResolvedUrl extends IResolvedUrl, IOdspUrlParts {
	type: "fluid";
	odspResolvedUrl: true;

	// URL to send to fluid, contains the documentId and the path
	url: string;

	// A hashed identifier that is unique to this document
	hashedDocumentId: string;

	endpoints: {
		snapshotStorageUrl: string;
		attachmentPOSTStorageUrl: string;
		attachmentGETStorageUrl: string;
		deltaStorageUrl: string;
	};

	// Tokens are not obtained by the ODSP driver using the resolve flow, the app must provide them.
	// eslint-disable-next-line @typescript-eslint/ban-types
	tokens: {};

	fileName: string;
	/**
	 * Used to track when a file was created with a temporary name. In that case this value will
	 * be the desired name, which the file is eventually renamed too.
	 */
	pendingRename?: string;

	summarizer: boolean;

	codeHint?: {
		// containerPackageName is used for adding the package name to the request headers.
		// This may be used for preloading the container package when loading Fluid content.
		containerPackageName?: string;
	};

	fileVersion: string | undefined;

	dataStorePath?: string;

	/**
	 * Sharing link data created for the ODSP item.
	 * Contains information about either sharing link created while creating a new file or
	 * a redeemable share link created when loading an existing file
	 */
	shareLinkInfo?: ShareLinkInfoType;

	isClpCompliantApp?: boolean;

	/**
	 * Context for given resolved URL. The context of a resolved URL is a string that contains
	 * the resolved URL and the data store path of the resolved URL.
	 */
	context?: string;

	/**
	 * Name of the application that owns the URL. This hint is used by link handling logic which determines which
	 * app to redirect to when user navigates directly to the link.
	 * Can be ommited in case it is not necessary for the link handling logic.
	 */
	appName?: string;
}
