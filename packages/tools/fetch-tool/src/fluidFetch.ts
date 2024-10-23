/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import util from "util";

import { IOdspDriveItem, isOdspHostname } from "@fluidframework/odsp-doclib-utils/internal";

import { paramSaveDir, paramURL, parseArguments } from "./fluidFetchArgs.js";
import { connectionInfo, fluidFetchInit } from "./fluidFetchInit.js";
import { fluidFetchMessages } from "./fluidFetchMessages.js";
import { getSharepointFiles, getSingleSharePointFile } from "./fluidFetchSharePoint.js";
import { fluidFetchSnapshot } from "./fluidFetchSnapshot.js";

async function fluidFetchOneFile(urlStr: string, name?: string) {
	const documentService = await fluidFetchInit(urlStr);
	const saveDir =
		paramSaveDir !== undefined
			? name !== undefined
				? `${paramSaveDir}/${name}`
				: paramSaveDir
			: undefined;
	if (saveDir !== undefined) {
		const mkdir = util.promisify(fs.mkdir);
		const writeFile = util.promisify(fs.writeFile);
		await mkdir(saveDir, { recursive: true });
		const info = {
			creationDate: new Date().toString(),
			connectionInfo,
			url: urlStr,
		};
		await writeFile(`${saveDir}/info.json`, JSON.stringify(info, undefined, 2));
	}

	await fluidFetchSnapshot(documentService, saveDir);
	await fluidFetchMessages(documentService, saveDir);
}

async function tryFluidFetchOneSharePointFile(server: string, driveItem: IOdspDriveItem) {
	const { path, name, driveId, itemId } = driveItem;
	console.log(`File: ${path}/${name}`);
	await fluidFetchOneFile(
		`https://${server}/_api/v2.1/drives/${driveId}/items/${itemId}`,
		name,
	);
}

function getSharePointSpecificDriveItem(
	url: URL,
): { driveId: string; itemId: string } | undefined {
	if (url.searchParams.has("driveId") && url.searchParams.has("itemId")) {
		return {
			driveId: url.searchParams.get("driveId") as string,
			itemId: url.searchParams.get("itemId") as string,
		};
	}
}

function getSharepointServerRelativePathFromURL(url: URL) {
	if (url.pathname.startsWith("/_api/v2.1/drives/")) {
		return undefined;
	}

	const hostnameParts = url.hostname.split(".");
	const suffix = hostnameParts[0].endsWith("-my")
		? "/_layouts/15/onedrive.aspx"
		: "/forms/allitems.aspx";

	let sitePath = url.pathname;
	if (url.searchParams.has("id")) {
		sitePath = url.searchParams.get("id") as string;
	} else if (url.searchParams.has("RootFolder")) {
		sitePath = url.searchParams.get("RootFolder") as string;
	} else if (url.pathname.toLowerCase().endsWith(suffix)) {
		sitePath = sitePath.substr(0, url.pathname.length - suffix.length);
	}

	return decodeURI(sitePath);
}

async function fluidFetchMain() {
	if (paramURL === undefined) {
		return;
	}

	const url = new URL(paramURL);
	const server = url.hostname;
	if (isOdspHostname(server)) {
		// See if the url already has the specific item
		const driveItem = getSharePointSpecificDriveItem(url);
		if (driveItem) {
			const file = await getSingleSharePointFile(server, driveItem.driveId, driveItem.itemId);
			await tryFluidFetchOneSharePointFile(server, file);
			return;
		}

		// See if the url given represent a sharepoint directory
		const serverRelativePath = getSharepointServerRelativePathFromURL(url);
		if (serverRelativePath !== undefined) {
			const files = await getSharepointFiles(server, serverRelativePath, false);
			for (const file of files) {
				if (file.name.endsWith(".b") || file.name.endsWith(".fluid")) {
					await tryFluidFetchOneSharePointFile(server, file);
				}
			}
			return;
		}
	}

	return fluidFetchOneFile(paramURL);
}

parseArguments();

// eslint-disable-next-line @typescript-eslint/no-floating-promises
fluidFetchMain()
	.catch((error: Error) => {
		if (error instanceof Error) {
			let extraMsg = "";
			for (const key of Object.keys(error)) {
				// error[key] might have circular structure
				try {
					if (key !== "message" && key !== "stack") {
						extraMsg += `\n${key}: ${JSON.stringify(error[key], undefined, 2)}`;
					}
				} catch (_) {}
			}
			console.error(`ERROR: ${error.stack}${extraMsg}`);
		} else if (typeof error === "object") {
			console.error(`ERROR: Unknown exception object\n${JSON.stringify(error, undefined, 2)}`);
		} else {
			console.error(`ERROR: ${error}`);
		}
	})
	.then(() => process.exit(0));
