/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { OdspFluidDataStoreLocator } from "./contractsPublic";

/*
 * Per https://github.com/microsoft/FluidFramework/issues/1556, isolating createOdspUrl() in its own file.
 */

/**
 * Encodes ODC/SPO information into a URL format that can be handled by the Loader
 * @param l -The property bag of necessary properties to locate a Fluid data store and craft a url for it
 * @alpha
 */
export function createOdspUrl(l: OdspFluidDataStoreLocator): string {
	let odspUrl = `${l.siteUrl}?driveId=${encodeURIComponent(
		l.driveId,
	)}&itemId=${encodeURIComponent(l.itemId)}&path=${encodeURIComponent(l.dataStorePath)}`;
	if (l.containerPackageName) {
		odspUrl += `&containerPackageName=${encodeURIComponent(l.containerPackageName)}`;
	}
	if (l.fileVersion) {
		odspUrl += `&fileVersion=${encodeURIComponent(l.fileVersion)}`;
	}

	return odspUrl;
}
