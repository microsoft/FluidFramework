/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver";
import { pkgVersion } from "./packageVersion.js";

/**
 * @internal
 */
export const RouterliciousDriverApi = {
	version: pkgVersion,
	modulePath: "",
	RouterliciousDocumentServiceFactory,
};

/**
 * @internal
 */
export type RouterliciousDriverApiType = typeof RouterliciousDriverApi;
