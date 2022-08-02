/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { NetworkError } from "@fluidframework/server-services-client";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import {
    IFileSystemManager,
    IRepoManagerParams,
} from "./definitions";
import { exists, getLumberjackBasePropertiesFromRepoManagerParams } from "./helpers";

export function getSoftDeletedMarkerPath(basePath: string): string {
    return `${basePath}/.softDeleted`;
}

export async function checkSoftDeleted(
    fileSystemManager: IFileSystemManager,
    repoPath: string,
    repoManagerParams: IRepoManagerParams,
    repoPerDocEnabled: boolean): Promise<void> {
    // DELETE API is only implemented for the repo-per-doc model
    if (!repoPerDocEnabled) {
        return;
    }
    const lumberjackProperties = {
        ...getLumberjackBasePropertiesFromRepoManagerParams(repoManagerParams),
    };
    console.log("[DEBUG] checkSoftDeleted repoManagerParams: ", JSON.stringify(repoManagerParams));
    const softDeletedMarkerPath = getSoftDeletedMarkerPath(repoPath);
    console.log("[DEBUG] softDeletedMarkerPath: ", softDeletedMarkerPath);
    const softDeleteBlobExists = await exists(fileSystemManager, softDeletedMarkerPath);
    const softDeleted = softDeleteBlobExists !== false && softDeleteBlobExists.isFile();
    console.log("[DEBUG] softDeleted: ", softDeleted);
    if (softDeleted) {
        console.log("[DEBUG] Already soft deleted, will return 410.");
        const error = new NetworkError(410, "The requested resource has been deleted.");
        Lumberjack.error("Attempted to retrieve soft-deleted document.", lumberjackProperties, error);
        throw error;
    }
}

// export function softDeleteMiddleware(
//     fileSystemManagerFactory: IFileSystemManagerFactory,
//     repositoryManagerFactory: IRepositoryManagerFactory): express.RequestHandler {
//     return async (request, response, next) => {
//         const repoManagerParams = getRepoManagerParamsFromRequest(request);
//         console.log("[DEBUG] softDeleteMiddleware repoManagerParams: ", JSON.stringify(repoManagerParams));
//         const lumberjackProperties = {
//             ...getLumberjackBasePropertiesFromRepoManagerParams(repoManagerParams),
//         };
//         try {
//             console.log("[DEBUG] Starting softDeleteMiddleware");
//             const fileSystemManager = fileSystemManagerFactory.create(repoManagerParams.fileSystemManagerParams);
//             console.log("[DEBUG] File system manager created");
//             const repoManager = await repositoryManagerFactory.open(repoManagerParams);
//             console.log("[DEBUG] Repo manager created");
//             const softDeleted = await isDocumentSoftDeleted(fileSystemManager, repoManager);
//             console.log("[DEBUG] Soft deleted is: ", softDeleted);
//             if (softDeleted) {
//                 console.log("[DEBUG] Already soft deleted, will return 410.");
//                 const error = new NetworkError(410, "The requested resource has been deleted.");
//                 Lumberjack.error("Attempted to retrieve soft-deleted document.", lumberjackProperties, error);
//                 const promise = Promise.reject(error);
//                 handleResponse(promise, response);
//             } else {
//                 console.log("[DEBUG] Not soft deleted, will call next");
//                 next();
//             }
//         }
//         catch (error: any) {
//             console.log("[DEBUG] Caught error: ", JSON.stringify(error));
//             if (error?.code === "ENOENT" ||
//                 (error instanceof NetworkError &&
//                 error?.code === 400 &&
//                 error?.message.startsWith("Repo does not exist"))) {
//                     console.log("[DEBUG] Error is ENOENT, so calling next");
//                     next();
//             } else {
//                 console.log("[DEBUG] Other error, will reject");
//                 Lumberjack.error(
//                     "Error when trying to check if document was soft-deleted.",
//                     lumberjackProperties,
//                     error);
//                 const promise = Promise.reject(error);
//                 handleResponse(promise, response);
//             }
//         }
//     };
// }
