/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureClient, type AzureLocalConnectionConfig } from "@fluidframework/azure-client";
import {
	createDevtoolsLogger,
	initializeDevtools,
	type DevtoolsProps,
} from "@fluidframework/devtools/beta";
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
import {
	asAlpha,
	configuredSharedTreeAlpha,
	ForestTypeOptimized,
	type TreeViewAlpha,
} from "@fluidframework/tree/alpha";
// eslint-disable-next-line import-x/no-internal-modules
import { FormattedTextAsTree, TextAsTree } from "@fluidframework/tree/internal";
import type { IFluidContainer } from "fluid-framework";
// eslint-disable-next-line import-x/no-internal-modules, import-x/no-unassigned-import
import "quill/dist/quill.snow.css";
import {
	type CSSProperties,
	type FC,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
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

/**
 * SharedTree configured to use the optimized "chunked" forest.
 */
const SharedTree = configuredSharedTreeAlpha({ forest: ForestTypeOptimized });

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

// Panel colors are one base hex offset by the panel's left-to-right position, so
// they're deterministic and identical across browsers (no stored palette).
const colorForIndex = (index: number): string =>
	`#${((0x4a90d9 + index * 0x2a1f3c) % 0x1000000).toString(16).padStart(6, "0")}`;

const initialUserCount = 2;

type DevtoolsLogger = ReturnType<typeof createDevtoolsLogger>;

/** One connected user's container + view. `id` is just a stable React key. */
export interface UserView {
	id: number;
	container: IFluidContainer<typeof containerSchema>;
	treeView: TreeViewAlpha<typeof TextEditorRoot>;
}

const makeUserId = (id: number): string =>
	`user${id}-${Math.random().toString(36).slice(2, 6)}`;

async function createAndAttachNewContainer(client: AzureClient): Promise<{
	container: IFluidContainer<typeof containerSchema>;
	containerId: string;
	treeView: TreeViewAlpha<typeof TextEditorRoot>;
}> {
	const { container } = await client.createContainer(containerSchema, "2.0.0");

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
	const { container } = await client.getContainer(containerId, containerSchema, "2.0.0");
	const treeView = asAlpha(container.initialObjects.tree.viewWith(treeConfig));
	return {
		container,
		treeView,
	};
}

/**
 * Connects one user (its own Fluid client) to an existing document.
 * Shared by the initial load and the "Add user" button.
 */
async function connectUser(
	id: number,
	containerId: string,
	devtoolsLogger: DevtoolsLogger,
): Promise<UserView> {
	const client = new AzureClient({
		connection: getConnectionConfig(makeUserId(id)),
		logger: devtoolsLogger,
	});
	const { container, treeView } = await loadExistingContainer(client, containerId);
	return { id, container, treeView };
}

async function initFluid(): Promise<{
	containerId: string;
	devtoolsLogger: DevtoolsLogger;
	devtoolsProps: DevtoolsProps;
	initialUsers: UserView[];
}> {
	console.log(`Connecting to Tinylicious at: ${getTinyliciousEndpoint()}`);
	const devtoolsLogger = createDevtoolsLogger();

	let containerId: string;
	const initialUsers: UserView[] = [];

	if (location.hash) {
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
		initialUsers.push(await connectUser(1, containerId, devtoolsLogger));
	} else {
		// First user creates and attaches the new document.
		const client = new AzureClient({
			connection: getConnectionConfig(makeUserId(1)),
			logger: devtoolsLogger,
		});
		const created = await createAndAttachNewContainer(client);
		containerId = created.containerId;
		// eslint-disable-next-line require-atomic-updates
		location.hash = containerId;
		initialUsers.push({ id: 1, container: created.container, treeView: created.treeView });
	}

	for (let id = initialUsers.length + 1; id <= initialUserCount; id++) {
		initialUsers.push(await connectUser(id, containerId, devtoolsLogger));
	}

	const firstUser = initialUsers[0];
	if (firstUser === undefined) {
		throw new Error("Expected at least one initial user.");
	}

	// Devtools starts disabled and is toggled on/off at runtime by the React layer
	// (see {@link DevtoolsToggle}).
	const devtoolsProps: DevtoolsProps = {
		logger: devtoolsLogger,
		initialContainers: [
			{
				container: firstUser.container,
				containerKey: `User ${firstUser.id} Container`,
			},
		],
	};

	return { containerId, devtoolsLogger, devtoolsProps, initialUsers };
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
	container: IFluidContainer<typeof containerSchema>;
	treeView: TreeViewAlpha<typeof TextEditorRoot>;
	/**
	 * Removes this user from the side-by-side view. Omitted when removal is not
	 * allowed (e.g. the last remaining user).
	 */
	onRemove?: () => void;
}> = ({ label, color, container, treeView, onRemove }) => {
	// A single manager per user subscribes to the branch's changed events and handles
	// all labeled undo/redo. Each editor component reads from context and scopes
	// operations to its own label.
	const manager = useMemo(() => createUndoRedo(treeView), [treeView]);

	// Cleanup a single view (user) resources on unmount
	useEffect(() => {
		return () => {
			manager.dispose();
			treeView.dispose();
			container.dispose();
		};
	}, [manager, treeView, container]);

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
				flex: "1 1 0",
				minWidth: "360px",
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
					{onRemove !== undefined && (
						<button
							type="button"
							onClick={onRemove}
							title={`Remove ${label}`}
							aria-label={`Remove ${label}`}
						>
							✕
						</button>
					)}
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

/**
 * Button that enables/disables Fluid Devtools at runtime.
 */
const DevtoolsToggle: FC<{
	devtoolsProps: DevtoolsProps | undefined;
}> = ({ devtoolsProps }) => {
	// Devtools defaults to off
	const [enabled, setEnabled] = useState(false);

	// Handles initialization and cleanup of devtools instance
	useEffect(() => {
		if (devtoolsProps === undefined) {
			return;
		}
		if (enabled) {
			const instance = initializeDevtools(devtoolsProps);
			return () => {
				if (!instance.disposed) {
					instance.dispose();
				}
			};
		}
		return undefined;
	}, [enabled, devtoolsProps]);

	return (
		<button
			type="button"
			onClick={() => setEnabled((value) => !value)}
			title={
				enabled
					? "Disable Fluid Devtools (recommended before capturing a performance trace.)"
					: "Enable Fluid Devtools (Devtools visualizes every node on every edit)"
			}
			style={{
				padding: "6px 12px",
				borderRadius: "4px",
				border: "1px solid #ccc",
				background: enabled ? "#e6f4ea" : "#f5f5f5",
				color: "#333",
				fontSize: "13px",
				fontWeight: 600,
				cursor: "pointer",
			}}
		>
			{`Devtools: ${enabled ? "On" : "Off"}`}
		</button>
	);
};

export const App: FC<{
	containerId: string;
	devtoolsLogger: DevtoolsLogger;
	devtoolsProps: DevtoolsProps;
	initialUsers: UserView[];
}> = ({ containerId, devtoolsLogger, devtoolsProps, initialUsers }) => {
	const [users, setUsers] = useState<UserView[]>(initialUsers);
	// ID is never reused.
	const nextIdRef = useRef(initialUserCount + 1);

	const addUser = useCallback(() => {
		connectUser(nextIdRef.current++, containerId, devtoolsLogger)
			.then((user) => setUsers((prev) => [...prev, user]))
			.catch((error: unknown) => console.error("Failed to add user:", error));
	}, [containerId, devtoolsLogger]);

	// Drop the user from the list; its UserPanel disposes the view and container as
	// it unmounts (see the teardown effect in UserPanel).
	const removeUser = useCallback((user: UserView) => {
		setUsers((prev) => prev.filter((candidate) => candidate !== user));
	}, []);

	// The first user is static: it is never removable and never can be removed.
	const firstUserId = initialUsers[0]?.id;

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
					marginBottom: "12px",
					display: "flex",
					gap: "12px",
					alignItems: "center",
				}}
			>
				<button type="button" onClick={addUser}>
					+ Add user
				</button>
				<DevtoolsToggle devtoolsProps={devtoolsProps} />
			</div>
			<div
				style={{
					flex: 1,
					display: "flex",
					gap: "20px",
					alignItems: "stretch",
					overflowX: "auto",
					minHeight: 0,
				}}
			>
				{users.map((user, index) => (
					<UserPanel
						key={user.id}
						label={`User ${index + 1}`}
						color={colorForIndex(index)}
						container={user.container}
						treeView={user.treeView}
						onRemove={user.id === firstUserId ? undefined : () => removeUser(user)}
					/>
				))}
			</div>
		</div>
	);
};

async function start(): Promise<void> {
	const rootElement = document.querySelector("#content");
	if (!rootElement) return;

	try {
		const { containerId, devtoolsLogger, devtoolsProps, initialUsers } = await initFluid();
		const root = createRoot(rootElement);
		root.render(
			<App
				containerId={containerId}
				devtoolsLogger={devtoolsLogger}
				devtoolsProps={devtoolsProps}
				initialUsers={initialUsers}
			/>,
		);
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
