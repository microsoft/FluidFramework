/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IResolvedUrl } from "@fluidframework/driver-definitions/internal";

/**
 * Identifies a file in SharePoint.
 * This is required information to do any Graph / Vroom REST API calls.
 * @legacy
 * @alpha
 */
export interface IOdspUrlParts {
	/**
	 * Site URL where file is located
	 */
	siteUrl: string;

	/**
	 * driveId where file is located.
	 */
	driveId: string;

	/**
	 * itemId within a drive that identifies a file.
	 */
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
		 * Kind of the link requested at creation time.
		 * Should be equal to the value in {@link ShareLinkInfoType.createLink.link} property, but may differ if ODSP created different type of link
		 */
		createKind: ISharingLinkKind;

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

	/**
	 * A hashed identifier that is unique to this document
	 */
	hashedDocumentId: string;

	/**
	 * Endpoints for various REST calls
	 */
	endpoints: {
		snapshotStorageUrl: string;
		attachmentPOSTStorageUrl: string;
		attachmentGETStorageUrl: string;
		deltaStorageUrl: string;
	};

	/**
	 * Tokens are not obtained by the ODSP driver using the resolve flow, the app must provide them.
	 */
	// eslint-disable-next-line @typescript-eslint/ban-types
	tokens: {};

	fileName: string;

	/**
	 * Path to a file. Required on file creation path. Not used on file open path.
	 */
	filePath?: string;

	/**
	 * Tells driver if a given container instance is a summarizer instance.
	 */
	summarizer: boolean;

	/*
	 * containerPackageName is used for adding the package name to the request headers.
	 * This may be used for preloading the container package when loading Fluid content.
	 */
	codeHint?: {
		containerPackageName?: string;
	};

	/**
	 * If privided, tells version of a file to open
	 */
	fileVersion: string | undefined;

	/**
	 * This field can be used by the application code to create deep links into document
	 */
	dataStorePath?: string;

	/**
	 * Sharing link data created for the ODSP item.
	 * Contains information about either sharing link created while creating a new file or
	 * a redeemable share link created when loading an existing file
	 */
	shareLinkInfo?: ShareLinkInfoType;

	/**
	 * Should be set to true only by application that is CLP compliant, for CLP compliant workflow.
	 * This argument has no impact if application is not properly registered with Sharepoint.
	 */
	isClpCompliantApp?: boolean;
}

/**
 * Input arguments required to create IOdspResolvedUrl that OdspDriver can work with.
 * @legacy
 * @alpha
 */
export interface IOdspOpenRequest {
	/**
	 * {@inheritDoc (IOdspUrlParts:interface).siteUrl}
	 */
	siteUrl: string;

	/**
	 * {@inheritDoc (IOdspUrlParts:interface).driveId}
	 */
	driveId: string;

	/**
	 * {@inheritDoc (IOdspUrlParts:interface).itemId}
	 */
	itemId: string;

	/**
	 * {@inheritDoc (IOdspResolvedUrl:interface).summarizer}
	 */
	summarizer: boolean;

	/**
	 * {@inheritDoc (IOdspResolvedUrl:interface).fileVersion}
	 */
	fileVersion: string | undefined;

	/**
	 * {@inheritDoc (IOdspResolvedUrl:interface).isClpCompliantApp}
	 */
	isClpCompliantApp?: boolean;

	/**
	 * {@inheritDoc (ShareLinkInfoType:interface).sharingLinkToRedeem}
	 */
	sharingLinkToRedeem?: string;

	/**
	 * {@inheritDoc (IOdspResolvedUrl:interface).dataStorePath}
	 */
	dataStorePath?: string;

	/**
	 * {@inheritDoc (IOdspResolvedUrl:interface).codeHint}
	 */
	codeHint?: {
		containerPackageName?: string;
	};
}

/**
 * Input arguments required to create IOdspResolvedUrl that OdspDriver can work with.
 * @legacy
 * @alpha
 */
export type IOdspCreateRequest = {
	/**
	 * {@inheritDoc (IOdspUrlParts:interface).siteUrl}
	 */
	siteUrl: string;

	/**
	 * {@inheritDoc (IOdspUrlParts:interface).driveId}
	 */
	driveId: string;

	/**
	 * {@inheritDoc (IOdspResolvedUrl:interface).dataStorePath}
	 */
	dataStorePath?: string;

	/**
	 * {@inheritDoc (IOdspResolvedUrl:interface).codeHint}
	 */
	codeHint?: {
		containerPackageName?: string;
	};

	/**
	 * {@inheritDoc (IOdspResolvedUrl:interface).isClpCompliantApp}
	 */
	isClpCompliantApp?: boolean;
} & (
	| {
			/**
			 * {@inheritDoc (IOdspUrlParts:interface).itemId}
			 */
			itemId: string;
	  }
	| {
			/**
			 * Path to a file within site. If not provided, files will be created in the root of the collection.
			 */
			filePath?: string;

			/**
			 * {@inheritDoc (IOdspResolvedUrl:interface).fileName}
			 */
			fileName: string;
			/**
			 * Instructs ODSP to create a sharing link as part of file creation.
			 */
			createShareLinkType?: ISharingLinkKind;
	  }
);
