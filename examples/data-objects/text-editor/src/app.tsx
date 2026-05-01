/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createDevtoolsLogger,
	initializeFluidDevtools,
	type FluidContainerDevtoolsProps,
	type FluidDevtools,
	type IDevtoolsLogger,
} from "@fluidframework/devtools/alpha";
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
import {
	createTinyliciousServiceClient,
	type TinyliciousServiceOptions,
} from "@fluidframework/tinylicious-driver/alpha";
import {
	asAlpha,
	FluidClientVersion,
	ForestTypeOptimized,
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
	SchemaFactoryAlpha,
	TreeCompressionStrategy,
	TreeViewConfigurationAlpha,
	type TreeViewAlpha,
} from "@fluidframework/tree/alpha";
/* eslint-disable import-x/no-internal-modules */
import {
	configuredSharedTree,
	FormattedTextAsTreeDefault,
} from "@fluidframework/tree/internal";
/* eslint-enable import-x/no-internal-modules */
import { TreeViewConfiguration, type TreeView } from "fluid-framework";
import {
	TextAsTree,
	defineTreeDataStore,
	type FluidContainerAttached,
} from "fluid-framework/alpha";
// eslint-disable-next-line import-x/no-internal-modules, import-x/no-unassigned-import
import "quill/dist/quill.snow.css";
import { type CSSProperties, type FC, useCallback, useEffect, useMemo, useState } from "react";
// eslint-disable-next-line import-x/no-internal-modules
import { createRoot } from "react-dom/client";

/**
 * Get the Tinylicious endpoint URL, handling Codespaces port forwarding. Tinylicious only works for localhost,
 * so in Codespaces we need to use the forwarded URL.
 */
function getTinyliciousEndpoint(): { endpoint: string; port: number } {
	const hostname = window.location.hostname;
	const tinyliciousPort = 7070;

	// Detect GitHub Codespaces: hostname like "ideal-giggle-xxx-8080.app.github.dev"
	if (hostname.endsWith(".app.github.dev")) {
		const match = /^(.+)-\d+\.app\.github\.dev$/.exec(hostname);
		if (match) {
			const codespaceName = match[1];
			// Codespaces forwards the tinylicious port via the subdomain and serves it over standard HTTPS.
			return {
				endpoint: `https://${codespaceName}-${tinyliciousPort}.app.github.dev`,
				port: 443,
			};
		}
	}

	return { endpoint: "http://localhost", port: tinyliciousPort };
}

/**
 * Builds the {@link TinyliciousServiceOptions} for connecting to the Tinylicious service,
 * resolving the endpoint (handling Codespaces port forwarding).
 */
function makeServiceOptions(): TinyliciousServiceOptions {
	const { endpoint, port } = getTinyliciousEndpoint();
	return {
		minVersionForCollaboration: "2.100.0",
		endpoint,
		port,
		// TODO: logger
		// TODO: user ids.
	};
}

const sf = new SchemaFactoryAlpha("com.fluidframework.example.text-editor");

export class TextEditorRoot extends sf.objectAlpha("TextEditorRoot", {
	// Opt both the plain and formatted text into incremental summarization by marking the
	// fields above their text nodes with incrementalSummaryHint.
	plainText: sf.types([TextAsTree.Tree], { custom: { [incrementalSummaryHint]: true } }),
	formattedText: sf.types([FormattedTextAsTreeDefault.Tree], {
		custom: { [incrementalSummaryHint]: true },
	}),
}) {}

export const treeConfig = new TreeViewConfiguration({ schema: TextEditorRoot });

/**
 * SharedTree configured to use the optimized "chunked" forest along with incremental
 * summarization. {@link incrementalEncodingPolicyForAllowedTypes} reads the
 * {@link incrementalSummaryHint} from the {@link TextEditorRoot}, so both the
 * plain and formatted text are encoded incrementally.
 */
const SharedTree = configuredSharedTree({
	forest: ForestTypeOptimized,
	treeEncodeType: TreeCompressionStrategy.CompressedIncremental,
	shouldEncodeIncrementally: incrementalEncodingPolicyForAllowedTypes(
		new TreeViewConfigurationAlpha({ schema: TextEditorRoot }),
	),
	minVersionForCollab: FluidClientVersion.v2_74,
});

/**
 * Data store kind for the text editor application.
 * Defines the schema, view configuration, and initial (empty) state for both plain and formatted text trees.
 *
 * @remarks
 * The optimized, incremental-summarization {@link SharedTree} is supplied via the registry so the
 * data store uses it in place of the default SharedTree kind.
 */
const textEditorKind = defineTreeDataStore({
	type: "text-editor",
	config: treeConfig,
	registry: [SharedTree],
	key: SharedTree,
	initializer: () => createInitialRoot(),
});

