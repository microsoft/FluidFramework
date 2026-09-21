/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createOrLoadExampleContainer,
	defaultServiceOptions,
	ExampleErrorView,
	ExampleLoadingView,
	getExampleServiceClient,
	renderRoot,
} from "@fluid-example/example-utils";
import {
	createDevtoolsLogger,
	initializeDevtoolsAlpha,
	type FluidContainerDevtoolsProps,
	type IDevtoolsLogger,
} from "@fluidframework/devtools-core/alpha";
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
// eslint-disable-next-line import-x/no-internal-modules -- FormattedTextDefault has no public export. TODO: remove or alpha stabilize FormattedTextDefault.
import { FormattedTextDefault } from "@fluidframework/tree/internal";
import { TreeViewConfiguration, type ITree } from "fluid-framework";
import {
	asAlpha,
	defineDataStore,
	FluidClientVersion,
	ForestTypeOptimized,
	incrementalEncodingPolicyForAllowedTypes,
	incrementalSummaryHint,
	instantiateTreeFirstTime,
	SchemaFactoryAlpha,
	sharedObjectRegistryFromIterable,
	PlainText,
	TreeCompressionStrategy,
	type FluidContainer,
	type TreeViewAlpha,
	TreeViewConfigurationAlpha,
	configuredSharedTree,
} from "fluid-framework/alpha";
// eslint-disable-next-line import-x/no-internal-modules, import-x/no-unassigned-import
import "quill/dist/quill.snow.css";
import { type CSSProperties, type FC, useCallback, useEffect, useMemo, useState } from "react";

const sf = new SchemaFactoryAlpha("com.fluidframework.example.text-editor");

