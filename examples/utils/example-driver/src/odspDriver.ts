/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	getDriveId,
	getDriveItemByRootFileName,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/odsp-doclib-utils/internal";
import {
	createOdspCreateContainerRequest,
	createOdspUrl,
	OdspDocumentServiceFactory,
	OdspDriverUrlResolver,
	// eslint-disable-next-line import/no-internal-modules
} from "@fluidframework/odsp-driver/internal";

const getFromMiddleware = async (path: "siteUrl" | "storageToken" | "pushToken") => {
	const fetchResponse = await fetch(`/${path}`);
	if (fetchResponse.status === 404) {
		throw new Error(
			`Failed to fetch ${path}. Make sure you installed the example webpack-dev-server middleware.`,
		);
	} else if (!fetchResponse.ok) {
		throw new Error(
			`Failed to fetch ${path}. Status: ${fetchResponse.status}, Message: ${fetchResponse.statusText}`,
		);
	}
	return fetchResponse.text();
};

const directory = "examples";

export const createOdspDriver = async () => {
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
		createCreateNewRequest: async (id: string) =>
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
