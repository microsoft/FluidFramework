/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { pkgVersion } from "./packageVersion";

export const RouterliciousDriverApi = {
    version: pkgVersion,
    RouterliciousDocumentServiceFactory,
};

export type RouterliciousDriverApiType = typeof RouterliciousDriverApi;