type ViewType = "plainTextarea" | "plainQuill" | "formatted";

/**
 * Colors are derived arithmetically from the index and are identical across browsers without a
 * stored palette.
 *
 * @param index - The index of the user panel
 * @returns The hex color string for the given index
 */
function colorForIndex(index: number): string {
	return `#${((0x4a90d9 + index * 0x2a1f3c) % 0x1000000).toString(16).padStart(6, "0")}`;
}

const initialUserCount = 2;

/**
 * Identifies one user in this app.
 *
 * Serves as the React key for the user's panel, the key for its Devtools registration,
 * and the user ID reported to the Fluid service's audience. IDs are randomly generated
 * and never reused within a page, so a removed user's ID is not given to a later-added
 * one.
 */
type UserId = string;

/**
 * Generates a fresh {@link UserId}.
 *
 * Random so simulated users stay unique in the document's audience even across page
 * reloads and multiple tabs open on the same document.
 */
function makeUserId(): UserId {
	return Math.random().toString(36).slice(2, 10);
}

/** One user's connection to the document, as shown in a single panel. */
export interface UserView {
	/** Identifies this user using {@link UserId}. */
	readonly id: UserId;
	/**
	 * This user's own container. Held so the app can register it with Devtools and
	 * dispose it when the panel is removed. Everything the panel renders comes from
	 * {@link UserView.treeView}.
	 */
	readonly container: FluidContainerAttached<TreeView<typeof TextEditorRoot>>;
	/** This user's view of the shared text, rendered and edited by the panel. */
	readonly treeView: TreeViewAlpha<typeof TextEditorRoot>;
}

/**
 * Devtools registration props for one user's container. Keyed by user id, which is
 * never reused, so keys stay unique across add/remove cycles.
 */
const devtoolsContainerProps = (user: UserView): FluidContainerDevtoolsProps => ({
	container: user.container,
	containerKey: `User ${user.id} Container`,
});

/**
 * Creates a document root holding the given text as both plain and formatted text.
 * Used to initialize new documents; exported so tests can initialize in-memory views
 * with the same shape.
 */
export function createInitialRoot(text = ""): TextEditorRoot {
	return new TextEditorRoot({
		plainText: TextAsTree.Tree.fromString(text),
		formattedText: FormattedTextAsTreeDefault.Tree.fromString(text),
	});
}

/**
 * Wraps a freshly created or loaded container as a {@link UserView} under a new {@link UserId}.
 */
function userViewFromContainer(
	container: FluidContainerAttached<TreeView<typeof TextEditorRoot>>,
): UserView {
	return { id: makeUserId(), container, treeView: asAlpha(container.data) };
}

/**
 * Connects one user (its own {@link @fluidframework/tinylicious-driver#createTinyliciousServiceClient | ServiceClient},
 * under a fresh {@link UserId}) to an existing document. Shared by the initial load and the "Add user" button.
 * @param containerId - Identifies the document (Fluid container) to load.
 */
async function connectUser(containerId: string): Promise<UserView> {
	const service = createTinyliciousServiceClient(makeServiceOptions());
	const container = await service.loadContainer(containerId, textEditorKind);
	return userViewFromContainer(container);
}

async function initFluid(): Promise<{
	containerId: string;
	devtoolsLogger: IDevtoolsLogger;
	initialUsers: UserView[];
}> {
	const { endpoint } = getTinyliciousEndpoint();
	console.log(`Connecting to Tinylicious at: ${endpoint}`);
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
		initialUsers.push(await connectUser(containerId));
	} else {
		// First user creates and attaches the new document.
		const service = createTinyliciousServiceClient(makeServiceOptions());
		const container = await service.createContainer(textEditorKind);
		const attached = await container.attach();
		containerId = attached.id;
		// eslint-disable-next-line require-atomic-updates
		location.hash = containerId;
		initialUsers.push(userViewFromContainer(attached));
	}

	// Connect the remaining initial users (the first was connected/created above).
	for (let i = initialUsers.length; i < initialUserCount; i++) {
		initialUsers.push(await connectUser(containerId));
	}

	return { containerId, devtoolsLogger, initialUsers };
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
	container: FluidContainerAttached<TreeView<typeof TextEditorRoot>>;
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
			// Note: closing while `isDirty` drops any local edits not yet acknowledged
			// by the service. Acceptable for this demo, and it avoids waiting on an ack
			// that may never arrive (e.g. if the service is unreachable).
			container.close();
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
							flexShrink: 0,
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
 * The Devtools instance itself is managed by the app, which keeps its set of
 * registered containers in sync as users are added and removed.
 */
