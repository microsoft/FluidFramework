/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient, type AzureLocalConnectionConfig } from "@fluidframework/azure-client";
import { createDevtoolsLogger, initializeDevtools } from "@fluidframework/devtools/beta";
import {
	toPropTreeNode,
	FormattedMainView,
	PlainTextMainView,
	PlainQuillView,
	UndoRedoStacks,
	type UndoRedo,
	// eslint-disable-next-line import-x/no-internal-modules
} from "@fluidframework/react/internal";
/**
 * InsecureTokenProvider is used here for local development and demo purposes only.
 * Do not use in production - implement proper authentication for production scenarios.
 */
// eslint-disable-next-line import-x/no-internal-modules
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { SchemaFactory, TreeViewConfiguration, type TreeView } from "@fluidframework/tree";
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextAsTree, TextAsTree } from "@fluidframework/tree/internal";
import { SharedTree } from "@fluidframework/tree/legacy";
import type { IFluidContainer } from "fluid-framework";
// eslint-disable-next-line import-x/no-internal-modules, import-x/no-unassigned-import
import "quill/dist/quill.snow.css";
import * as React from "react";
// eslint-disable-next-line import-x/no-internal-modules
import { createRoot } from "react-dom/client";

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
		tree: SharedTree,
	},
};

const sf = new SchemaFactory("com.fluidframework.example.text-editor");

export class TextEditorRoot extends sf.object("TextEditorRoot", {
	plainText: TextAsTree.Tree,
	formattedText: FormattedTextAsTree.Tree,
}) {}

export const treeConfig = new TreeViewConfiguration({ schema: TextEditorRoot });

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
	user1: TreeView<typeof TextEditorRoot>;
	user2: TreeView<typeof TextEditorRoot>;
	containerId: string;
}

async function createAndAttachNewContainer(client: AzureClient): Promise<{
	container: IFluidContainer<typeof containerSchema>;
	containerId: string;
	treeView: TreeView<typeof TextEditorRoot>;
}> {
	const { container } = await client.createContainer(containerSchema, "2");

	const treeView = container.initialObjects.tree.viewWith(treeConfig);

	// Initialize tree with root containing both plain and formatted text
	treeView.initialize(
		new TextEditorRoot({
			plainText: TextAsTree.Tree.fromString(""),
			formattedText: FormattedTextAsTree.Tree.fromString(""),
		}),
	);

	const containerId = await container.attach();

	return {
		container,
		containerId,
		treeView,
	};
}

async function loadExistingContainer(
	client: AzureClient,
	containerId: string,
): Promise<{
	container: IFluidContainer<typeof containerSchema>;
	treeView: TreeView<typeof TextEditorRoot>;
}> {
	const { container } = await client.getContainer(containerId, containerSchema, "2");
	const treeView = container.initialObjects.tree.viewWith(treeConfig);
	return {
		container,
		treeView,
	};
}

async function initFluid(): Promise<DualUserViews> {
	const endpoint = getTinyliciousEndpoint();
	console.log(`Connecting to Tinylicious at: ${endpoint}`);

	const user1Id = `user1-${Math.random().toString(36).slice(2, 6)}`;
	const user2Id = `user2-${Math.random().toString(36).slice(2, 6)}`;

	// Initialize telemetry logger for use with Devtools
	const devtoolsLogger = createDevtoolsLogger();

	const client1 = new AzureClient({
		connection: getConnectionConfig(user1Id),
		logger: devtoolsLogger,
	});

	let containerId: string;
	let user1Container: IFluidContainer;
	let user1View: TreeView<typeof TextEditorRoot>;
	if (location.hash) {
		// Load existing document for both users
		const rawContainerId = location.hash.slice(1);
		// Basic validation for container ID from URL hash before making network requests
		const isValidContainerId =
			rawContainerId.length > 0 && /^[\dA-Za-z-]{3,64}$/.test(rawContainerId);
		if (!isValidContainerId) {
			console.error(`Invalid container ID in URL hash: "${rawContainerId}"`);
			throw new Error(
				"Invalid container ID in URL hash. Expected 3-64 alphanumeric or '-' characters.",
			);
		}
		containerId = rawContainerId;
		console.log(`Loading document for both users: ${containerId}`);

		// User 1 connects to existing document
		({ container: user1Container, treeView: user1View } = await loadExistingContainer(
			client1,
			containerId,
		));

		console.log(`User 1 connected to document: ${containerId}`);
	} else {
		// User 1 creates the document
		({
			container: user1Container,
			treeView: user1View,
			containerId,
		} = await createAndAttachNewContainer(client1));

		// eslint-disable-next-line require-atomic-updates
		location.hash = containerId;

		console.log(`User 1 created document: ${containerId}`);
	}

	// User 2 connects to the loaded document
	const client2 = new AzureClient({
		connection: getConnectionConfig(user2Id),
		logger: devtoolsLogger,
	});
	const { container: user2Container, treeView: user2View } = await loadExistingContainer(
		client2,
		containerId,
	);

	console.log(`User 2 connected to document: ${containerId}`);

	// Initialize Devtools
	initializeDevtools({
		logger: devtoolsLogger,
		initialContainers: [
			{
				container: user1Container,
				containerKey: "User 1 Container",
			},
			{
				container: user2Container,
				containerKey: "User 2 Container",
			},
		],
	});

	return {
		user1: user1View,
		user2: user2View,
		containerId,
	};
}

const viewLabels = {
	plainTextarea: {
		description: "Plain Textarea",
		component: (
			root: TextEditorRoot,
			_treeView: TreeView<typeof TextEditorRoot>,
			_undoRedo?: UndoRedo,
		) => <PlainTextMainView root={toPropTreeNode(root.plainText)} />,
	},
	plainQuill: {
		description: "Plain Quill Editor",
		component: (
			root: TextEditorRoot,
			_treeView: TreeView<typeof TextEditorRoot>,
			_undoRedo?: UndoRedo,
		) => <PlainQuillView root={toPropTreeNode(root.plainText)} />,
	},
	formatted: {
		description: "Formatted Quill Editor",
		component: (
			root: TextEditorRoot,
			_treeView: TreeView<typeof TextEditorRoot>,
			undoRedo?: UndoRedo,
		) => <FormattedMainView root={toPropTreeNode(root.formattedText)} undoRedo={undoRedo} />,
	},
} as const;

const UserPanel: React.FC<{
	label: string;
	color: string;
	viewType: ViewType;
	treeView: TreeView<typeof TextEditorRoot>;
}> = ({ label, color, viewType, treeView }) => {
	// Create undo/redo stack for this user's tree view
	const undoRedo = React.useMemo(() => new UndoRedoStacks(treeView.events), [treeView.events]);

	// Cleanup on unmount
	React.useEffect(() => {
		return () => undoRedo.dispose();
	}, [undoRedo]);

	// TODO: handle root invalidation, schema upgrades and out of schema documents.
	const renderView = (): JSX.Element => {
		const root = treeView.root;
		return viewLabels[viewType].component(root, treeView, undoRedo);
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

export const App: React.FC<{ views: DualUserViews }> = ({ views }) => {
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
							{viewLabels[type].description}
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
				<UserPanel label="User 1" color="#4a90d9" viewType={viewType} treeView={views.user1} />
				<UserPanel label="User 2" color="#28a745" viewType={viewType} treeView={views.user2} />
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
