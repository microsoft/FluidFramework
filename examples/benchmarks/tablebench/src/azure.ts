/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient, AzureLocalConnectionConfig } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { SharedTree } from "@fluidframework/tree/internal";

const userId = Math.random().toString(36).slice(2);

const localConnectionConfig: AzureLocalConnectionConfig = {
	type: "local",
	tokenProvider: new InsecureTokenProvider("VALUE_NOT_USED", {
		id: userId,
		name: `TestUser-${userId}`,
	}),
	endpoint: "http://localhost:7070",
};

const client = new AzureClient({ connection: localConnectionConfig });

const containerSchema = {
	initialObjects: { tree: SharedTree },
};

export async function initFluid() {
	let container;

	if (!location.hash) {
		({ container } = await client.createContainer(containerSchema, "2"));

		// TODO: Waiting for 'attach()' is a work around for https://dev.azure.com/fluidframework/internal/_workitems/edit/6805
		await container.attach().then((containerId) => (location.hash = containerId));
	} else {
		({ container } = await client.getContainer(
			location.hash.substring(1),
			containerSchema,
			"2",
		));
	}

	return { tree: container.initialObjects.tree };
}
