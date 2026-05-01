/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createDevtoolsLogger,
	initializeFluidDevtools,
	type FluidDevtools,
	type FluidDevtoolsProps,
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
	treeDataStoreKind,
	type FluidContainerAttached,
} from "fluid-framework/alpha";
// eslint-disable-next-line import-x/no-internal-modules, import-x/no-unassigned-import
import "quill/dist/quill.snow.css";
import { type CSSProperties, type FC, useEffect, useMemo, useState } from "react";
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
const textEditorKind = treeDataStoreKind({
	type: "text-editor",
	config: treeConfig,
	registry: [SharedTree],
	key: SharedTree,
	initializer: () =>
		new TextEditorRoot({
			plainText: TextAsTree.Tree.fromString(""),
			formattedText: FormattedTextAsTreeDefault.Tree.fromString(""),
		}),
});

type ViewType = "plainTextarea" | "plainQuill" | "formatted";

interface DualUserViews {
	user1: TreeViewAlpha<typeof TextEditorRoot>;
	user2: TreeViewAlpha<typeof TextEditorRoot>;
	containerId: string;
	/**
	 * Properties for (re)initializing Devtools. Held so the UI can toggle Devtools on and off at runtime
	 * (see {@link DevtoolsToggle}).
	 */
	devtoolsProps?: FluidDevtoolsProps;
}

async function initFluid(): Promise<DualUserViews> {
	const { endpoint, port } = getTinyliciousEndpoint();

	// Initialize telemetry logger for use with Devtools
	const devtoolsLogger = createDevtoolsLogger();

	const options: TinyliciousServiceOptions = {
		minVersionForCollaboration: "2.100.0",
		endpoint,
		port,
		// TODO: logger
		// TODO: user ids.
	};

	const service1 = createTinyliciousServiceClient(options);

	let user1Container: FluidContainerAttached<TreeView<typeof TextEditorRoot>>;
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

		// User 1 connects to existing document
		user1Container = await service1.loadContainer(rawContainerId, textEditorKind);
	} else {
		// User 1 creates the document
		const container = await service1.createContainer(textEditorKind);
		user1Container = await container.attach();
		// eslint-disable-next-line require-atomic-updates
		location.hash = user1Container.id;
	}
	const containerId = user1Container.id;

	const service2 = createTinyliciousServiceClient(options);

	// User 2 connects to the loaded document
	const user2Container = await service2.loadContainer(containerId, textEditorKind);

	// Build the Devtools initialization props. Devtools starts disabled and is toggled on/off at runtime
	// by the React layer.
	const devtoolsProps: FluidDevtoolsProps = {
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
	};

	return {
		user1: asAlpha(user1Container.data),
		user2: asAlpha(user2Container.data),
		containerId,
		devtoolsProps,
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

/**
 * Button that enables/disables Fluid Devtools at runtime.
 */
const DevtoolsToggle: FC<{
	devtoolsProps: FluidDevtoolsProps | undefined;
}> = ({ devtoolsProps }) => {
	// Devtools defaults to off
	const [enabled, setEnabled] = useState(false);

	// Handles initialization and cleanup of devtools instance.
	// initializeFluidDevtools is async (it resolves each Container's entry point), so the instance
	// may resolve after this effect has been cleaned up; guard against that with `cancelled`.
	useEffect(() => {
		if (devtoolsProps === undefined || !enabled) {
			return undefined;
		}
		let instance: FluidDevtools | undefined;
		let cancelled = false;
		initializeFluidDevtools(devtoolsProps).then(
			(created) => {
				if (cancelled) {
					created.dispose();
				} else {
					instance = created;
				}
			},
			(error) => {
				console.error("Failed to initialize Fluid Devtools:", error);
			},
		);
		return () => {
			cancelled = true;
			if (instance !== undefined && !instance.disposed) {
				instance.dispose();
			}
		};
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
					marginBottom: "12px",
					display: "flex",
					justifyContent: "flex-start",
				}}
			>
				<DevtoolsToggle devtoolsProps={views.devtoolsProps} />
			</div>
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