export class TextEditorRoot extends sf.objectAlpha("TextEditorRoot", {
	// Opt both the plain and formatted text into incremental summarization by marking the
	// fields above their text nodes with incrementalSummaryHint.
	plainText: sf.types([PlainText.Tree], { custom: { [incrementalSummaryHint]: true } }),
	formattedText: sf.types([FormattedTextDefault.Tree], {
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
 * Creates or loads the document's SharedTree and exposes a typed view to each user.
 */
const TextEditorDataStore = defineDataStore<TextEditorData, ITree>({
	type: "text-editor",
	registry: sharedObjectRegistryFromIterable([SharedTree]),
	instantiateFirstTime: async (rootCreator, creator) =>
		instantiateTreeFirstTime(rootCreator, creator, SharedTree, {
			config: treeConfig,
			initializer: () => createInitialRoot(),
		}),
	view: async (tree) => ({ tree, treeView: asAlpha(tree.viewWith(treeConfig)) }),
});

/**
 * Data exposed by the text editor's root data store.
 */
interface TextEditorData {
	/** The shared object registered with Devtools for inspection. */
	tree: ITree;
	/** This client's typed view used to read and edit the document. */
	treeView: TreeViewAlpha<typeof TextEditorRoot>;
}

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
 * Serves as the React key for the user's panel and the key for its Devtools registration.
 * IDs are randomly generated
 * and never reused within a page, so a removed user's ID is not given to a later-added
 * one.
 */
type UserId = string;

/**
 * Generates a fresh {@link UserId}.
 *
 * @remarks
 * This is random so simulated users stay unique across page
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
	 * close it when the panel is removed. Everything the panel renders comes from
	 * {@link UserView.treeView}.
	 */
	readonly container: FluidContainer<TextEditorData>;
	/** This user's view of the shared text, rendered and edited by the panel. */
	readonly treeView: TreeViewAlpha<typeof TextEditorRoot>;
}

/**
 * Devtools registration props for one user's container. Keyed by user id, which is
 * never reused, so keys stay unique across add/remove cycles.
 */
const devtoolsContainerProps = (user: UserView): FluidContainerDevtoolsProps => ({
	container: user.container,
	containerData: { tree: user.container.data.tree },
	containerKey: `User ${user.id} Container`,
});

/**
 * Creates a document root holding the given text as both plain and formatted text.
 * @param text - Initial content for both text fields. Defaults to an empty string.
 * @returns A root ready to initialize a new tree view.
 * @remarks
 * Used to initialize new documents; exported so tests can initialize in-memory views
 * with the same shape.
 */
export function createInitialRoot(text = ""): TextEditorRoot {
	return new TextEditorRoot({
		plainText: PlainText.Tree.fromString(text),
		formattedText: FormattedTextDefault.Tree.fromString(text),
	});
}

/**
 * Connects another simulated user to an existing document.
 * @param containerId - Identifies the document to load.
 * @returns The user's container and typed view, with a fresh user ID.
 */
type ConnectUser = (containerId: string) => Promise<UserView>;

/**
 * Creates or loads the document and connects the initial simulated users.
 * @returns The document ID, shared telemetry logger, initial users, and callback for adding users.
 */
async function initializeFluid(): Promise<{
	/** Identifies the document shared by all users. */
	containerId: string;
	/** Routes telemetry from all users' containers to Devtools. */
	devtoolsLogger: IDevtoolsLogger;
	/** Users connected during startup, each with a separate container and tree view. */
	initialUsers: UserView[];
	/** Connects an additional user when a panel is added. */
	connectUser: ConnectUser;
}> {
	const devtoolsLogger = createDevtoolsLogger();
	const client = getExampleServiceClient({ ...defaultServiceOptions, logger: devtoolsLogger });
	const connectUser: ConnectUser = async (documentId) => {
		const loaded = await client.loadContainer(documentId, TextEditorDataStore);
		return { id: makeUserId(), container: loaded, treeView: loaded.data.treeView };
	};
	const container = await createOrLoadExampleContainer(client, TextEditorDataStore);
	const containerId = container.id;
	if (containerId === undefined) {
		throw new Error("The example container is not attached.");
	}
	const initialUsers: UserView[] = [
		{ id: makeUserId(), container, treeView: container.data.treeView },
	];

	// Connect the remaining initial users (the first was connected/created above).
	for (let userIndex = initialUsers.length; userIndex < initialUserCount; userIndex++) {
		initialUsers.push(await connectUser(containerId));
	}

	return { containerId, devtoolsLogger, initialUsers, connectUser };
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
	container: UserView["container"];
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
			// Note: closing drops any local edits not yet acknowledged
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
	 * Connects a new user to the document. Tests inject a fake to avoid a service connection.
	 */
	connectUser: ConnectUser;
}> = ({ containerId, devtoolsLogger, initialUsers, connectUser: connect }) => {
	const [users, setUsers] = useState<UserView[]>(initialUsers);

	// Devtools defaults to off and is toggled at runtime (see DevtoolsToggle).
	const [devtoolsEnabled, setDevtoolsEnabled] = useState(false);

	// (Re)initializes Devtools with the current users' containers whenever it's enabled
	// or the user set changes. Recreating the instance on add/remove keeps registration
	// fully declarative, and add/remove is rare enough that the re-init cost is fine.
	// Devtools can also dispose itself (its `beforeunload` handler fires even for
	// navigations that end up canceled), hence the guard before dispose.
	useEffect(() => {
		if (!devtoolsEnabled) {
			return;
		}
		const devtools = initializeDevtoolsAlpha({
			logger: devtoolsLogger,
		});
		for (const user of users) {
			devtools.registerContainerDevtools(devtoolsContainerProps(user));
		}
		return () => {
			if (!devtools.disposed) {
				devtools.dispose();
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
				fontFamily: "sans-serif",
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
		renderRoot(<ExampleLoadingView />);
		const { containerId, devtoolsLogger, initialUsers, connectUser } = await initializeFluid();
		renderRoot(
			<App
				containerId={containerId}
				devtoolsLogger={devtoolsLogger}
				initialUsers={initialUsers}
				connectUser={connectUser}
			/>,
		);
	} catch (error) {
		console.error("Failed to start:", error);
		renderRoot(<ExampleErrorView error={error} />);
	}
}

// eslint-disable-next-line unicorn/prefer-top-level-await
start().catch(console.error);
