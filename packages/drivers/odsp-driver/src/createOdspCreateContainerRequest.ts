/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IRequest } from "@fluidframework/core-interfaces";
import { DriverHeader } from "@fluidframework/driver-definitions";

export function createOdspCreateContainerRequest(
    siteUrl: string,
    driveId: string,
    filePath: string,
    fileName: string,
): IRequest {
    const createNewRequest: IRequest = {
        url: `${siteUrl}?driveId=${encodeURIComponent(
            driveId,
        )}&path=${encodeURIComponent(filePath)}`,
        headers: {
            [DriverHeader.createNew]: {
                fileName,
            },
        },
    };
    return createNewRequest;
}