const DevtoolsToggle: FC<{
	enabled: boolean;
	onToggle: () => void;
}> = ({ enabled, onToggle }) => {
	return (
		<button
			type="button"
			onClick={onToggle}
			title={
				enabled
					? "Disable Fluid Devtools (recommended before capturing a performance trace.)"
					: "Enable Fluid Devtools (Devtools visualizes every node on every edit)"
			}
		>
			{`Devtools: ${enabled ? "On" : "Off"}`}
		</button>
	);
};

export const App: FC<{
	containerId: string;
	devtoolsLogger: IDevtoolsLogger;
	initialUsers: UserView[];
	/**
	 * How "Add user" connects a new user to the document. Defaults to
	 * {@link connectUser}; tests inject a fake to avoid a real service connection.
	 */
	connectUser?: typeof connectUser;
}> = ({ containerId, devtoolsLogger, initialUsers, connectUser: connect = connectUser }) => {
	const [users, setUsers] = useState<UserView[]>(initialUsers);

	// Devtools defaults to off and is toggled at runtime (see DevtoolsToggle).
	const [devtoolsEnabled, setDevtoolsEnabled] = useState(false);

	// (Re)initializes Devtools with the current users' containers whenever it's enabled
	// or the user set changes. Recreating the instance on add/remove keeps registration
	// fully declarative, and add/remove is rare enough that the re-init cost is fine.
	// initializeFluidDevtools is async (it resolves each Container's entry point), so the
	// instance may resolve after this effect has been cleaned up; guard against that with
	// `cancelled`. Devtools can also dispose itself (its `beforeunload` handler fires even
	// for navigations that end up canceled), hence the guard before dispose.
	useEffect(() => {
		if (!devtoolsEnabled) {
			return undefined;
		}
		let instance: FluidDevtools | undefined;
		let cancelled = false;
		initializeFluidDevtools({
			logger: devtoolsLogger,
			initialContainers: users.map((user) => devtoolsContainerProps(user)),
		}).then(
			(created) => {
				if (cancelled) {
					created.dispose();
				} else {
					instance = created;
				}
			},
			(error: unknown) => {
				console.error("Failed to initialize Fluid Devtools:", error);
			},
		);
		return () => {
			cancelled = true;
			if (instance !== undefined && !instance.disposed) {
				instance.dispose();
			}
		};
	}, [devtoolsEnabled, devtoolsLogger, users]);

	const addUser = useCallback(() => {
		connect(containerId)
			.then((user) => setUsers((prev) => [...prev, user]))
			.catch((error: unknown) => console.error("Failed to add user:", error));
	}, [connect, containerId]);

	// Drop the user from the list; the Devtools effect above re-initializes without it
	// and its UserPanel disposes the view and container as it unmounts (see the teardown
	// effect in UserPanel).
	// The length check makes the "keep at least one user" invariant authoritative here:
	// `canRemove` below only gates the buttons, which isn't enough if two removals land
	// in the same render batch (both handlers would see a stale `canRemove === true`).
	const removeUser = useCallback((user: UserView) => {
		setUsers((prev) =>
			prev.length > 1 ? prev.filter((candidate) => candidate !== user) : prev,
		);
	}, []);

	// Keep at least one user so the app always shows a view to work with.
	const canRemove = users.length > 1;

	return (
		<div
			style={{
				padding: "20px",
				minHeight: "100vh",
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
				<DevtoolsToggle
					enabled={devtoolsEnabled}
					onToggle={() => setDevtoolsEnabled((value) => !value)}
				/>
			</div>
			<div
				style={{
					flex: 1,
					display: "flex",
					gap: "20px",
					alignItems: "stretch",
					overflowX: "auto",
				}}
			>
				{users.map((user, index) => (
					<UserPanel
						key={user.id}
						label={`User ${index + 1}`}
						color={colorForIndex(index)}
						container={user.container}
						treeView={user.treeView}
						onRemove={canRemove ? () => removeUser(user) : undefined}
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
		const { containerId, devtoolsLogger, initialUsers } = await initFluid();
		const root = createRoot(rootElement);
		root.render(
			<App
				containerId={containerId}
				devtoolsLogger={devtoolsLogger}
				initialUsers={initialUsers}
			/>,
		);
	} catch (error) {
		console.error("Failed to start:", error);
		const { endpoint, port } = getTinyliciousEndpoint();
		rootElement.innerHTML = `<div style="color: #721c24; background: #f8d7da; padding: 20px; border-radius: 4px; border: 1px solid #f5c6cb;">
			<h2>Failed to connect to Tinylicious</h2>
			<p><strong>Error:</strong> ${error instanceof Error ? error.message : String(error)}</p>
			<p><strong>Tinylicious endpoint:</strong> ${endpoint}:${port}</p>
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
