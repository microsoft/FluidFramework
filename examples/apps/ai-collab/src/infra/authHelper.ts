/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

"use client";

import {
	AccountInfo,
	PublicClientApplication,
	type AuthenticationResult,
} from "@azure/msal-browser";
import { OdspClient } from "@fluidframework/odsp-client/beta";

import { GraphHelper } from "./graphHelper";
import { SampleOdspTokenProvider } from "./tokenProvider";

// Helper function to authenticate the user
export async function authHelper(): Promise<PublicClientApplication> {
	// Get the client id (app id) from the environment variables
	const clientId = process.env.NEXT_PUBLIC_SPE_CLIENT_ID;

	if (clientId === undefined) {
		throw new Error("NEXT_PUBLIC_SPE_CLIENT_ID is not defined");
	}

	const tenantId = process.env.NEXT_PUBLIC_SPE_ENTRA_TENANT_ID;
	if (tenantId === undefined) {
		throw new Error("NEXT_PUBLIC_SPE_ENTRA_TENANT_ID is not defined");
	}

	// Create the MSAL instance
	const msalConfig = {
		auth: {
			clientId,
			authority: `https://login.microsoftonline.com/${tenantId}/`,
			tenantId,
		},
	};

	// Initialize the MSAL instance
	const msalInstance = new PublicClientApplication(msalConfig);
	await msalInstance.initialize();

	return msalInstance;
}

export let graphHelper: GraphHelper;

export async function start(): Promise<{
	client: OdspClient;
	containerId: string;
	getShareLink: (fluidContainerId: string) => Promise<string>;
}> {
	const msalInstance = await authHelper();

	// Handle the login redirect flows
	const tokenResponse: AuthenticationResult | null =
		await msalInstance.handleRedirectPromise();

	// If the tokenResponse is not null, then the user is signed in
	// and the tokenResponse is the result of the redirect.
	if (tokenResponse === null) {
		const currentAccounts = msalInstance.getAllAccounts();
		if (currentAccounts.length === 0) {
			// no accounts signed-in, attempt to sign a user in
			await msalInstance.loginRedirect({
				scopes: ["FileStorageContainer.Selected", "Files.ReadWrite"],
			});

			throw new Error(
				"This should never happen! The previous line should have caused a browser redirect.",
			);
		} else {
			// The user is signed in.
			// Treat more than one account signed in and a single account the same as this is just a sample.
			// A real app would need to handle the multiple accounts case.
			// For now, just use the first account.
			const account = msalInstance.getAllAccounts()[0];
			if (account === undefined) {
				throw new Error("No account found after logging in");
			}
			return signedInStart(msalInstance, account);
		}
	} else {
		return signedInStart(msalInstance, tokenResponse.account);
	}
}

export async function getProfilePhoto(): Promise<string> {
	const msalInstance = await authHelper();

	// Handle the login redirect flows
	const tokenResponse: AuthenticationResult | null =
		await msalInstance.handleRedirectPromise();

	// If the tokenResponse is not null, then the user is signed in
	// and the tokenResponse is the result of the redirect.
	if (tokenResponse === null) {
		const currentAccounts = msalInstance.getAllAccounts();
		if (currentAccounts.length === 0) {
			// no accounts signed-in, attempt to sign a user in
			await msalInstance.loginRedirect({
				scopes: ["FileStorageContainer.Selected", "Files.ReadWrite"],
			});

			throw new Error(
				"This should never happen! The previous line should have caused a browser redirect.",
			);
		} else {
			// The user is signed in.
			// Treat more than one account signed in and a single account the same as this is just a sample.
			// A real app would need to handle the multiple accounts case.
			// For now, just use the first account.
			const account = msalInstance.getAllAccounts()[0];
			if (account === undefined) {
				throw new Error("No account found after logging in");
			}
			graphHelper = new GraphHelper(msalInstance, account);
		}
	} else {
		graphHelper = new GraphHelper(msalInstance, tokenResponse.account);
	}
	const response = await graphHelper.getProfilePhoto();
	return response;
}

async function signedInStart(
	msalInstance: PublicClientApplication,
	account: AccountInfo,
): Promise<{
	client: OdspClient;
	containerId: string;
	getShareLink: (fluidContainerId: string) => Promise<string>;
}> {
	// Set the active account
	msalInstance.setActiveAccount(account);
	console.log(`Set active account: ${account.tenantId} - ${account.username}`);

	// Create the GraphHelper instance
	// This is used to interact with the Graph API
	// Which allows the app to get the file storage container id, the Fluid container id,
	// and the site URL.
	graphHelper = new GraphHelper(msalInstance, account);

	// Define a function to get the container info based on the URL hash
	// The URL hash is the shared item id and will be used to get the file storage container id
	// and the Fluid container id. If there is no hash, then the app will create a new Fluid container
	// in a later step.
	const getContainerInfo = async (): Promise<
		{ driveId: string; itemId: string } | undefined
	> => {
		const shareId = location.hash.slice(1);
		if (shareId.length > 0) {
			try {
				return await graphHelper.getSharedItem(shareId);
			} catch (error) {
				console.error("Error while fetching shared item:", error as string);
				return undefined;
			}
		} else {
			return undefined;
		}
	};

	// Get the file storage container id (driveId) and the Fluid container id (itemId).
	const containerInfo = await getContainerInfo();

	// Define a function to get the file storage container id using the Graph API
	// If the user doesn't have access to the file storage container, then the app will fail here.
	const getFileStorageContainerId = async (): Promise<string> => {
		try {
			return await graphHelper.getFileStorageContainerId();
		} catch (error) {
			console.error("Error while fetching file storage container ID:", error as string);
			return "";
		}
	};

	let fileStorageContainerId = "";
	let containerId = "";

	// If containerInfo is undefined, then get the file storage container id using the function
	// defined above.
	// If the containerInfo is not undefined, then use the file storage container id and Fluid container id
	// from containerInfo.
	if (containerInfo === undefined) {
		fileStorageContainerId = await getFileStorageContainerId();
	} else {
		fileStorageContainerId = containerInfo.driveId;
		containerId = containerInfo.itemId;
	}

	// If the file storage container id is empty, then the app will fail here.
	if (fileStorageContainerId.length === 0) {
		throw new Error("No file storage container id found.");
	}

	// Create the client properties required to initialize
	// the Fluid client instance. The Fluid client instance is used to
	// interact with the Fluid service.
	const clientProps = {
		connection: {
			siteUrl: await graphHelper.getSiteUrl(),
			tokenProvider: new SampleOdspTokenProvider(msalInstance),
			driveId: fileStorageContainerId,
			filePath: "",
		},
	};

	// Create the Fluid client instance
	const client = new OdspClient(clientProps);

	async function getShareLink(fluidContainerId: string): Promise<string> {
		return graphHelper.createSharingLink(
			clientProps.connection.driveId,
			fluidContainerId,
			"edit",
		);
	}

	return { client, containerId, getShareLink };
}
