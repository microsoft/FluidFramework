/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable spaced-comment */
// Necessary so this file can reference 'process' for 'process.env', which NextJS handles automatically.
/// <reference types="next" />
/// <reference types="next/image-types/global" />
/* eslint-enable spaced-comment */

"use client";

import { PublicClientApplication, InteractionType, AccountInfo } from "@azure/msal-browser";
import { Client } from "@microsoft/microsoft-graph-client";
import {
	AuthCodeMSALBrowserAuthenticationProvider,
	AuthCodeMSALBrowserAuthenticationProviderOptions,
	// eslint-disable-next-line import/no-internal-modules -- Not exported in the public API; docs use this pattern.
} from "@microsoft/microsoft-graph-client/authProviders/authCodeMsalBrowser";
import type { Site } from "@microsoft/microsoft-graph-types";

export interface FileStorageContainer {
	containerTypeId: string;
	createdDateTime: string;
	displayName: string;
	id: string;
}

// Helper class to interact with the Microsoft Graph API
// This allows us to interact with the Graph API to get the file storage container ID,
// the Fluid container ID, and the site URL. As well as create a sharing link and get the shared item.
export class GraphHelper {
	private readonly intializedPublicClientApplication: PublicClientApplication;
	private readonly accountInfo: AccountInfo;
	private readonly graphClient: Client;
	constructor(publicClientApplication: PublicClientApplication, accountInfo: AccountInfo) {
		this.intializedPublicClientApplication = publicClientApplication;
		this.accountInfo = accountInfo;

		// Create the auth provider including the required scopes for the app
		const options: AuthCodeMSALBrowserAuthenticationProviderOptions = {
			account: this.accountInfo, // the AccountInfo instance to acquire the token for.
			interactionType: InteractionType.Redirect, // msal-browser InteractionType
			scopes: ["FileStorageContainer.Selected", "Files.ReadWrite"], // scopes to be passed
		};

		const authProvider = new AuthCodeMSALBrowserAuthenticationProvider(
			this.intializedPublicClientApplication,
			options,
		);

		// Initialize the Graph client
		this.graphClient = Client.initWithMiddleware({
			authProvider,
		});
	}

	// Function to get the file storage container ID
	public async getFileStorageContainerId(): Promise<string> {
		// Get the container type id from the environment variables
		const containerTypeId = process.env.NEXT_PUBLIC_SPE_CONTAINER_TYPE_ID;

		if (containerTypeId === undefined) {
			throw new Error("NEXT_PUBLIC_SPE_CONTAINER_TYPE_ID is not defined");
		}

		// Fetch the file storage container ID using the Graph API
		try {
			const response = (await this.graphClient
				.api("/storage/fileStorage/containers")
				.filter(`containerTypeId eq ${containerTypeId}`)
				.version("beta")
				.get()) as { value: FileStorageContainer[] }; // We know the response will contain an array of FileStorageContainer

			const fileStorageContainers: FileStorageContainer[] = response.value;

			if (fileStorageContainers[0] === undefined) {
				throw new Error("Graph client found no fileStorageContainers");
			}

			return fileStorageContainers[0].id;
		} catch (error) {
			console.error("Error while fetching file storage container ID:", error);
			throw error; // re-throw the error if you want it to propagate
		}
	}

	// Function to get the site URL
	public async getSiteUrl(): Promise<string> {
		const response = (await this.graphClient
			.api("/sites")
			.version("beta")
			.filter("siteCollection/root ne null")
			.select("siteCollection,webUrl")
			.get()) as { value: Site[] }; // We know the response will contain an array of FileStorageContainer

		const sites: Site[] = response.value;

		if (sites[0] === undefined) {
			throw new Error("Graph client found no sites");
		}

		return sites[0].webUrl as string;
	}

	// Function to create a sharing link which will be used to get the shared item
	public async createSharingLink(
		driveId: string,
		id: string,
		permType: string,
	): Promise<string> {
		const permission = {
			type: permType,
			scope: "organization",
		};
		const response = (await this.graphClient
			.api(`/drives/${driveId}/items/${id}/createLink`)
			.post(permission)) as { link: string; shareId: string }; // We know the shape of the response

		console.log("createSharingLink response:", response.link);

		return response.shareId;
	}

	// Function to get the shared item using the sharing link
	public async getSharedItem(shareId: string): Promise<{ itemId: string; driveId: string }> {
		const response = (await this.graphClient
			.api(`/shares/${shareId}/driveItem`)
			.header("Prefer", "redeemSharingLink")
			.get()) as { id: string; parentReference: { driveId: string } }; // We know the shape of the response

		return {
			itemId: response.id,
			driveId: response.parentReference.driveId,
		};
	}
}
