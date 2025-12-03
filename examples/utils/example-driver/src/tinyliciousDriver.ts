/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-internal-modules
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/internal";
import {
	createTinyliciousCreateNewRequest,
	InsecureTinyliciousTokenProvider,
	InsecureTinyliciousUrlResolver,
	// eslint-disable-next-line import-x/no-internal-modules
} from "@fluidframework/tinylicious-driver/internal";

import type { ExampleDriver } from "./interfaces.js";

export const createTinyliciousDriver = async (): Promise<ExampleDriver> => {
	const tokenProvider = new InsecureTinyliciousTokenProvider();
	return {
		urlResolver: new InsecureTinyliciousUrlResolver(),
		documentServiceFactory: new RouterliciousDocumentServiceFactory(tokenProvider),
		createCreateNewRequest: (id: string) => createTinyliciousCreateNewRequest(),
		createLoadExistingRequest: async (id: string) => {
			return { url: id };
		},
	};
};
