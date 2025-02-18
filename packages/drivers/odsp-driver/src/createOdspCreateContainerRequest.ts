/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import {
	DriverHeader,
	type IContainerPackageInfo,
} from "@fluidframework/driver-definitions/internal";
import { ISharingLinkKind } from "@fluidframework/odsp-driver-definitions/internal";

import { buildOdspShareLinkReqParams, getContainerPackageName } from "./odspUtils.js";

/**
 * Create the request object with url and headers for creating a new file on OneDrive Sharepoint
 * @param siteUrl - Base url for OneDrive
 * @param driveId - drive identifier
 * @param filePath - path where file needs to be created
 * @param fileName - name of the new file to be created
 * @param createShareLinkType - type of sharing link you would like to create for this file. ShareLinkTypes
 * will be deprecated soon, so for any new implementation please provide createShareLinkType of type ShareLink
 * @param containerPackageInfo - *DEPRECATED* container package information which will be used to extract the container package name.
 * If not given that means that the container package does not have a name.
 * @legacy
 * @alpha
 */
export function createOdspCreateContainerRequest(
	siteUrl: string,
	driveId: string,
	filePath: string,
	fileName: string,
	createShareLinkType?: ISharingLinkKind,
	containerPackageInfo?: IContainerPackageInfo | undefined,
): IRequest {
	const shareLinkRequestParams = buildOdspShareLinkReqParams(createShareLinkType);
	const createNewRequest: IRequest = {
		url: `${siteUrl}?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(
			filePath,
		)}${containerPackageInfo ? `&containerPackageName=${getContainerPackageName(containerPackageInfo)}` : ""}${shareLinkRequestParams ? `&${shareLinkRequestParams}` : ""}`,
		headers: {
			[DriverHeader.createNew]: {
				fileName,
			},
		},
	};
	return createNewRequest;
}
