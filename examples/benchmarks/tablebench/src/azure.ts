/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient } from "@fluidframework/azure-client";
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils";
import { SharedTree } from "@fluidframework/tree";

const localConnectionConfig = {
	type: "local",
	tokenProvider: new InsecureTokenProvider("VALUE_NOT_USED", { name: "test user" }),
	endpoint: "http://localhost:7070",
};

const client = new AzureClient({ connection: localConnectionConfig });

const containerSchema = {
	initialObjects: { tree: SharedTree },
};

export async function initFluid() {
	let container;

	if (!location.hash) {
		({ container } = await client.createContainer(containerSchema));
		location.hash = await container.attach();
	} else {
		({ container } = await client.getContainer(location.hash.substring(1), containerSchema));
	}

	return { tree: container.initialObjects.tree };
}
