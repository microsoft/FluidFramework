/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	getDriveId,
	getDriveItemByRootFileName,
	// eslint-disable-next-line import-x/no-internal-modules
} from "@fluidframework/odsp-doclib-utils/internal";
import {
	createOdspCreateContainerRequest,
	createOdspUrl,
	OdspDocumentServiceFactory,
	OdspDriverUrlResolver,
	// eslint-disable-next-line import-x/no-internal-modules
} from "@fluidframework/odsp-driver/internal";

import type { ExampleDriver } from "./interfaces.js";

/**
 * Get the required siteUrl, storageToken, or pushToken, relying on webpack to provide these via middleware
 * responding to get requests for those paths, respectively.  The example-webpack-integration package provides
 * middleware to make this easy to do.
 */
const getFromMiddleware = async (
	path: "siteUrl" | "storageToken" | "pushToken",
): Promise<string> => {
	const fetchResponse = await fetch(`/${path}`);
	if (fetchResponse.status === 404) {
		throw new Error(
			`Failed to fetch ${path}. Make sure you installed the example-webpack-integration middleware.`,
		);
	} else if (!fetchResponse.ok) {
		throw new Error(
			`Failed to fetch ${path}. Status: ${fetchResponse.status}, Message: ${fetchResponse.statusText}`,
		);
	}
	return fetchResponse.text();
};

const directory = "examples";

export const createOdspDriver = async (): Promise<ExampleDriver> => {
	// We proactively fetch and retain the tokens and site URL - we want to avoid repeated calls to the middleware
	// which would result in repeated calls to fetch the token (which is slow). We could be lazier about making the
	// request which would get the request out of the critical path for detached container creation, but the performance
	// difference doesn't really matter for our examples currently.
	const storageToken = await getFromMiddleware("storageToken");
	const pushToken = await getFromMiddleware("pushToken");
	const siteUrl = await getFromMiddleware("siteUrl");
	const driveId = await getDriveId(siteUrl, "", undefined, {
		accessToken: storageToken,
	});
	return {
		urlResolver: new OdspDriverUrlResolver(),
		documentServiceFactory: new OdspDocumentServiceFactory(
			async () => storageToken,
			async () => pushToken,
		),
		createCreateNewRequest: (id: string) =>
			createOdspCreateContainerRequest(siteUrl, driveId, directory, `${id}.tstFluid`),
		createLoadExistingRequest: async (id: string) => {
			const driveItem = await getDriveItemByRootFileName(
				siteUrl,
				undefined,
				`/${directory}/${id}.tstFluid`,
				{
					accessToken: storageToken,
				},
				false,
				driveId,
			);

			const url = createOdspUrl({
				...driveItem,
				siteUrl,
				dataStorePath: "/",
			});
			return { url };
		},
	};
};
