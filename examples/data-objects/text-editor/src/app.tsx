/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient, type AzureLocalConnectionConfig } from "@fluidframework/azure-client";
import { createDevtoolsLogger, initializeDevtools } from "@fluidframework/devtools/beta";
import {
	FormattedMainView,
	QuillMainView as PlainQuillView,
	// TODO: These imports use /internal entrypoints because the underlying APIs
	// haven't been promoted to public yet. Update to public entrypoints as the
	// APIs are stabilized.
	// eslint-disable-next-line import-x/no-internal-modules
} from "@fluidframework/quill-react/internal";
import {
	toPropTreeNode,
	createUndoRedo,
	type UndoRedo,
	PlainTextMainView,
	// eslint-disable-next-line import-x/no-internal-modules
} from "@fluidframework/react/internal";
/**
 * InsecureTokenProvider is used here for local development and demo purposes only.
 * Do not use in production - implement proper authentication for production scenarios.
 */
// eslint-disable-next-line import-x/no-internal-modules
import { InsecureTokenProvider } from "@fluidframework/test-runtime-utils/internal";
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { asAlpha, type TreeViewAlpha } from "@fluidframework/tree/alpha";
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextAsTree, TextAsTree } from "@fluidframework/tree/internal";
import { SharedTree } from "@fluidframework/tree/legacy";
import type { IFluidContainer } from "fluid-framework";
// eslint-disable-next-line import-x/no-internal-modules, import-x/no-unassigned-import
import "quill/dist/quill.snow.css";
import { type CSSProperties, type FC, useEffect, useMemo, useState } from "react";
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
	user1: TreeViewAlpha<typeof TextEditorRoot>;
	user2: TreeViewAlpha<typeof TextEditorRoot>;
	containerId: string;
}

async function createAndAttachNewContainer(client: AzureClient): Promise<{
	container: IFluidContainer<typeof containerSchema>;
	containerId: string;
	treeView: TreeViewAlpha<typeof TextEditorRoot>;
}> {
	const { container } = await client.createContainer(containerSchema, "2");

	const treeView = asAlpha<typeof TextEditorRoot>(
		container.initialObjects.tree.viewWith(treeConfig),
	);

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
	treeView: TreeViewAlpha<typeof TextEditorRoot>;
}> {
	const { container } = await client.getContainer(containerId, containerSchema, "2");
	const treeView = asAlpha(container.initialObjects.tree.viewWith(treeConfig));
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
	let user1View: TreeViewAlpha<typeof TextEditorRoot>;
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
		component: (root: TextEditorRoot, manager: UndoRedo) => (
			<PlainTextMainView root={toPropTreeNode(root.plainText)} undoRedo={manager} />
		),
	},
	plainQuill: {
		description: "Plain Quill Editor",
		component: (root: TextEditorRoot, manager: UndoRedo) => (
			<PlainQuillView root={toPropTreeNode(root.plainText)} undoRedo={manager} />
		),
	},
	formatted: {
		description: "Formatted Quill Editor",
		component: (root: TextEditorRoot, manager: UndoRedo) => (
			<FormattedMainView root={toPropTreeNode(root.formattedText)} undoRedo={manager} />
		),
	},
} as const;

/**
 * Base style properties for undo/redo buttons in {@link UserPanel}.
 */
const userPanelUndoRedoButtonStyleBase = {
	width: "28px",
	height: "28px",
	padding: 0,
	background: "none",
	border: "1px solid #ccc",
	borderRadius: "4px",
	fontSize: "18px",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
} as const satisfies CSSProperties;

