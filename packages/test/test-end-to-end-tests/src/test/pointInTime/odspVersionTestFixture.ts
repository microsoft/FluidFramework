/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Fixture that turns a live, attached ODSP container into the {@link OdspVersionTestApiProps} the
 * point-in-time version helpers ({@link ./odspVersionTestApi.js}) need: the file's url parts plus a
 * token-fetcher that authenticates against the same tenant the test driver is using.
 */

import { strict as assert } from "assert";

import { OdspTestDriver } from "@fluid-private/test-drivers";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type {
	IOdspResolvedUrl,
	IOdspUrlParts,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import type { ITestObjectProvider } from "@fluidframework/test-utils/internal";

import type { OdspVersionTestApiProps } from "./odspVersionTestApi.js";

/**
 * Build the props needed to make raw ODSP version REST calls for the given attached container.
 *
 * @param provider - the test object provider; its driver must be the ODSP test driver.
 * @param container - an attached container whose resolved url points at the ODSP file to operate on.
 */
export function createOdspVersionTestApiProps(
	provider: ITestObjectProvider,
	container: IContainer,
): OdspVersionTestApiProps {
	assert(
		provider.driver.type === "odsp",
		"Point-in-time version tests require the odsp driver",
	);
	const odspDriver = provider.driver as OdspTestDriver;

	const resolvedUrl = container.resolvedUrl as IOdspResolvedUrl | undefined;
	assert(
		resolvedUrl !== undefined,
		"Container must be attached before arranging its version history",
	);
	const { siteUrl, driveId, itemId } = resolvedUrl;
	const urlParts: IOdspUrlParts = { siteUrl, driveId, itemId };

	const getAuthHeader: InstrumentedStorageTokenFetcher = async (options) => {
		const token = await odspDriver.getStorageTokenForResource({
			...options,
			siteUrl,
			driveId,
			itemId,
		});
		return `Bearer ${token}`;
	};

	return { urlParts, getAuthHeader, logger: provider.logger };
}
