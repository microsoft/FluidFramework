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

useIdentityPlugin(cachePersistencePlugin);

export const fetchToolClientConfig: IPublicClientConfig = {
	get clientId(): string {
		const clientId = process.env.fetch__tool__clientId;
		if (clientId === undefined) {
			throw new Error(
				"Client ID environment variable not set: fetch__tool__clientId. Use the getkeys tool to populate it.",
			);
		}
		return clientId;
	},
};

export async function resolveWrapper<T>(
	callback: (authRequestInfo: IOdspAuthRequestInfo) => Promise<T>,
	server: string,
	clientConfig: IPublicClientConfig,
	forceTokenReauth = false,
	forToken = false,
): Promise<T> {
	try {
		// const rc = await loadRC();

		const credential = new InteractiveBrowserCredential({
			clientId: process.env.login__microsoft__clientId,
			tenantId: getAadTenant(server),
			disableAutomaticAuthentication: true,
			// TODO: Allow specifying this.
			// loginHint:
			tokenCachePersistenceOptions: {
				enabled: true,
				// TODO: check if we're getting caching in e2e test / stress flows.
				// Also, now that we're providing a name here we can probably drop the complexity
				// around authenticationRecord, as generally people will only use a single account.
				// Should also consider making --loginHint specifiable via CLI...
				name: "fetch-tool",
			},
		});

		const scope = getOdspScope(server);
		const authRecord = await credential.authenticate(scope);
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
	const fileInfo = await resolveDriveItemByServerRelativePath(
		server,
		serverRelativePath,
		fetchToolClientConfig,
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
		const children = await resolveChildrenByDriveItem(server, folder, fetchToolClientConfig);
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
	return resolveWrapper<IOdspDriveItem>(
		// eslint-disable-next-line @typescript-eslint/promise-function-async
		(authRequestInfo) => getDriveItemFromDriveAndItem(server, drive, item, authRequestInfo),
		server,
		fetchToolClientConfig,
	);
}
