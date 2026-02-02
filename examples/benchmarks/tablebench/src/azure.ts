/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AzureLocalConnectionConfig } from "@fluidframework/azure-client";
import { AzureClient } from "@fluidframework/azure-client";
// eslint-disable-next-line import-x/no-internal-modules -- #26985: `test-runtime-utils` internal `InsecureTokenProvider` used in examples
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { TreeViewConfiguration, type TreeView } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/legacy";

import { generateTable } from "./data.js";
import { Table } from "./tree/index.js";

/**
 * Creates an insecure Tinylicious URL resolver for testing purposes with localhost port 7070.
 * Detects the appropriate Tinylicious endpoint based on the environment.
 * In GitHub Codespaces, returns the forwarded port URL. Otherwise returns localhost.
 * If using codespaces, set tinylicious (port 7070) visibility to "public" for this to work.
 */
function getTinyliciousEndpoint(port = 7070): string {
	if (typeof window !== "undefined") {
		// Detect GitHub Codespaces and use the forwarded port URL
		// <codespace-name>-<fowarded-port>.<domain>
		// e.g. my-codespace-7070.githubpreview.dev
		// Capture Group 1: <codespace-name>
		// Capture Group 2: <domain>
		// reconstruct a hostname that fowards tinlicious's port via HTTPS.
		const match = /^(.+)-\d+\.(.+)$/.exec(window.location.hostname);
		if (match) {
			return `https://${match[1]}-${port}.${match[2]}`;
		}
	}
	return `http://localhost:${port}`;
}

const userId = Math.random().toString(36).slice(2);

const localConnectionConfig: AzureLocalConnectionConfig = {
	type: "local",
	tokenProvider: new InsecureTokenProvider("VALUE_NOT_USED", {
		id: userId,
		name: `TestUser-${userId}`,
	}),
	endpoint: getTinyliciousEndpoint(),
};

const client = new AzureClient({ connection: localConnectionConfig });

const containerSchema = {
	initialObjects: { tree: SharedTree },
};

const config = new TreeViewConfiguration({ schema: Table });

export async function initFluid(): Promise<{ view: TreeView<typeof Table> }> {
	let container;
	let view: TreeView<typeof Table>;

	if (location.hash) {
		({ container } = await client.getContainer(location.hash.slice(1), containerSchema, "2"));
		const { tree } = container.initialObjects;
		view = tree.viewWith(config);
	} else {
		({ container } = await client.createContainer(containerSchema, "2"));
		const { tree } = container.initialObjects;
		view = tree.viewWith(config);
		view.initialize(generateTable(10000));
		// TODO: Waiting for 'attach()' is a work around for https://dev.azure.com/fluidframework/internal/_workitems/edit/6805
		await container.attach().then((containerId: string) => (location.hash = containerId));
	}

	return { view };
}
