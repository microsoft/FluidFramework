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
	getAadTenant,
	getOdspScope,
} from "@fluidframework/odsp-doclib-utils/internal";

import { loginHint } from "./fluidFetchArgs.js";

// Note: the following page may be helpful for debugging auth issues:
// https://github.com/Azure/azure-sdk-for-js/blob/main/sdk/identity/identity/TROUBLESHOOTING.md
// See e.g. the section on setting 'AZURE_LOG_LEVEL'.
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
): Promise<T> {
	try {
		const credential = new InteractiveBrowserCredential({
			clientId: fetchToolClientConfig.clientId,
			tenantId: getAadTenant(server),
			// NOTE: fetch-tool flows using multiple sets of user credentials haven't been well-tested.
			// Some of the @azure/identity docs suggest we may need to manage authentication records and choose
			// which one to use explicitly here if we have such scenarios.
			// If we start doing this, it may be worth considering using disableAutomaticAuthentication here so we
			// have better control over when interactive auth may be triggered.
			// For now, fetch-tool doesn't work against personal accounts anyway so the only flow that might necessitate this
			// would be grabbing documents using several identities (e.g. test accounts we use for stress testing).
			// In that case, a simple workaround is to delete the cache that @azure/identity uses before running the tool.
			// See docs on `tokenCachePersistenceOptions.name` for information on where this cache is stored.
			loginHint,
			tokenCachePersistenceOptions: {
				enabled: true,
				name: "fetch-tool",
			},
		});

		const scope = getOdspScope(server);

		const { token } = await credential.getToken(scope);

		return await callback({
			accessToken: token,
			refreshTokenFn: async () => {
				await credential.authenticate(scope);
				const result = await credential.getToken(scope);
				return result.token;
			},
		});
	} catch (e: any) {
		if (e.errorType === DriverErrorTypes.authorizationError && !forceTokenReauth) {
			// Re-auth
			return resolveWrapper<T>(callback, server, clientConfig, true);
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
