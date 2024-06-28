/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { InteractiveBrowserCredential, useIdentityPlugin } from "@azure/identity";
import { cachePersistencePlugin } from "@azure/identity-cache-persistence";
import { DriverErrorTypes } from "@fluidframework/driver-definitions/internal";
import {
	IPublicClientConfig,
	IOdspAuthRequestInfo,
	IOdspDriveItem,
	getChildrenByDriveItem,
	getDriveItemByServerRelativePath,
	getDriveItemFromDriveAndItem,
	// getOdspRefreshTokenFn,
	getOdspScope,
	getAadTenant,
} from "@fluidframework/odsp-doclib-utils/internal";
import {
	// OdspTokenConfig,
	// OdspTokenManager,
	getMicrosoftConfiguration,
	loadRC,
	saveRC,
} from "@fluidframework/tool-utils/internal";

useIdentityPlugin(cachePersistencePlugin);

export async function resolveWrapper<T>(
	callback: (authRequestInfo: IOdspAuthRequestInfo) => Promise<T>,
	server: string,
	clientConfig: IPublicClientConfig,
	forceTokenReauth = false,
	forToken = false,
): Promise<T> {
	try {
		const rc = await loadRC();
		console.log((rc as any).mruAuthRecord);
		const credential = new InteractiveBrowserCredential({
			clientId: process.env.login__microsoft__clientId,
			tenantId: getAadTenant(server),
			disableAutomaticAuthentication: true,
			tokenCachePersistenceOptions: {
				enabled: true,
				// TODO: check if we're getting caching in e2e test / stress flows.
				// Also, now that we're providing a name here we can probably drop the complexity
				// around authenticationRecord, as generally people will only use a single account.
				// Should also consider making --loginHint specifiable via CLI...
				name: "fetch-tool",
			},
			authenticationRecord: (rc as any).mruAuthRecord,
		});

		const scope = getOdspScope(server);
		const authRecord = await credential.authenticate(scope);

		await saveRC({ ...rc, mruAuthRecord: authRecord });

		// const odspTokenManager = new OdspTokenManager();
		// const tokenConfig: OdspTokenConfig = {
		// 	type: "browserLogin",
		// 	navigator: fluidFetchWebNavigator,
		// };

		const { token } = await credential.getToken(scope);

		// const tokens = await odspTokenManager.getOdspTokens(
		// 	server,
		// 	clientConfig,
		// 	tokenConfig,
		// 	undefined /* forceRefresh */,
		// 	forceTokenReauth,
		// );

		return await callback({
			accessToken: token,
			refreshTokenFn: async () => {
				await credential.authenticate(scope);
				const { token } = await credential.getToken(scope);
				return token;
			},
		});
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
