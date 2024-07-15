/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AccountInfo, AuthenticationResult, PublicClientApplication } from "@azure/msal-browser";
import { authHelper } from "../infra/spe/authHelper.js";
import { showErrorMessage } from "./error_ux.js";
import { OdspClient } from "@fluid-experimental/odsp-client";
import { GraphHelper } from "../infra/spe/graphHelper.js";
import { getClientProps } from "../infra/spe/speClientProps.js";
import { SampleOdspTokenProvider } from "../infra/spe/speTokenProvider.js";
import { loadApp } from "../app_load.js";

export async function speStart() {
	const msalInstance = await authHelper();

	// Handle the login redirect flows
	msalInstance
		.handleRedirectPromise()
		.then((tokenResponse: AuthenticationResult | null) => {
			// If the tokenResponse is not null, then the user is signed in
			// and the tokenResponse is the result of the redirect.
			if (tokenResponse !== null) {
				const account = msalInstance.getAllAccounts()[0];
				signedInSpeStart(msalInstance, account);
			} else {
				const currentAccounts = msalInstance.getAllAccounts();
				if (currentAccounts.length === 0) {
					// no accounts signed-in, attempt to sign a user in
					msalInstance.loginRedirect({
						scopes: ["FileStorageContainer.Selected", "Files.ReadWrite"],
					});
				} else if (currentAccounts.length > 1 || currentAccounts.length === 1) {
					// The user is singed in.
					// Treat more than one account signed in and a single account the same as
					// this is just a sample. But a real app would need to handle the multiple accounts case.
					// For now, just use the first account.
					const account = msalInstance.getAllAccounts()[0];
					signedInSpeStart(msalInstance, account);
				}
			}
		})
		.catch((error: Error) => {
			console.log("Error in handleRedirectPromise: " + error.message);
		});
}

async function signedInSpeStart(msalInstance: PublicClientApplication, account: AccountInfo) {
	// Set the active account
	msalInstance.setActiveAccount(account);

	// Create the GraphHelper instance
	// This is used to interact with the Graph API
	// Which allows the app to get the file storage container id, the Fluid container id,
	// and the site URL.
	const graphHelper = new GraphHelper(msalInstance, account);

	// Define a function to get the container info based on the URL hash
	// The URL hash is the shared item id and will be used to get the file storage container id
	// and the Fluid container id. If there is no hash, then the app will create a new Fluid container
	// in a later step.
	const getContainerInfo = async () => {
		const shareId = location.hash.substring(1);
		if (shareId.length > 0) {
			try {
				return await graphHelper.getSharedItem(shareId);
			} catch (error) {
				showErrorMessage("Error while fetching shared item: ", error as string);
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
	const getFileStorageContainerId = async () => {
		try {
			return await graphHelper.getFileStorageContainerId();
		} catch (error) {
			showErrorMessage("Error while fetching file storage container ID: ", error as string);
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
	if (fileStorageContainerId.length == 0) {
		return;
	}

	// Create the client properties required to initialize
	// the Fluid client instance. The Fluid client instance is used to
	// interact with the Fluid service.
	const clientProps = getClientProps(
		await graphHelper.getSiteUrl(),
		fileStorageContainerId,
		new SampleOdspTokenProvider(msalInstance),
	);

	// Create the Fluid client instance
	const client = new OdspClient(clientProps);

	// Load the app
	const container = await loadApp(client, containerId);

	// If the app is in a `createNew` state - no containerId, and the container is detached, we attach the container.
	// This uploads the container to the service and connects to the collaboration session.
	if (containerId.length == 0) {
		// Attach the container to the Fluid service which
		// uploads the container to the service and connects to the collaboration session.
		// This returns the Fluid container id.
		const itemId = await container.attach();

		// Create a sharing id to the container.
		// This allows the user to collaborate on the same Fluid container
		// with other users just by sharing the link.
		const shareId = await graphHelper.createSharingLink(
			clientProps.connection.driveId,
			itemId,
			"edit",
		);

		// Set the URL hash to the sharing id.
		history.replaceState(undefined, "", "#" + shareId);
	}
}
