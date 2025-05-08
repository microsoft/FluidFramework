/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { ITestDriver } from "@fluid-internal/test-driver-definitions";
import { IContainer } from "@fluidframework/container-definitions/internal";
import { IOdspResolvedUrl } from "@fluidframework/odsp-driver-definitions/internal";
import { ITestObjectProvider } from "@fluidframework/test-utils/internal";

const driversThatSupportBlobs: string[] = ["local", "odsp"];
export function driverSupportsBlobs(driver: ITestDriver): boolean {
	return driversThatSupportBlobs.includes(driver.type);
}

// TODO: #7684
export const getUrlFromDetachedBlobStorage = async (
	container: IContainer,
	provider: ITestObjectProvider,
): Promise<string> => {
	switch (provider.driver.type) {
		case "odsp": {
			const itemId = (container.resolvedUrl as IOdspResolvedUrl).itemId;
			const url = (provider.driver as any).getUrlFromItemId(itemId);
			assert(url && typeof url === "string");
			return url;
		}
		case "local": {
			const url = await container.getAbsoluteUrl("");
			assert(url && typeof url === "string");
			return url;
		}
		default: {
			throw new Error(`Provider type ${provider.driver.type} not supported`);
		}
	}
};
