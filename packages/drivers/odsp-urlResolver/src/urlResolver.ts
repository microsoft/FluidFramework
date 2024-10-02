/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fromBase64ToUtf8 } from "@fluid-internal/client-utils";
import { IRequest } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	IContainerPackageInfo,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import {
	OdspDriverUrlResolver,
	createOdspUrl,
	getOdspUrlParts,
	isOdcUrl,
	isSpoUrl,
} from "@fluidframework/odsp-driver/internal";
import { IOdspUrlParts } from "@fluidframework/odsp-driver-definitions/internal";

const fluidOfficeAndOneNoteServers = new Set([
	"dev.fluidpreview.office.net",
	"fluidpreview.office.net",
	"www.onenote.com",
]);

/**
 * @internal
 */
export class OdspUrlResolver implements IUrlResolver {
	public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
		const reqUrl = new URL(request.url);
		if (isOdspUrl(reqUrl)) {
			const contents = await getOdspUrlParts(reqUrl);
			if (!contents) {
				return undefined;
			}
			const urlToBeResolved = createOdspUrl({ ...contents, dataStorePath: "" });
			const odspDriverUrlResolver: IUrlResolver = new OdspDriverUrlResolver();
			return odspDriverUrlResolver.resolve({
				url: urlToBeResolved,
				headers: request.headers,
			});
		}
		return undefined;
	}

	public async getAbsoluteUrl(
		resolvedUrl: IResolvedUrl,
		relativeUrl: string,
	): Promise<string> {
		throw new Error("Not implemented");
	}
}

/**
 * Returns true if the given string is a valid SPO/ODB or ODC URL.
 *
 * @internal
 */
const isOdspUrl = (url: URL): boolean => {
	return isSpoUrl(url) || isOdcUrl(url);
};

/**
 * This class helps to resolve Fluid URLs from Office and OneNote. Construct the resolver class and invoke its resolve function to retrieve the content parameters.
 * @internal
 */
export class FluidAppOdspUrlResolver implements IUrlResolver {
	public async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
		const reqUrl = new URL(request.url);
		const server = reqUrl.hostname.toLowerCase();
		let contents: IOdspUrlParts | undefined;
		if (fluidOfficeAndOneNoteServers.has(server)) {
			contents = await initializeFluidOfficeOrOneNote(reqUrl);
		} else if (server === "www.office.com") {
			const getRequiredParam = (name: string): string => {
				const value = reqUrl.searchParams.get(name);
				assert(!!value, 0x097 /* Missing param from office.com URL parameter */);
				return value;
			};
			contents = {
				driveId: getRequiredParam("drive"),
				itemId: getRequiredParam("item"),
				siteUrl: getRequiredParam("siteUrl"),
			};
		} else {
			return undefined;
		}
		if (!contents) {
			return undefined;
		}
		const urlToBeResolved = createOdspUrl({ ...contents, dataStorePath: "" });
		const odspDriverUrlResolver: IUrlResolver = new OdspDriverUrlResolver();
		return odspDriverUrlResolver.resolve({ url: urlToBeResolved });
	}

	// TODO: Issue-2109 Implement detach container api or put appropriate comment.
	public async getAbsoluteUrl(
		resolvedUrl: IResolvedUrl,
		relativeUrl: string,
		packageInfoSource?: IContainerPackageInfo,
	): Promise<string> {
		throw new Error("Not implemented");
	}
}

async function initializeFluidOfficeOrOneNote(
	urlSource: URL,
): Promise<IOdspUrlParts | undefined> {
	const pathname = urlSource.pathname;
	const siteDriveItemMatch = pathname.match(
		/\/(p|preview|meetingnotes|notes)\/([^/]*)\/([^/]*)\/([^/]*)/,
	);
	if (siteDriveItemMatch === null) {
		return undefined;
	}

	const site = decodeURIComponent(siteDriveItemMatch[2]);

	// Path value is base64 encoded so need to decode first
	const decodedSite = fromBase64ToUtf8(site);

	// Site value includes storage type
	const storageType = decodedSite.split(":")[0];
	const expectedStorageType = "spo"; // Only support spo for now
	if (storageType !== expectedStorageType) {
		throw new Error(
			`Unexpected storage type ${storageType}, expected: ${expectedStorageType}`,
		);
	}

	// Since we have the drive and item, only take the host ignore the rest
	const siteUrl = decodedSite.slice(Math.max(0, storageType.length + 1));
	const driveId = decodeURIComponent(siteDriveItemMatch[3]);
	const itemId = decodeURIComponent(siteDriveItemMatch[4]);
	return { siteUrl, driveId, itemId };
}