const UserPanel: FC<{
	label: string;
	color: string;
	treeView: TreeViewAlpha<typeof TextEditorRoot>;
}> = ({ label, color, treeView }) => {
	// A single manager per user subscribes to the branch's changed events and handles
	// all labeled undo/redo. Each editor component reads from context and scopes
	// operations to its own label.
	const manager = useMemo(() => createUndoRedo(treeView), [treeView]);

	// Cleanup manager on unmount
	useEffect(() => {
		return () => manager.dispose();
	}, [manager]);

	// Re-render when undo/redo availability changes. Only local commits affect the stacks,
	// so filtering to isLocal avoids re-renders on every remote keystroke.
	const [, setVersion] = useState(0);
	useEffect(() => {
		const off = treeView.events.on("changed", (data) => {
			if (data.isLocal) {
				setVersion((v) => v + 1);
			}
		});
		return () => off();
	}, [treeView]);

	const [collapsed, setCollapsed] = useState<Record<ViewType, boolean>>({
		plainTextarea: false,
		plainQuill: false,
		formatted: false,
	});

	const toggleCollapsed = (viewType: ViewType): void => {
		setCollapsed((prev) => ({ ...prev, [viewType]: !prev[viewType] }));
	};

	// TODO: handle root invalidation, schema upgrades and out of schema documents.
	const root = treeView.root;

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
				overflowY: "auto",
			}}
		>
			<div
				style={{
					marginBottom: "10px",
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				<span style={{ fontWeight: "bold", color }}>{label}</span>
				<div style={{ display: "flex", gap: "4px" }}>
					<button
						type="button"
						disabled={!manager.canUndo()}
						onClick={() => manager.undo()}
						title="Undo"
						style={{
							...userPanelUndoRedoButtonStyleBase,
							cursor: manager.canUndo() ? "pointer" : "not-allowed",
							opacity: manager.canUndo() ? 1 : 0.3,
						}}
					>
						↶
					</button>
					<button
						type="button"
						disabled={!manager.canRedo()}
						onClick={() => manager.redo()}
						title="Redo"
						style={{
							...userPanelUndoRedoButtonStyleBase,
							cursor: manager.canRedo() ? "pointer" : "not-allowed",
							opacity: manager.canRedo() ? 1 : 0.3,
						}}
					>
						↷
					</button>
				</div>
			</div>
			{(Object.keys(viewLabels) as ViewType[]).map((viewType) => {
				const isExpanded = !collapsed[viewType];
				return (
					<div
						key={viewType}
						style={{
							border: "1px solid #ddd",
							borderRadius: "6px",
							marginBottom: "12px",
							boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
							overflow: "hidden",
						}}
					>
						<button
							type="button"
							aria-expanded={isExpanded}
							aria-controls={`${viewType}-panel`}
							onClick={() => toggleCollapsed(viewType)}
							style={{
								display: "flex",
								justifyContent: "space-between",
								alignItems: "center",
								width: "100%",
								padding: "10px 14px",
								background: "#f5f5f5",
								border: "none",
								borderBottom: isExpanded ? "1px solid #ddd" : "none",
								cursor: "pointer",
								fontWeight: "600",
								fontSize: "16px",
								textAlign: "left",
								color: "#333",
							}}
						>
							<span>{viewLabels[viewType].description}</span>
							<span aria-hidden="true" style={{ fontSize: "11px", color: "#666" }}>
								{isExpanded ? "▲" : "▼"}
							</span>
						</button>
						{/*
						 * Note: we are intentionally forcing the editor components to be unmounted when their respective cards are collapsed.
						 * We are doing this to make it possible to use this app to do performance analysis on individual editor components in isolation.
						 */}
						{isExpanded && (
							<div id={`${viewType}-panel`} style={{ padding: "12px" }}>
								{viewLabels[viewType].component(root, manager)}
							</div>
						)}
					</div>
				);
			})}
		</div>
	);
};

export const App: FC<{ views: DualUserViews }> = ({ views }) => {
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
			<div
				style={{
					flex: 1,
					display: "flex",
					gap: "20px",
					alignItems: "stretch",
				}}
			>
				<UserPanel label="User 1" color="#4a90d9" treeView={views.user1} />
				<UserPanel label="User 2" color="#28a745" treeView={views.user2} />
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
