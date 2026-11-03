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
 * Create the request object with url and headers for creating a new file on OneDrive Sharepoint
 * @remarks
 * To identify the folder by its item ID instead of its path, use {@link createOdspCreateContainerRequestFromOptions}.
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
): IRequest {
	return buildCreateNewRequest(
		{ siteUrl, driveId, fileName, createShareLinkType, containerPackageInfo },
		"path",
		filePath,
	);
}

/**
 * Options for {@link createOdspCreateContainerRequestFromOptions} that apply regardless of how the folder for the new file is identified.
 * @input
 * @legacy
 * @beta
 */
export interface OdspCreateContainerRequestBaseOptions {
	/**
	 * Base URL of the OneDrive or SharePoint site.
	 */
	readonly siteUrl: string;

	/**
	 * ID of the drive in which to create the file.
	 */
	readonly driveId: string;

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
 * Options for creating a new file on OneDrive or SharePoint with {@link createOdspCreateContainerRequestFromOptions}.
 * @remarks
 * Exactly one of `filePath` or `parentFolderId` identifies the folder in which to create the file.
 * @input
 * @legacy
 * @beta
 */
export type OdspCreateContainerRequestOptions = OdspCreateContainerRequestBaseOptions &
	(
		| {
				/**
				 * Path of the folder in which to create the file, relative to the root of the drive.
				 * @remarks An empty path refers to the root of the drive.
				 */
				readonly filePath: string;
				readonly parentFolderId?: undefined;
		  }
		| {
				/**
				 * Item ID of the folder in which to create the file.
				 * @remarks
				 * Unlike a folder's path, its item ID doesn't change when the folder is renamed or moved.
				 * Must not be empty.
				 */
				readonly parentFolderId: string;
				readonly filePath?: undefined;
		  }
	);

/**
 * Creates the request object, with URL and headers, for creating a new file on OneDrive or SharePoint.
 * @remarks
 * `options` identifies the folder in which to create the file by either its path (`filePath`) or its item ID (`parentFolderId`).
 * Prefer the item ID when the folder might be renamed or moved,
 * because a folder's item ID stays the same when that happens, but its path doesn't.
 * @param options - Specifies where to create the file and what to create along with it.
 * @returns The request to pass when attaching the container.
 * @throws An error whose `errorType` is `"usageError"` if `options` doesn't provide exactly one of `filePath` or `parentFolderId`,
 * or if `parentFolderId` is empty.
 * @legacy
 * @beta
 */
export function createOdspCreateContainerRequestFromOptions(
	options: OdspCreateContainerRequestOptions,
): IRequest {
	// The type requires exactly one of these, but callers aren't necessarily type-checked,
	// so validate them as independent values.
	const {
		filePath,
		parentFolderId,
	}: { readonly filePath?: string; readonly parentFolderId?: string } = options;
	if (parentFolderId === undefined) {
		if (filePath === undefined) {
			throw new UsageError("Either filePath or parentFolderId must be provided");
		}
		return buildCreateNewRequest(options, "path", filePath);
	}
	if (filePath !== undefined) {
		throw new UsageError("Only one of filePath or parentFolderId can be provided");
	}
	if (parentFolderId === "") {
		throw new UsageError("parentFolderId must not be empty");
	}
	return buildCreateNewRequest(options, "parentFolderId", parentFolderId);
}

/**
 * Builds the request for creating a new file in the folder identified by the given query parameter.
 */
function buildCreateNewRequest(
	{
		siteUrl,
		driveId,
		fileName,
		createShareLinkType,
		containerPackageInfo,
	}: OdspCreateContainerRequestBaseOptions,
	folderParamName: "path" | "parentFolderId",
	folderParamValue: string,
): IRequest {
	const shareLinkRequestParams = buildOdspShareLinkReqParams(createShareLinkType);
	return {
		url: `${siteUrl}?driveId=${encodeURIComponent(driveId)}&${folderParamName}=${encodeURIComponent(folderParamValue)}${containerPackageInfo ? `&containerPackageName=${getContainerPackageName(containerPackageInfo)}` : ""}${shareLinkRequestParams ? `&${shareLinkRequestParams}` : ""}`,
		headers: {
			[DriverHeader.createNew]: {
				fileName,
			},
		},
	};
}
