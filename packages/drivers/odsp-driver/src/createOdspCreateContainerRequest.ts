/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/core-interfaces";
import { CreateNewHeader } from "@fluidframework/driver-definitions";

export function createOdspCreateContainerRequest(
    siteUrl: string,
    driveId: string,
    filePath: string,
    fileName: string,
    containerPackageName?: string,
): IRequest {
    let odspUrl = `${siteUrl}?driveId=${encodeURIComponent(driveId)}&path=${encodeURIComponent(filePath)}`;
    if (containerPackageName) {
        odspUrl += `&containerPackageName=${encodeURIComponent(containerPackageName)}`;
    }
    const createNewRequest: IRequest = {
        url: odspUrl,
        headers: {
            [CreateNewHeader.createNew]: {
                fileName,
            },
        },
    };
    return createNewRequest;
}
