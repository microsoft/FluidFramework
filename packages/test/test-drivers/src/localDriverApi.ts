/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createLocalResolverCreateNewRequest,
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";

import { pkgVersion } from "./packageVersion.js";

/**
 * @internal
 */
export const LocalDriverApi = {
	version: pkgVersion,
	LocalDocumentServiceFactory,
	LocalDeltaConnectionServer,
	LocalResolver,
	createLocalResolverCreateNewRequest,
};

/**
 * @internal
 */
export type LocalDriverApiType = typeof LocalDriverApi;
