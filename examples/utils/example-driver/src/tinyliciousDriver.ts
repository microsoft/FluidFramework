/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-internal-modules
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/internal";
import {
	createTinyliciousCreateNewRequest,
	InsecureTinyliciousTokenProvider,
	InsecureTinyliciousUrlResolver,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/tinylicious-driver/internal";

export const createTinyliciousDriver = async () => {
	const tokenProvider = new InsecureTinyliciousTokenProvider();
	return {
		urlResolver: new InsecureTinyliciousUrlResolver(),
		documentServiceFactory: new RouterliciousDocumentServiceFactory(tokenProvider),
		createCreateNewRequest: async (id: string) => createTinyliciousCreateNewRequest(),
		createLoadExistingRequest: async (id: string) => {
			return { url: id };
		},
	};
};
