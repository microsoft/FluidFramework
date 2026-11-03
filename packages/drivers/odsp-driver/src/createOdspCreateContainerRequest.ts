/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IRequest } from "@fluidframework/core-interfaces";
import {
	DriverHeader,
	type IContainerPackageInfo,
} from "@fluidframework/driver-definitions/internal";
import type { ISharingLinkKind } from "@fluidframework/odsp-driver-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { buildOdspShareLinkReqParams, getContainerPackageName } from "./odspUtils.js";

/**
 * Options for creating a new file on OneDrive or SharePoint in a folder identified by its item ID.
 * @remarks Pass these options to the `createOdspCreateContainerRequest` overload that takes an options object.
 * @input
 * @legacy
 * @beta
 */
export interface OdspCreateContainerRequestOptions {
	/**
	 * Base URL of the OneDrive or SharePoint site.
	 */
	readonly siteUrl: string;

	/**
	 * ID of the drive in which to create the file.
	 */
	readonly driveId: string;

	/**
	 * Item ID of the folder in which to create the file.
	 * @remarks
	 * Unlike a folder path, a folder's item ID doesn't change when the folder is renamed or moved.
	 * Must not be empty.
	 */
	readonly parentFolderId: string;

	/**
	 * Name of the new file.
	 */
	readonly fileName: string;

	/**
	 * Kind of sharing link to create along with the file.
	 * @remarks If not provided, no sharing link is created.
	 */
	readonly createShareLinkType?: ISharingLinkKind | undefined;

	/**
	 * Container package information, used to extract the container package name.
	 * @remarks If not provided, the container package is treated as having no name.
	 */
	readonly containerPackageInfo?: IContainerPackageInfo | undefined;
}

/**
 * Creates the request object, with URL and headers, for creating a new file on OneDrive or SharePoint
 * in the folder identified by {@link OdspCreateContainerRequestOptions.parentFolderId}.
 * @remarks
 * Use this overload when the folder might be renamed or moved,
 * because a folder's item ID stays the same when that happens, but its path doesn't.
 * @param options - Specifies where to create the file and what to create along with it.
 * @returns The request to pass when attaching the container.
 * @throws An error whose `errorType` is `"usageError"` if {@link OdspCreateContainerRequestOptions.parentFolderId} is empty.
 * @legacy
 * @beta
 */
export function createOdspCreateContainerRequest(
	options: OdspCreateContainerRequestOptions,
): IRequest;

// Keep this overload last.
// Utility types such as `Parameters<typeof createOdspCreateContainerRequest>` resolve to the last overload,
// and existing consumers expect them to resolve to this signature.
/**
 * Create the request object with url and headers for creating a new file on OneDrive Sharepoint
 * @remarks
 * To identify the folder by its item ID instead of its path, use the overload that takes {@link OdspCreateContainerRequestOptions}.
 * @param siteUrl - Base url for OneDrive
 * @param driveId - drive identifier
 * @param filePath - path where file needs to be created
 * @param fileName - name of the new file to be created
 * @param createShareLinkType - type of sharing link you would like to create for this file. ShareLinkTypes
 * will be deprecated soon, so for any new implementation please provide createShareLinkType of type ShareLink
 * @param containerPackageInfo - Container package information which will be used to extract the container package name.
 * If not given that means that the container package does not have a name.
 * @legacy
 * @beta
 */
export function createOdspCreateContainerRequest(
	siteUrl: string,
	driveId: string,
	filePath: string,
	fileName: string,
	createShareLinkType?: ISharingLinkKind,
	containerPackageInfo?: IContainerPackageInfo | undefined,
): IRequest;

/**
 * Implementation of the `createOdspCreateContainerRequest` overloads.
 * @legacy
 * @beta
 */
export function createOdspCreateContainerRequest(
	...args:
		| [options: OdspCreateContainerRequestOptions]
		| [
				siteUrl: string,
				driveId: string,
				filePath: string,
				fileName: string,
				createShareLinkType?: ISharingLinkKind,
				containerPackageInfo?: IContainerPackageInfo | undefined,
		  ]
): IRequest {
	// The options overload is the only one-argument signature.
	// Tuple lengths are literal types, so this check also narrows `args` to the matching signature.
	if (args.length === 1) {
		const [options] = args;
		if (options.parentFolderId === "") {
			throw new UsageError("parentFolderId must not be empty");
		}
		return buildCreateNewRequest(
			options,
			`driveId=${encodeURIComponent(options.driveId)}&parentFolderId=${encodeURIComponent(options.parentFolderId)}`,
		);
	}
	const [siteUrl, driveId, filePath, fileName, createShareLinkType, containerPackageInfo] =
		args;
	return buildCreateNewRequest(
		{ siteUrl, fileName, createShareLinkType, containerPackageInfo },
		`driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}`,
	);
}

/**
 * Builds the create-new request from the query parameters that identify the drive and the file's location.
 */
function buildCreateNewRequest(
	{
		siteUrl,
		fileName,
		createShareLinkType,
		containerPackageInfo,
	}: Pick<
		OdspCreateContainerRequestOptions,
		"siteUrl" | "fileName" | "createShareLinkType" | "containerPackageInfo"
	>,
	locationQuery: string,
): IRequest {
	const shareLinkRequestParams = buildOdspShareLinkReqParams(createShareLinkType);
	return {
		url: `${siteUrl}?${locationQuery}${containerPackageInfo ? `&containerPackageName=${getContainerPackageName(containerPackageInfo)}` : ""}${shareLinkRequestParams ? `&${shareLinkRequestParams}` : ""}`,
		headers: {
			[DriverHeader.createNew]: {
				fileName,
			},
		},
	};
}
