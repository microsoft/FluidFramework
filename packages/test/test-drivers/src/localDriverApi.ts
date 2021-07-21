/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    LocalDocumentServiceFactory,
    LocalResolver,
    createLocalResolverCreateNewRequest,
} from "@fluidframework/local-driver";
import { pkgVersion } from "./packageVersion";

export const LocalDriverApi = {
    version: pkgVersion,
    LocalDocumentServiceFactory,
    LocalResolver,
    createLocalResolverCreateNewRequest,
};

export type LocalDriverApiType = typeof LocalDriverApi;
