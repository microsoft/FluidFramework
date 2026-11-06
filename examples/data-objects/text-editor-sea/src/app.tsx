/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ExampleErrorView,
	ExampleLoadingView,
	renderRoot,
} from "@fluid-example/example-utils";
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
/* eslint-disable import-x/no-internal-modules -- Direct SEA integration APIs are internal. */
import {
	SeaSessionDriverClient,
	type SeaSessionFactory,
} from "@fluidframework/sea-driver/internal";
/* eslint-enable import-x/no-internal-modules -- Limit the exception to direct SEA integration. */
// eslint-disable-next-line import-x/no-internal-modules
import { DirectSharedTreeClient } from "@fluidframework/sea-tree/internal";
/* eslint-disable import-x/no-internal-modules -- Direct SEA integration APIs are internal. */
import { openRemote } from "@fluidframework/sea-typescript/internal/websocket";
/* eslint-enable import-x/no-internal-modules -- Limit the exception to direct SEA integration. */
import { TreeViewConfiguration } from "@fluidframework/tree";
import {
	asAlpha,
	incrementalSummaryHint,
	SchemaFactoryAlpha,
	PlainText,
	type TreeViewAlpha,
} from "@fluidframework/tree/alpha";
// eslint-disable-next-line import-x/no-internal-modules -- TODO: migrate to `FormattedText` with explicit parameterization.
import { FormattedTextDefault } from "@fluidframework/tree/internal";
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
 * Random so simulated users stay unique across page
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
	 * This user's direct SEA SharedTree client.
	 */
	readonly client: Pick<
		DirectSharedTreeClient,
		| "dispose"
		| "disconnect"
		| "reconnect"
		| "onStatusChange"
		| "connectionState"
		| "pendingOperationCount"
		| "summaryCount"
		| "loadedFromSummary"
		| "lastError"
	>;
	/** This user's view of the shared text, rendered and edited by the panel. */
	readonly treeView: TreeViewAlpha<typeof TextEditorRoot>;
}

/**
 * Creates a document root holding the given text as both plain and formatted text.
 * Used to initialize new documents; exported so tests can initialize in-memory views
 * with the same shape.
 */
export function createInitialRoot(text = ""): TextEditorRoot {
	return new TextEditorRoot({
		plainText: PlainText.Tree.fromString(text),
		formattedText: FormattedTextDefault.Tree.fromString(text),
	});
}

type ConnectUser = (documentId: Uint8Array) => Promise<UserView>;

const subscriptionBatchMaxOperations = 64;
const subscriptionBatchMaxPayloadBytes = 1024 * 1024;

function getSeaWebSocketUrl(): string {
	const endpoint = new URL(globalThis.location.href);
	endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
	if (/-808[02](?=\.app\.github\.dev$)/u.test(endpoint.hostname)) {
		endpoint.hostname = endpoint.hostname.replace(/-808[02](?=\.app\.github\.dev$)/u, "-8081");
		endpoint.port = "";
	} else {
		endpoint.port = "8081";
	}
	endpoint.pathname = "/sea/websocket";
	endpoint.search = "";
	endpoint.hash = "";
	return endpoint.href;
}

