/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import child_process from "child_process";

import { DriverErrorTypes } from "@fluidframework/driver-definitions/internal";
import {
	IPublicClientConfig,
	IOdspAuthRequestInfo,
	IOdspDriveItem,
	getChildrenByDriveItem,
	getDriveItemByServerRelativePath,
	getDriveItemFromDriveAndItem,
	getOdspRefreshTokenFn,
} from "@fluidframework/odsp-doclib-utils/internal";
import {
	IOdspTokenManagerCacheKey,
	OdspTokenConfig,
	OdspTokenManager,
	getMicrosoftConfiguration,
	odspTokensCache,
} from "@fluidframework/tool-utils/internal";

import { getForceTokenReauth } from "./fluidFetchArgs.js";

export async function resolveWrapper<T>(
	callback: (authRequestInfo: IOdspAuthRequestInfo) => Promise<T>,
	server: string,
	clientConfig: IPublicClientConfig,
	forceTokenReauth = false,
	forToken = false,
): Promise<T> {
	try {
		const odspTokenManager = new OdspTokenManager(odspTokensCache);
		const tokenConfig: OdspTokenConfig = {
			type: "browserLogin",
			navigator: fluidFetchWebNavigator,
		};
		const tokens = await odspTokenManager.getOdspTokens(
			server,
			clientConfig,
			tokenConfig,
			undefined /* forceRefresh */,
			forceTokenReauth || getForceTokenReauth(),
		);

		const result = await callback({
			accessToken: tokens.accessToken,
			refreshTokenFn: getOdspRefreshTokenFn(server, clientConfig, tokens),
		});
		// If this is used for getting a token, then refresh the cache with new token.
		if (forToken) {
			const key: IOdspTokenManagerCacheKey = { isPush: false, userOrServer: server };
			await odspTokenManager.updateTokensCache(key, {
				accessToken: result as any as string,
				refreshToken: tokens.refreshToken,
			});
			return result;
		}
		return result;
	} catch (e: any) {
		if (e.errorType === DriverErrorTypes.authorizationError && !forceTokenReauth) {
			// Re-auth
			return resolveWrapper<T>(callback, server, clientConfig, true, forToken);
		}
		throw e;
	}
}

async function resolveDriveItemByServerRelativePath(
	server: string,
	serverRelativePath: string,
	clientConfig: IPublicClientConfig,
) {
	return resolveWrapper<IOdspDriveItem>(
		// eslint-disable-next-line @typescript-eslint/promise-function-async
		(authRequestInfo) =>
			getDriveItemByServerRelativePath(server, serverRelativePath, authRequestInfo, false),
		server,
		clientConfig,
	);
}

async function resolveChildrenByDriveItem(
	server: string,
	folderDriveItem: IOdspDriveItem,
	clientConfig: IPublicClientConfig,
) {
	return resolveWrapper<IOdspDriveItem[]>(
		// eslint-disable-next-line @typescript-eslint/promise-function-async
		(authRequestInfo) => getChildrenByDriveItem(folderDriveItem, server, authRequestInfo),
		server,
		clientConfig,
	);
}

export async function getSharepointFiles(
	server: string,
	serverRelativePath: string,
	recurse: boolean,
) {
	const clientConfig = getMicrosoftConfiguration();

	const fileInfo = await resolveDriveItemByServerRelativePath(
		server,
		serverRelativePath,
		clientConfig,
	);
	console.log(fileInfo);
	const pendingFolder: { path: string; folder: IOdspDriveItem }[] = [];
	const files: IOdspDriveItem[] = [];
	if (fileInfo.isFolder) {
		pendingFolder.push({ path: serverRelativePath, folder: fileInfo });
	} else {
		files.push(fileInfo);
	}

	// eslint-disable-next-line no-constant-condition
	while (true) {
		const folderInfo = pendingFolder.shift();
		if (!folderInfo) {
			break;
		}
		const { path, folder } = folderInfo;
		const children = await resolveChildrenByDriveItem(server, folder, clientConfig);
		for (const child of children) {
			const childPath = `${path}/${child.name}`;
			if (child.isFolder) {
				if (recurse) {
					pendingFolder.push({ path: childPath, folder: child });
				}
			} else {
				files.push(child);
			}
		}
	}
	return files;
}

export async function getSingleSharePointFile(server: string, drive: string, item: string) {
	const clientConfig = getMicrosoftConfiguration();

	return resolveWrapper<IOdspDriveItem>(
		// eslint-disable-next-line @typescript-eslint/promise-function-async
		(authRequestInfo) => getDriveItemFromDriveAndItem(server, drive, item, authRequestInfo),
		server,
		clientConfig,
	);
}

const fluidFetchWebNavigator = (url: string) => {
	let message = "Please open browser and navigate to this URL:";
	if (process.platform === "win32") {
		child_process.exec(`start "fluid-fetch" /B "${url}"`);
		message =
			"Opening browser to get authorization code.  If that doesn't open, please go to this URL manually";
	}
	console.log(`${message}\n  ${url}`);
};
