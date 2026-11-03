/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
 * Test-only helpers for arranging a document's ODSP file-version history before exercising
 * point-in-time load (`loadContainerToSequenceNumber`) against the real service.
 *
 * These are the three ODSP REST operations needed to set up a point-in-time scenario:
 * - {@link listFileVersions} -- enumerate the file's versions (GET /versions).
 * - {@link restoreFileVersion} -- restore a previous version (POST .../restoreVersion).
 * - {@link triggerVersionViaMetadata} -- force a new version by patching item metadata (PATCH item).
 *
 * They deliberately reuse the odsp-driver's URL and auth-header construction (`getApiRoot`,
 * `getHeadersWithAuth`) and the driver's token-fetcher signature (`InstrumentedStorageTokenFetcher`)
 * so the requests match what the driver itself issues. Unlike the driver's own fetchers they use a
 * plain `fetch` (no `EpochTracker`): these are one-off setup calls, not part of the caching- and
 * consistency-sensitive load path.
 *
 * {@link createOdspVersionTestApiProps} is the fixture that adapts a live, attached ODSP container
 * into the {@link OdspVersionTestApiProps} the operations above take (the file's url parts plus a
 * token-fetcher bound to the test driver's tenant).
 */

import { strict as assert } from "assert";

import { OdspTestDriver } from "@fluid-private/test-drivers";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type {
	IOdspResolvedUrl,
	IOdspUrlParts,
	InstrumentedStorageTokenFetcher,
} from "@fluidframework/odsp-driver-definitions/internal";
import { getApiRoot, getHeadersWithAuth } from "@fluidframework/odsp-driver/internal";
import type { ITestObjectProvider } from "@fluidframework/test-utils/internal";

/**
 * A single entry from the driveItem `/versions` response.
 * @see https://learn.microsoft.com/en-us/onedrive/developer/rest-api/resources/driveitemversion
 */
export interface FileVersion {
	/** The version's label, e.g. "42.0", used to address it when restoring or fetching. */
	readonly id: string;
	/** Last-modified timestamp of this version, ISO-8601. */
	readonly lastModifiedDateTime: string;
	/** The version's eTag, when present. */
	readonly eTag?: string;
}

/**
 * Everything needed to issue an authenticated request against a specific ODSP file.
 */
export interface OdspVersionTestApiProps {
	/** The file's site url, drive id, and item id. */
	readonly urlParts: IOdspUrlParts;
	/** Returns the `Authorization` header value for a request; same signature the driver uses. */
	readonly getAuthHeader: InstrumentedStorageTokenFetcher;
	readonly logger?: ITelemetryBaseLogger;
}

async function authHeaderFor(
	props: OdspVersionTestApiProps,
	url: string,
	method: "GET" | "POST" | "PATCH",
	name: string,
): Promise<{ [index: string]: string }> {
	const authHeader = await props.getAuthHeader(
		{ refresh: false, request: { url, method } },
		name,
	);
	return getHeadersWithAuth(authHeader);
}

function itemRoot(urlParts: IOdspUrlParts): string {
	const { siteUrl, driveId, itemId } = urlParts;
	return `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}`;
}

/**
 * Enumerate the file's version history, newest-first.
 * @see https://learn.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitem_list_versions
 */
export async function listFileVersions(
	props: OdspVersionTestApiProps,
	signal?: AbortSignal,
): Promise<FileVersion[]> {
	const url = `${itemRoot(props.urlParts)}/versions`;
	const headers = await authHeaderFor(props, url, "GET", "ListFileVersions");
	const response = await fetch(url, { method: "GET", headers, signal });
	if (!response.ok) {
		throw new Error(`ListFileVersions failed: ${response.status} ${response.statusText}`);
	}
	const body = (await response.json()) as { value?: FileVersion[] };
	return body.value ?? [];
}

/**
 * Restore a previous version of the file, making it the current version.
 * @see https://learn.microsoft.com/en-us/onedrive/developer/rest-api/api/driveitemversion_restore
 * @returns `true` when the restore succeeded (HTTP 204).
 */
export async function restoreFileVersion(
	props: OdspVersionTestApiProps,
	versionId: string,
): Promise<boolean> {
	const url = `${itemRoot(props.urlParts)}/versions/${encodeURIComponent(
		versionId,
	)}/restoreVersion`;
	const headers = {
		...(await authHeaderFor(props, url, "POST", "RestoreFileVersion")),
		"Content-Type": "application/json",
	};
	const response = await fetch(url, { method: "POST", headers });
	return response.ok && response.status === 204;
}

/**
 * Force the service to snap a new file version by patching the item's `description` metadata.
 *
 * @param properties - the new `description` value, and an optional `eTag` to guard the update with an
 * `If-Match` header (so a concurrent change fails the request rather than silently overwriting).
 * @returns `true` when the metadata update succeeded.
 */
export async function triggerVersionViaMetadata(
	props: OdspVersionTestApiProps,
	properties: { description: string; eTag?: string },
): Promise<boolean> {
	const url = `${itemRoot(props.urlParts)}?$select=description`;
	const headers = {
		...(await authHeaderFor(props, url, "PATCH", "TriggerVersionViaMetadata")),
		"Content-Type": "application/json",
		...(properties.eTag === undefined ? {} : { "If-Match": properties.eTag }),
	};
	const response = await fetch(url, {
		method: "PATCH",
		headers,
		body: JSON.stringify({ description: properties.description }),
	});
	return response.ok;
}

/**
 * Build the {@link OdspVersionTestApiProps} needed to make raw ODSP version REST calls for the given
 * attached container: its resolved url parts plus a token-fetcher bound to the test driver's tenant.
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
