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
import { FormattedTextAsTree, TextAsTree } from "@fluidframework/tree/internal";
import { SharedTree } from "@fluidframework/tree/legacy";
import * as React from "react";
// eslint-disable-next-line import-x/no-internal-modules
import { createRoot } from "react-dom/client";

import { FormattedMainView } from "./formatted/index.js";
import { PlainTextMainView, QuillMainView as PlainQuillView } from "./plain/index.js";

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
	initialObjects: {
		plainTextareaTree: SharedTree,
		plainQuillTree: SharedTree,
		formattedTree: SharedTree,
	},
};

const plainTreeConfig = new TreeViewConfiguration({ schema: TextAsTree.Tree });
const formattedTreeConfig = new TreeViewConfiguration({ schema: FormattedTextAsTree.Tree });

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

type ViewType = "plainTextarea" | "plainQuill" | "formatted";

interface DualUserViews {
	user1: {
		plainTextarea: TreeView<typeof TextAsTree.Tree>;
		plainQuill: TreeView<typeof TextAsTree.Tree>;
		formatted: TreeView<typeof FormattedTextAsTree.Tree>;
	};
	user2: {
		plainTextarea: TreeView<typeof TextAsTree.Tree>;
		plainQuill: TreeView<typeof TextAsTree.Tree>;
		formatted: TreeView<typeof FormattedTextAsTree.Tree>;
	};
	containerId: string;
}

async function initFluid(): Promise<DualUserViews> {
	const endpoint = getTinyliciousEndpoint();
	console.log(`Connecting to Tinylicious at: ${endpoint}`);

	const user1Id = `user1-${Math.random().toString(36).slice(2, 6)}`;
	const user2Id = `user2-${Math.random().toString(36).slice(2, 6)}`;

	const client1 = new AzureClient({ connection: getConnectionConfig(user1Id) });
	const client2 = new AzureClient({ connection: getConnectionConfig(user2Id) });

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
		const { container: container2 } = await client2.getContainer(
			containerId,
			containerSchema,
			"2",
		);

		return {
			user1: {
				plainTextarea: container1.initialObjects.plainTextareaTree.viewWith(plainTreeConfig),
				plainQuill: container1.initialObjects.plainQuillTree.viewWith(plainTreeConfig),
				formatted: container1.initialObjects.formattedTree.viewWith(formattedTreeConfig),
			},
			user2: {
				plainTextarea: container2.initialObjects.plainTextareaTree.viewWith(plainTreeConfig),
				plainQuill: container2.initialObjects.plainQuillTree.viewWith(plainTreeConfig),
				formatted: container2.initialObjects.formattedTree.viewWith(formattedTreeConfig),
			},
			containerId,
		};
	} else {
		// User 1 creates the document
		const { container: container1 } = await client1.createContainer(containerSchema, "2");

		const user1PlainTextarea =
			container1.initialObjects.plainTextareaTree.viewWith(plainTreeConfig);
		const user1PlainQuill = container1.initialObjects.plainQuillTree.viewWith(plainTreeConfig);
		const user1Formatted =
			container1.initialObjects.formattedTree.viewWith(formattedTreeConfig);

		// Initialize all trees
		user1PlainTextarea.initialize(TextAsTree.Tree.fromString(""));
		user1PlainQuill.initialize(TextAsTree.Tree.fromString(""));
		user1Formatted.initialize(FormattedTextAsTree.Tree.fromString(""));

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
		console.log(`User 2 connected to document: ${containerId}`);

		return {
			user1: {
				plainTextarea: user1PlainTextarea,
				plainQuill: user1PlainQuill,
				formatted: user1Formatted,
			},
			user2: {
				plainTextarea: container2.initialObjects.plainTextareaTree.viewWith(plainTreeConfig),
				plainQuill: container2.initialObjects.plainQuillTree.viewWith(plainTreeConfig),
				formatted: container2.initialObjects.formattedTree.viewWith(formattedTreeConfig),
			},
			containerId,
		};
	}
}

const viewLabels: Record<ViewType, string> = {
	plainTextarea: "Plain Textarea",
	plainQuill: "Plain Quill",
	formatted: "Formatted Quill",
};

const UserPanel: React.FC<{
	label: string;
	color: string;
	viewType: ViewType;
	views: DualUserViews["user1"];
}> = ({ label, color, viewType, views }) => {
	const renderView = (): JSX.Element => {
		switch (viewType) {
			case "plainTextarea": {
				return <PlainTextMainView root={toPropTreeNode(views.plainTextarea.root)} />;
			}
			case "plainQuill": {
				return <PlainQuillView root={toPropTreeNode(views.plainQuill.root)} />;
			}
			default: {
				return <FormattedMainView root={toPropTreeNode(views.formatted.root)} />;
			}
		}
	};

	return (
		<div
			style={{
				width: "calc(50% - 10px)",
				minWidth: 0,
				border: `2px solid ${color}`,
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
					color,
				}}
			>
				{label}
			</div>
			<div style={{ flex: 1 }}>{renderView()}</div>
		</div>
	);
};

const App: React.FC<{ views: DualUserViews }> = ({ views }) => {
	const [viewType, setViewType] = React.useState<ViewType>("formatted");

	return (
		<div
			style={{
				padding: "20px",
				height: "100vh",
				boxSizing: "border-box",
				display: "flex",
				flexDirection: "column",
			}}
		>
			<div style={{ marginBottom: "15px" }}>
				<label htmlFor="view-select" style={{ marginRight: "10px", fontWeight: "bold" }}>
					View:
				</label>
				<select
					id="view-select"
					value={viewType}
					onChange={(e) => setViewType(e.target.value as ViewType)}
					style={{
						padding: "8px 12px",
						fontSize: "14px",
						borderRadius: "4px",
						border: "1px solid #ccc",
					}}
				>
					{(Object.keys(viewLabels) as ViewType[]).map((type) => (
						<option key={type} value={type}>
							{viewLabels[type]}
						</option>
					))}
				</select>
			</div>
			<div
				style={{
					flex: 1,
					display: "flex",
					gap: "20px",
					alignItems: "stretch",
				}}
			>
				<UserPanel label="User 1" color="#4a90d9" viewType={viewType} views={views.user1} />
				<UserPanel label="User 2" color="#28a745" viewType={viewType} views={views.user2} />
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
