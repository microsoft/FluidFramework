/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface IBaseNewFileParams {
    fileName: string;
    siteUrl: string;
}

export interface IRouterliciousNewFileParams extends IBaseNewFileParams {
    tenantId: string;
    ordererUrl: string;
}

export interface IOdspNewFileParams extends IBaseNewFileParams {
    driveId: string;
    filePath: string;
}

export interface ILocalNewFileParams extends IBaseNewFileParams {
    tenantId: string;
}

/**
 * Parameters to be used for different drivers to create a new file while attaching the container.
 */
export type INewFileParams = IOdspNewFileParams | IRouterliciousNewFileParams | ILocalNewFileParams;
