/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/core-interfaces";
import { DriverHeader } from "@fluidframework/driver-definitions";
import { ShareLinkTypes } from "@fluidframework/odsp-driver-definitions";

/**
 * Create the request object with url and headers for creating a new file on OneDrive Sharepoint
 * @param siteUrl - Base url for OneDrive
 * @param driveId - drive identifier
 * @param filePath - path where file needs to be created
 * @param fileName - name of the new file to be created
 * @param createLinkType - type of sharing link you would like to create for this file
 */
export function createOdspCreateContainerRequest(
    siteUrl: string,
    driveId: string,
    filePath: string,
    fileName: string,
    createLinkType?: ShareLinkTypes,
): IRequest {
    const createNewRequest: IRequest = {
        url: `${siteUrl}?driveId=${encodeURIComponent(
            driveId,
        )}&path=${encodeURIComponent(filePath)}${createLinkType ? `&createLinkType=${createLinkType}` : ""}`,
        headers: {
            [DriverHeader.createNew]: {
                fileName,
            },
        },
    };
    return createNewRequest;
}
