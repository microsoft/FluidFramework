/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils/internal";
import {
	DriverHeader,
	IContainerPackageInfo,
	IResolvedUrl,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import { NonRetryableError } from "@fluidframework/driver-utils/internal";
import {
	IOdspResolvedUrl,
	OdspErrorTypes,
} from "@fluidframework/odsp-driver-definitions/internal";

import { ClpCompliantAppHeader } from "./contractsPublic.js";
import { createOdspUrl } from "./createOdspUrl.js";
import { getHashedDocumentId } from "./odspPublicUtils.js";
import { getApiRoot } from "./odspUrlHelper.js";
import { getOdspResolvedUrl } from "./odspUtils.js";
import { pkgVersion } from "./packageVersion.js";

function getUrlBase(
	siteUrl: string,
	driveId: string,
	itemId: string,
	fileVersion?: string,
): string {
	const version = fileVersion ? `versions/${fileVersion}/` : "";
	return `${getApiRoot(new URL(siteUrl))}/drives/${driveId}/items/${itemId}/${version}`;
}

function getSnapshotUrl(
	siteUrl: string,
	driveId: string,
	itemId: string,
	fileVersion?: string,
): string {
	const urlBase = getUrlBase(siteUrl, driveId, itemId, fileVersion);
	return `${urlBase}opStream/snapshots`;
}

function getAttachmentPOSTUrl(
	siteUrl: string,
	driveId: string,
	itemId: string,
	fileVersion?: string,
): string {
	const urlBase = getUrlBase(siteUrl, driveId, itemId, fileVersion);
	return `${urlBase}opStream/attachment`;
}

function getAttachmentGETUrl(
	siteUrl: string,
	driveId: string,
	itemId: string,
	fileVersion?: string,
): string {
	const urlBase = getUrlBase(siteUrl, driveId, itemId, fileVersion);
	return `${urlBase}opStream/attachments`;
}

function getDeltaStorageUrl(
	siteUrl: string,
	driveId: string,
	itemId: string,
	fileVersion?: string,
): string {
	const urlBase = getUrlBase(siteUrl, driveId, itemId, fileVersion);
	return `${urlBase}opStream`;
}

/**
 * Utility that enables us to handle paths provided with a beginning slash.
 * For example if a value of '/id1/id2' is provided, id1/id2 is returned.
 */
function removeBeginningSlash(str: string): string {
	if (str.startsWith("/")) {
		return str.slice(1);
	}

	return str;
}

// back-compat: GitHub #9653
const isFluidPackage = (pkg: Record<string, unknown>): boolean =>
	typeof pkg === "object" && typeof pkg?.name === "string" && typeof pkg?.fluid === "object";

/**
 * Resolver to resolve urls like the ones created by createOdspUrl which is driver inner
 * url format. Ex: `${siteUrl}?driveId=${driveId}&itemId=${itemId}&path=${path}`
 * @legacy
 * @alpha
 */
export class OdspDriverUrlResolver implements IUrlResolver {
	constructor() {}

	/**
	 * {@inheritDoc @fluidframework/driver-definitions#IUrlResolver.resolve}
	 */
	public async resolve(request: IRequest): Promise<IOdspResolvedUrl> {
		if (request.headers?.[DriverHeader.createNew]) {
			const [siteURL, queryString] = request.url.split("?");

			const searchParams = new URLSearchParams(queryString);
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
			const fileName: string = request.headers[DriverHeader.createNew].fileName;
			const driveID = searchParams.get("driveId");
			const filePath = searchParams.get("path");
			const packageName = searchParams.get("containerPackageName");
			// eslint-disable-next-line @typescript-eslint/prefer-optional-chain -- false positive
			if (!(fileName && siteURL && driveID && filePath !== null && filePath !== undefined)) {
				throw new NonRetryableError(
					"Proper new file params should be there",
					OdspErrorTypes.genericError,
					{ driverVersion: pkgVersion },
				);
			}
			return {
				endpoints: {
					snapshotStorageUrl: "",
					attachmentGETStorageUrl: "",
					attachmentPOSTStorageUrl: "",
					deltaStorageUrl: "",
				},
				tokens: {},
				type: "fluid",
				odspResolvedUrl: true,
				id: "odspCreateNew",
				url: `https://${siteURL}?${queryString}&version=null`,
				siteUrl: siteURL,
				hashedDocumentId: "",
				driveId: driveID,
				itemId: "",
				fileName,
				summarizer: false,
				codeHint: {
					containerPackageName: packageName ?? undefined,
				},
				fileVersion: undefined,
				shareLinkInfo: undefined,
				isClpCompliantApp: request.headers?.[ClpCompliantAppHeader.isClpCompliantApp],
			};
		}
		const { siteUrl, driveId, itemId, path, containerPackageName, fileVersion } =
			decodeOdspUrl(request.url);
		const hashedDocumentId = await getHashedDocumentId(driveId, itemId);
		assert(!hashedDocumentId.includes("/"), 0x0a8 /* "Docid should not contain slashes!!" */);

		const documentUrl = `https://placeholder/placeholder/${hashedDocumentId}/${removeBeginningSlash(
			path,
		)}`;

		const summarizer = !!request.headers?.[DriverHeader.summarizingClient];
		return {
			type: "fluid",
			odspResolvedUrl: true,
			endpoints: {
				snapshotStorageUrl: getSnapshotUrl(siteUrl, driveId, itemId, fileVersion),
				attachmentPOSTStorageUrl: getAttachmentPOSTUrl(siteUrl, driveId, itemId, fileVersion),
				attachmentGETStorageUrl: getAttachmentGETUrl(siteUrl, driveId, itemId, fileVersion),
				deltaStorageUrl: getDeltaStorageUrl(siteUrl, driveId, itemId, fileVersion),
			},
			id: hashedDocumentId,
			tokens: {},
			url: documentUrl,
			hashedDocumentId,
			siteUrl,
			driveId,
			itemId,
			dataStorePath: path,
			fileName: "",
			summarizer,
			codeHint: {
				containerPackageName,
			},
			fileVersion,
			isClpCompliantApp: request.headers?.[ClpCompliantAppHeader.isClpCompliantApp],
		};
	}

	/**
	 * Requests a driver + data store storage URL.
	 * @param resolvedUrl - The driver resolved URL.
	 * @param relativeUrl - The relative data store path URL.
	 * For requesting a driver URL, this value should always be '/'. If an empty string is passed, then dataStorePath
	 * will be extracted from the resolved url if present.
	 * @param packageInfoSource - optional, represents container package information to be included in url.
	 */
	public async getAbsoluteUrl(
		resolvedUrl: IResolvedUrl,
		relativeUrl: string,
		packageInfoSource?: IContainerPackageInfo,
	): Promise<string> {
		const odspResolvedUrl = getOdspResolvedUrl(resolvedUrl);

		let dataStorePath = relativeUrl;
		if (relativeUrl === "" && odspResolvedUrl.dataStorePath !== undefined) {
			// If the user has passed an empty dataStorePath, then extract it from the resolved url.
			dataStorePath = odspResolvedUrl.dataStorePath;
		}
		if (dataStorePath.startsWith("/")) {
			dataStorePath = dataStorePath.slice(1);
		}

		let containerPackageName: string | undefined;
		if (packageInfoSource && "name" in packageInfoSource) {
			containerPackageName = packageInfoSource.name;
			// packageInfoSource is cast to any as it is typed to IContainerPackageInfo instead of IFluidCodeDetails
			// TODO: use stronger type
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
		} else if (isFluidPackage((packageInfoSource as any)?.package)) {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			containerPackageName = (packageInfoSource as any)?.package.name;
		} else {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
			containerPackageName = (packageInfoSource as any)?.package;
		}
		containerPackageName =
			containerPackageName ?? odspResolvedUrl.codeHint?.containerPackageName;

		return createOdspUrl({
			...odspResolvedUrl,
			containerPackageName,
			dataStorePath,
		});
	}
}

export function decodeOdspUrl(url: string): {
	siteUrl: string;
	driveId: string;
	itemId: string;
	path: string;
	containerPackageName?: string;
	fileVersion?: string;
} {
	const [siteUrl, queryString] = url.split("?");

	const searchParams = new URLSearchParams(queryString);

	const driveId = searchParams.get("driveId");
	const itemId = searchParams.get("itemId");
	const path = searchParams.get("path");
	const containerPackageName = searchParams.get("containerPackageName");
	const fileVersion = searchParams.get("fileVersion");

	if (driveId === null) {
		throw new Error("ODSP URL did not contain a drive id");
	}

	if (itemId === null) {
		throw new Error("ODSP Url did not contain an item id");
	}

	if (path === null) {
		throw new Error("ODSP Url did not contain a path");
	}

	return {
		siteUrl,
		driveId: decodeURIComponent(driveId),
		itemId: decodeURIComponent(itemId),
		path: decodeURIComponent(path),
		containerPackageName: containerPackageName
			? decodeURIComponent(containerPackageName)
			: undefined,
		fileVersion: fileVersion ? decodeURIComponent(fileVersion) : undefined,
	};
}
