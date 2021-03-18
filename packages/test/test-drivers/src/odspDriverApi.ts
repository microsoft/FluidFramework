/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    OdspDocumentServiceFactory,
    createOdspCreateContainerRequest,
    createOdspUrl,
    OdspDriverUrlResolver,
} from "@fluidframework/odsp-driver";
import { pkgVersion } from "./packageVersion";

export const OdspDriverApi = {
    version: pkgVersion,
    OdspDocumentServiceFactory,
    OdspDriverUrlResolver,
    createOdspCreateContainerRequest,
    createOdspUrl,                          // REVIEW: does this need to be back compat?
};

export type OdspDriverApiType = typeof OdspDriverApi;
