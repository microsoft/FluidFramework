/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient, type AzureLocalConnectionConfig } from "@fluidframework/azure-client";
import { toPropTreeNode } from "@fluidframework/react/alpha";
// eslint-disable-next-line import-x/no-internal-modules
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { TreeViewConfiguration, type TreeView } from "@fluidframework/tree";
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextAsTree } from "@fluidframework/tree/internal";
import { SharedTree } from "@fluidframework/tree/legacy";
import * as React from "react";
// eslint-disable-next-line import-x/no-internal-modules
import { createRoot } from "react-dom/client";

import { FormattedMainView } from "./quillFormattedView.js";

/**
 * Get the Tinylicious endpoint URL, handling Codespaces port forwarding. Tinylicious only works for localhost,
 * so in Codespaces we need to use the forwarded URL.
 */
function getTinyliciousEndpoint(): string {
	const hostname = window.location.hostname;
	const tinyliciousPort = 7070;

	// Detect GitHub Codespaces: hostname like "ideal-giggle-xxx-8080.app.github.dev"
	if (hostname.endsWith(".app.github.dev")) {
		const match = /^(.+)-\d+\.app\.github\.dev$/.exec(hostname);
		if (match) {
			const codespaceName = match[1];
			return `https://${codespaceName}-${tinyliciousPort}.app.github.dev`;
		}
	}

	return `http://localhost:${tinyliciousPort}`;
}

const containerSchema = {
	initialObjects: { tree: SharedTree },
};

const treeConfig = new TreeViewConfiguration({ schema: FormattedTextAsTree.Tree });

function getConnectionConfig(userId: string): AzureLocalConnectionConfig {
	return {
		type: "local",
		tokenProvider: new InsecureTokenProvider("VALUE_NOT_USED", {
			id: userId,
			name: `User-${userId}`,
		}),
		endpoint: getTinyliciousEndpoint(),
	};
}

interface DualUserViews {
	view1: TreeView<typeof FormattedTextAsTree.Tree>;
	view2: TreeView<typeof FormattedTextAsTree.Tree>;
	containerId: string;
}

async function initFluid(): Promise<DualUserViews> {
	const endpoint = getTinyliciousEndpoint();
	console.log(`Connecting to Tinylicious at: ${endpoint}`);

	const user1Id = `user1-${Math.random().toString(36).slice(2, 6)}`;
	const user2Id = `user2-${Math.random().toString(36).slice(2, 6)}`;

	const client1 = new AzureClient({ connection: getConnectionConfig(user1Id) });
	const client2 = new AzureClient({ connection: getConnectionConfig(user2Id) });

	let view1: TreeView<typeof FormattedTextAsTree.Tree>;
	let view2: TreeView<typeof FormattedTextAsTree.Tree>;
	let containerId: string;

	if (location.hash) {
		// Load existing document for both users
		containerId = location.hash.slice(1);
		console.log(`Loading document for both users: ${containerId}`);

		const { container: container1 } = await client1.getContainer(
			containerId,
			containerSchema,
			"2",
		);
		view1 = container1.initialObjects.tree.viewWith(treeConfig);

		const { container: container2 } = await client2.getContainer(
			containerId,
			containerSchema,
			"2",
		);
		view2 = container2.initialObjects.tree.viewWith(treeConfig);
	} else {
		// User 1 creates the document
		const { container: container1 } = await client1.createContainer(containerSchema, "2");
		view1 = container1.initialObjects.tree.viewWith(treeConfig);
		view1.initialize(FormattedTextAsTree.Tree.fromString(""));
		containerId = await container1.attach();
		// eslint-disable-next-line require-atomic-updates
		location.hash = containerId;
		console.log(`User 1 created document: ${containerId}`);

		// User 2 connects to the same document
		const { container: container2 } = await client2.getContainer(
			containerId,
			containerSchema,
			"2",
		);
		view2 = container2.initialObjects.tree.viewWith(treeConfig);
		console.log(`User 2 connected to document: ${containerId}`);
	}

	return { view1, view2, containerId };
}

const App: React.FC<{ views: DualUserViews }> = ({ views }) => {
	const { view1, view2 } = views;
	return (
		<div style={{ padding: "20px", height: "100vh", boxSizing: "border-box" }}>
			<div
				style={{
					display: "flex",
					gap: "20px",
					height: "calc(100% - 80px)",
				}}
			>
				<div
					style={{
						flex: 1,
						border: "2px solid #4a90d9",
						borderRadius: "8px",
						padding: "10px",
						display: "flex",
						flexDirection: "column",
					}}
				>
					<div
						style={{
							marginBottom: "10px",
							fontWeight: "bold",
							color: "#4a90d9",
						}}
					>
						User 1
					</div>
					<div style={{ flex: 1 }}>
						<FormattedMainView root={toPropTreeNode(view1.root)} />
					</div>
				</div>
				<div
					style={{
						flex: 1,
						border: "2px solid #28a745",
						borderRadius: "8px",
						padding: "10px",
						display: "flex",
						flexDirection: "column",
					}}
				>
					<div
						style={{
							marginBottom: "10px",
							fontWeight: "bold",
							color: "#28a745",
						}}
					>
						User 2
					</div>
					<div style={{ flex: 1 }}>
						<FormattedMainView root={toPropTreeNode(view2.root)} />
					</div>
				</div>
			</div>
		</div>
	);
};

async function start(): Promise<void> {
	const rootElement = document.querySelector("#content");
	if (!rootElement) return;

	try {
		const views = await initFluid();
		const root = createRoot(rootElement);
		root.render(<App views={views} />);
	} catch (error) {
		console.error("Failed to start:", error);
		rootElement.innerHTML = `<div style="color: #721c24; background: #f8d7da; padding: 20px; border-radius: 4px; border: 1px solid #f5c6cb;">
			<h2>Failed to connect to Tinylicious</h2>
			<p><strong>Error:</strong> ${error instanceof Error ? error.message : error}</p>
			<p><strong>Tinylicious endpoint:</strong> ${getTinyliciousEndpoint()}</p>
			<h3>Troubleshooting:</h3>
			<ol>
				<li>Make sure Tinylicious is running: <code>pnpm tinylicious</code></li>
				<li>In Codespaces: Forward port 7070 and set visibility to <strong>Public</strong></li>
			</ol>
		</div>`;
	}
}

// eslint-disable-next-line unicorn/prefer-top-level-await
start().catch(console.error);