function documentIdToHash(documentId: Uint8Array): string {
	return Array.from(documentId, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function documentIdFromHash(): Uint8Array | undefined {
	const hash = globalThis.location.hash.slice(1);
	if (hash.length === 0) {
		return undefined;
	}
	if (hash.length % 2 !== 0 || !/^[\da-f]+$/iu.test(hash)) {
		throw new Error("Invalid SEA document ID in URL hash. Expected hexadecimal bytes.");
	}
	return Uint8Array.from(hash.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
}

async function waitForPeer(
	source: DirectSharedTreeClient,
	peer: DirectSharedTreeClient,
): Promise<void> {
	await source.waitForIdle();
	const deadline = performance.now() + 10_000;
	while (peer.lastAppliedSequenceNumber < source.lastAppliedSequenceNumber) {
		if (performance.now() >= deadline) {
			throw new Error("Direct SEA SharedTree peer did not converge");
		}
		await peer.waitForIdle();
		await new Promise((resolve) => setTimeout(resolve, 0));
	}
}

async function createDirectClient(
	openSession: SeaSessionFactory,
	documentId: Uint8Array,
	createDocument: boolean,
): Promise<DirectSharedTreeClient> {
	return DirectSharedTreeClient.create(
		new SeaSessionDriverClient(openSession, "seaSelected", {
			loadingHint: { includeDescendantBlobs: true, maxExtraItems: 256 },
		}),
		documentId,
		subscriptionBatchMaxOperations,
		subscriptionBatchMaxPayloadBytes,
		createDocument,
	);
}

async function initSea(): Promise<{
	documentId: Uint8Array;
	initialUsers: UserView[];
	connectUser: ConnectUser;
}> {
	const openSession: SeaSessionFactory = async (document, options) =>
		openRemote({ mode: "WebSocket", websocketUrl: getSeaWebSocketUrl() }, document, options);
	const requestedDocumentId = documentIdFromHash();
	const createDocument = requestedDocumentId === undefined;
	const firstClient = await createDirectClient(
		openSession,
		requestedDocumentId ?? new Uint8Array(),
		createDocument,
	);
	const firstTreeView = asAlpha(firstClient.tree.viewWith(treeConfig));
	if (createDocument) {
		firstTreeView.initialize(createInitialRoot());
		await firstClient.waitForIdle();
		globalThis.history.replaceState(
			undefined,
			"",
			`${globalThis.location.pathname}${globalThis.location.search}#${documentIdToHash(firstClient.documentId)}`,
		);
	}

	const connectUser: ConnectUser = async (targetDocumentId) => {
		const client = await createDirectClient(openSession, targetDocumentId, false);
		await waitForPeer(firstClient, client);
		return {
			id: makeUserId(),
			client,
			treeView: asAlpha(client.tree.viewWith(treeConfig)),
		};
	};
	const documentId = firstClient.documentId;
	const initialUsers: UserView[] = [
		{ id: makeUserId(), client: firstClient, treeView: firstTreeView },
	];

	for (let userIndex = initialUsers.length; userIndex < initialUserCount; userIndex++) {
		initialUsers.push(await connectUser(documentId));
	}

	return { documentId, initialUsers, connectUser };
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
	client: UserView["client"];
	treeView: TreeViewAlpha<typeof TextEditorRoot>;
	/**
	 * Removes this user from the side-by-side view. Omitted when removal is not
	 * allowed (e.g. the last remaining user).
	 */
	onRemove?: () => void;
}> = ({ label, color, client, treeView, onRemove }) => {
	// A single manager per user subscribes to the branch's changed events and handles
	// all labeled undo/redo. Each editor component reads from context and scopes
	// operations to its own label.
	const manager = useMemo(() => createUndoRedo(treeView), [treeView]);

	// Cleanup a single view (user) resources on unmount
	useEffect(() => {
		return () => {
			manager.dispose();
			treeView.dispose();
			client.dispose().catch((error: unknown) => {
				console.error("Failed to dispose direct SEA SharedTree client:", error);
			});
		};
	}, [manager, treeView, client]);

	// Re-render when undo/redo availability changes. Only local commits affect the stacks,
	// so filtering to isLocal avoids re-renders on every remote keystroke.
	const [, setVersion] = useState(0);
	useEffect(() => client.onStatusChange(() => setVersion((v) => v + 1)), [client]);
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
			<div role="status" aria-label={`${label} synchronization status`}>
				{client.connectionState} · {client.pendingOperationCount} pending edits ·{" "}
				<span data-testid="summary-count">{client.summaryCount}</span> summaries
				{client.loadedFromSummary && <span> · Loaded from summary</span>}
			</div>
			{client.connectionState === "connected" ? (
				<button type="button" onClick={() => client.disconnect()}>
					Disconnect
				</button>
			) : client.connectionState === "disconnected" ? (
				<button
					type="button"
					onClick={() => {
						client.reconnect().catch((error: unknown) => {
							console.error("Failed to reconnect direct SEA client:", error);
						});
					}}
				>
					Reconnect
				</button>
			) : undefined}
			{client.connectionState !== "connected" && (
				<p>Local edits are held in this tab. Do not reload until they synchronize.</p>
			)}
			{client.lastError !== undefined && (
				<p role="alert">
					{client.lastError instanceof Error
						? client.lastError.message.split("\n", 1)[0]
						: typeof client.lastError === "string"
							? client.lastError
							: "Synchronization failed. Pending edits remain in this tab."}
				</p>
			)}
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

export const App: FC<{
	documentId: Uint8Array;
	initialUsers: UserView[];
	/**
	 * Connects a new direct SEA user to the document.
	 */
	connectUser: ConnectUser;
}> = ({ documentId, initialUsers, connectUser: connect }) => {
	const [users, setUsers] = useState<UserView[]>(initialUsers);

	const addUser = useCallback(() => {
		connect(documentId)
			.then((user) => setUsers((prev) => [...prev, user]))
			.catch((error: unknown) => console.error("Failed to add user:", error));
	}, [connect, documentId]);

	// Drop the user from the list. Its UserPanel disposes the view and direct client.
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
						client={user.client}
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
		const { documentId, initialUsers, connectUser } = await initSea();
		renderRoot(
			<App documentId={documentId} initialUsers={initialUsers} connectUser={connectUser} />,
		);
	} catch (error) {
		console.error("Failed to start:", error);
		renderRoot(<ExampleErrorView error={error} />);
	}
}

// eslint-disable-next-line unicorn/prefer-top-level-await
start().catch(console.error);
