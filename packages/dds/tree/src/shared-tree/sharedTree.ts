/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IChannelAttributes,
	IChannelFactory,
	IChannelServices,
	IChannelStorageService,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { assert, unreachableCase } from "@fluidframework/core-utils";
import { UsageError } from "@fluidframework/telemetry-utils";
import { ICodecOptions, noopValidator } from "../codec/index.js";
import {
	Compatibility,
	FieldKey,
	TreeStoredSchemaRepository,
	JsonableTree,
	TreeStoredSchema,
	makeDetachedFieldIndex,
	moveToDetachedField,
	RevisionTagCodec,
	AllowedUpdateType,
	anchorSlot,
} from "../core/index.js";
import { SharedTreeCore } from "../shared-tree-core/index.js";
import {
	defaultSchemaPolicy,
	ForestSummarizer,
	SchemaSummarizer,
	buildForest,
	FlexFieldSchema,
	buildChunkedForest,
	makeTreeChunker,
	DetachedFieldIndexSummarizer,
	createNodeKeyManager,
	nodeKeyFieldKey as defaultNodeKeyFieldKey,
	jsonableTreeFromFieldCursor,
	TreeCompressionStrategy,
	FlexTreeSchema,
	ViewSchema,
	NodeKeyManager,
	makeMitigatedChangeFamily,
	makeFieldBatchCodec,
} from "../feature-libraries/index.js";
import { HasListeners, IEmitter, ISubscribable, createEmitter } from "../events/index.js";
import { brand, disposeSymbol, fail } from "../util/index.js";
import {
	ITree,
	TreeConfiguration,
	toFlexConfig,
	ImplicitFieldSchema,
	TreeFieldFromImplicitField,
	TreeView,
	TreeViewEvents,
	getProxyForField,
	SchemaIncompatible,
} from "../simple-tree/index.js";
import {
	InitializeAndSchematizeConfiguration,
	TreeContent,
	UpdateType,
	ensureSchema,
	evaluateUpdate,
} from "./schematizedTree.js";
import { TreeCheckout, CheckoutEvents, createTreeCheckout } from "./treeCheckout.js";
import { FlexTreeView, CheckoutFlexTreeView } from "./treeView.js";
import { SharedTreeChange } from "./sharedTreeChangeTypes.js";
import { SharedTreeChangeFamily } from "./sharedTreeChangeFamily.js";
import { SharedTreeEditBuilder } from "./sharedTreeEditBuilder.js";

/**
 * Copy of data from an {@link ISharedTree} at some point in time.
 * @remarks
 * This is unrelated to Fluids concept of "snapshots".
 * @internal
 */
export interface SharedTreeContentSnapshot {
	/**
	 * The schema stored in the document.
	 *
	 * @remarks
	 * Edits to the schema can mutate the schema stored of the tree which took this snapshot (but this snapshot will remain the same)
	 * This is mainly useful for debugging cases where schematize reports an incompatible view schema.
	 */
	readonly schema: TreeStoredSchema;
	/**
	 * All {@link TreeStatus#InDocument} content.
	 */
	readonly tree: JsonableTree[];
	/**
	 * All {@link TreeStatus#Removed} content.
	 */
	readonly removed: [string | number | undefined, number, JsonableTree][];
}

/**
 * Collaboratively editable tree distributed data-structure,
 * powered by {@link @fluidframework/shared-object-base#ISharedObject}.
 *
 * See [the README](../../README.md) for details.
 * @internal
 */
export interface ISharedTree extends ISharedObject, ITree {
	/**
	 * Provides a copy of the current content of the tree.
	 * This can be useful for inspecting the tree when no suitable view schema is available.
	 * This is only intended for use in testing and exceptional code paths: it is not performant.
	 *
	 * This does not include everything that is included in a tree summary, since information about how to merge future edits is omitted.
	 */
	contentSnapshot(): SharedTreeContentSnapshot;

	/**
	 * Like {@link ITree.schematize}, but uses the flex-tree schema system and exposes the tree as a flex-tree.
	 * @privateRemarks
	 * This has to avoid its name colliding with `schematize`.
	 * TODO: Either ITree and ISharedTree should be split into separate objects, the methods should be merged or a better convention for resolving such name conflicts should be selected.
	 */
	schematizeInternal<TRoot extends FlexFieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
		onDispose?: () => void,
	): FlexTreeView<TRoot>;
}

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 *
 * TODO: detail compatibility requirements.
 */
export class SharedTree
	extends SharedTreeCore<SharedTreeEditBuilder, SharedTreeChange>
	implements ISharedTree
{
	private readonly _events: ISubscribable<CheckoutEvents> &
		IEmitter<CheckoutEvents> &
		HasListeners<CheckoutEvents>;
	public readonly checkout: TreeCheckout;
	public get storedSchema(): TreeStoredSchemaRepository {
		return this.checkout.storedSchema;
	}

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		optionsParam: SharedTreeOptions,
		telemetryContextPrefix: string,
	) {
		assert(
			runtime.idCompressor !== undefined,
			0x883 /* IdCompressor must be enabled to use SharedTree */,
		);

		const options = { ...defaultSharedTreeOptions, ...optionsParam };
		const schema = new TreeStoredSchemaRepository();
		const forest =
			options.forest === ForestType.Optimized
				? buildChunkedForest(makeTreeChunker(schema, defaultSchemaPolicy))
				: buildForest();
		const revisionTagCodec = new RevisionTagCodec(runtime.idCompressor);
		const removedRoots = makeDetachedFieldIndex("repair", revisionTagCodec, options);
		const schemaSummarizer = new SchemaSummarizer(runtime, schema, options, {
			getCurrentSeq: () => this.runtime.deltaManager.lastSequenceNumber,
		});
		const fieldBatchCodec = makeFieldBatchCodec(options);

		const encoderContext = {
			schema: {
				schema,
				policy: defaultSchemaPolicy,
			},
			encodeType: options.treeEncodeType,
		};
		const forestSummarizer = new ForestSummarizer(
			forest,
			revisionTagCodec,
			fieldBatchCodec,
			encoderContext,
			options,
		);
		const removedRootsSummarizer = new DetachedFieldIndexSummarizer(removedRoots);
		const innerChangeFamily = new SharedTreeChangeFamily(
			revisionTagCodec,
			fieldBatchCodec,
			options,
		);
		const changeFamily = makeMitigatedChangeFamily(
			innerChangeFamily,
			SharedTreeChangeFamily.emptyChange,
			(error: unknown) => {
				// TODO:6344 Add telemetry for these errors.
				// Rethrowing the error has a different effect depending on the context in which the
				// ChangeFamily was invoked:
				// - If the ChangeFamily was invoked as part of incoming op processing, rethrowing the error
				// will cause the runtime to disconnect the client, log a severe error, and not reconnect.
				// This will not cause the host application to crash because it is not on the stack at that time.
				// TODO: let the host application know that the client is now disconnected.
				// - If the ChangeFamily was invoked as part of dealing with a local change, rethrowing the
				// error will cause the host application to crash. This is not ideal, but is better than
				// letting the application either send an invalid change to the server or allowing the
				// application to continue working when its local branches contain edits that cannot be
				// reflected in its views.
				// The best course of action for a host application in such a state is to restart.
				// TODO: let the host application know about this situation and provide a way to
				// programmatically reload the SharedTree container.
				throw error;
			},
		);
		super(
			[schemaSummarizer, forestSummarizer, removedRootsSummarizer],
			changeFamily,
			options,
			id,
			runtime,
			attributes,
			telemetryContextPrefix,
		);
		this._events = createEmitter<CheckoutEvents>();
		const localBranch = this.getLocalBranch();
		this.checkout = createTreeCheckout(runtime.idCompressor, revisionTagCodec, {
			branch: localBranch,
			changeFamily,
			schema,
			forest,
			fieldBatchCodec,
			events: this._events,
			removedRoots,
		});
	}

	/**
	 * Like {@link ISharedTree.schematizeInternal}, but will never modify the document.
	 * Intended for tests that don't need to handle (but should detect and fail on) out of schema cases.
	 *
	 * @param schema - The view schema to use.
	 * @param onDispose - A callback.
	 * Invoked when the returned ISharedTreeView becomes invalid to use due to a change to the stored schema which makes it incompatible with the view schema.
	 * Called at most once.
	 * @returns a view compatible with the provided schema, or undefined if the stored schema is not compatible with the provided view schema.
	 * If this becomes invalid to use due to a change in the stored schema, onDispose will be invoked.
	 */
	public requireSchema<TRoot extends FlexFieldSchema>(
		schema: FlexTreeSchema<TRoot>,
		onDispose: () => void,
		nodeKeyManager?: NodeKeyManager,
		nodeKeyFieldKey?: FieldKey,
	): CheckoutFlexTreeView<TRoot> {
		const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, schema);
		return requireSchema(
			this.checkout,
			viewSchema,
			onDispose,
			nodeKeyManager ?? createNodeKeyManager(this.runtime.idCompressor),
			nodeKeyFieldKey ?? brand(defaultNodeKeyFieldKey),
		);
	}

	public contentSnapshot(): SharedTreeContentSnapshot {
		const cursor = this.checkout.forest.allocateCursor();
		try {
			moveToDetachedField(this.checkout.forest, cursor);
			return {
				schema: this.storedSchema.clone(),
				tree: jsonableTreeFromFieldCursor(cursor),
				removed: this.checkout.getRemovedRoots(),
			};
		} finally {
			cursor.free();
		}
	}

	public schematizeInternal<TRoot extends FlexFieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
		onDispose?: () => void,
		nodeKeyManager?: NodeKeyManager,
		nodeKeyFieldKey?: FieldKey,
	): CheckoutFlexTreeView<TRoot> {
		const slots = this.checkout.forest.anchors.slots;
		if (slots.has(ViewSlot)) {
			throw new UsageError(
				"Only one view can be constructed from a given tree at a time. Dispose of the first before creating a second.",
			);
		}

		// TODO: support adapters and include them here.

		const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, config.schema);
		if (!ensureSchema(viewSchema, config.allowedSchemaModifications, this.checkout, config)) {
			fail("Schematize failed");
		}

		return requireSchema(
			this.checkout,
			viewSchema,
			onDispose ?? (() => {}),
			nodeKeyManager ?? createNodeKeyManager(this.runtime.idCompressor),
			nodeKeyFieldKey ?? brand(defaultNodeKeyFieldKey),
		);
	}

	public schematize<TRoot extends ImplicitFieldSchema>(
		config: TreeConfiguration<TRoot>,
	): TreeView<TreeFieldFromImplicitField<TRoot>> {
		const view = new TrySchematizeTreeView(
			this.checkout,
			config,
			createNodeKeyManager(this.runtime.idCompressor),
			brand(defaultNodeKeyFieldKey),
		);
		// As a subjective API design choice, we initialize the tree here if it is not already initialized.
		if (view.error?.canInitialize === true) {
			view.upgradeSchema();
		}
		return view;
	}

	protected override async loadCore(services: IChannelStorageService): Promise<void> {
		await super.loadCore(services);
		this._events.emit("afterBatch");
	}
}

/**
 * Creating multiple flex tree contexts for the same branch, and thus with the same underlying AnchorSet does not work due to how TreeNode caching works.
 * This slot is used to detect if one already exists and error if creating a second.
 *
 * TODO:
 * 1. API docs need to reflect this limitation or the limitation has to be removed.
 */
const ViewSlot = anchorSlot<CheckoutFlexTreeView<any>>();

function requireSchema<TRoot extends FlexFieldSchema>(
	checkout: TreeCheckout,
	viewSchema: ViewSchema<TRoot>,
	onDispose: () => void,
	nodeKeyManager: NodeKeyManager,
	nodeKeyFieldKey: FieldKey,
): CheckoutFlexTreeView<TRoot> {
	const slots = checkout.forest.anchors.slots;
	assert(!slots.has(ViewSlot), "Cannot create second view from checkout");

	{
		const compatibility = viewSchema.checkCompatibility(checkout.storedSchema);
		if (
			compatibility.write !== Compatibility.Compatible ||
			compatibility.read !== Compatibility.Compatible
		) {
			fail("ensureSchema didn't result in valid schema");
		}
	}

	const view = new CheckoutFlexTreeView(
		checkout,
		viewSchema.schema,
		nodeKeyManager,
		nodeKeyFieldKey,
		() => {
			const deleted = slots.delete(ViewSlot);
			assert(deleted, "unexpected dispose");
			onDispose();
		},
	);
	assert(!slots.has(ViewSlot), "Cannot create second view from checkout");
	slots.set(ViewSlot, view);

	const unregister = checkout.storedSchema.on("afterSchemaChange", () => {
		const compatibility = viewSchema.checkCompatibility(checkout.storedSchema);
		if (
			compatibility.write !== Compatibility.Compatible ||
			compatibility.read !== Compatibility.Compatible
		) {
			unregister();
			view[disposeSymbol]();
		}
	});

	return view;
}
/**
 * @internal
 */
export interface SharedTreeOptions extends Partial<ICodecOptions> {
	/**
	 * The {@link ForestType} indicating which forest type should be created for the SharedTree.
	 */
	forest?: ForestType;
	treeEncodeType?: TreeCompressionStrategy;
}

/**
 * Used to distinguish between different forest types.
 * @internal
 */
export enum ForestType {
	/**
	 * The "ObjectForest" forest type.
	 */
	Reference = 0,
	/**
	 * The "ChunkedForest" forest type.
	 */
	Optimized = 1,
}

export const defaultSharedTreeOptions: Required<SharedTreeOptions> = {
	jsonValidator: noopValidator,
	forest: ForestType.Reference,
	treeEncodeType: TreeCompressionStrategy.Compressed,
};

/**
 * A channel factory that creates {@link ISharedTree}s.
 * @internal
 */
export class SharedTreeFactory implements IChannelFactory {
	public readonly type: string = "https://graph.microsoft.com/types/tree";

	public readonly attributes: IChannelAttributes = {
		type: this.type,
		snapshotFormatVersion: "0.0.0",
		packageVersion: "0.0.0",
	};

	public constructor(private readonly options: SharedTreeOptions = {}) {}

	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<ISharedTree> {
		const tree = new SharedTree(id, runtime, channelAttributes, this.options, "SharedTree");
		await tree.load(services);
		return tree;
	}

	public create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree {
		const tree = new SharedTree(id, runtime, this.attributes, this.options, "SharedTree");
		tree.initializeLocal();
		return tree;
	}
}

/**
 * Implementation of TreeView wrapping a FlexTreeView.
 */
export class TrySchematizeTreeView<in out TRootSchema extends ImplicitFieldSchema>
	implements TreeView<TreeFieldFromImplicitField<TRootSchema>>
{
	/**
	 * In one of three states:
	 * 1. Valid: A checkout is present, not disposed, and it's stored schema and view schema are compatible.
	 * 2. SchematizeError: stored schema and view schema are not compatible.
	 * 3. disposed: `view` is undefined, and using this object will error. Some methods also transiently leave view undefined.
	 */
	private view: CheckoutFlexTreeView<FlexFieldSchema> | SchematizeError | undefined;
	private readonly flexConfig: TreeContent;
	public readonly events: ISubscribable<TreeViewEvents> &
		IEmitter<TreeViewEvents> &
		HasListeners<TreeViewEvents> = createEmitter();

	private readonly viewSchema: ViewSchema;

	private updating = false;
	private disposed = false;

	// TODO: fix typing so this can be `TreeNode | undefined`
	private lastRoot: unknown;

	public constructor(
		public readonly checkout: TreeCheckout,
		public readonly config: TreeConfiguration<TRootSchema>,
		public readonly nodeKeyManager: NodeKeyManager,
		public readonly nodeKeyFieldKey: FieldKey,
	) {
		this.flexConfig = toFlexConfig(config);
		this.viewSchema = new ViewSchema(defaultSchemaPolicy, {}, this.flexConfig.schema);
		this.update();
	}

	public upgradeSchema(): void {
		// Errors if disposed.
		const error = this.error;

		// No-op non error state.
		if (error === undefined) {
			return;
		}

		if (this.error?.canUpgrade !== true) {
			throw new UsageError(
				"Existing stored schema can not be upgraded (see TreeView.canUpgrade).",
			);
		}

		const result = ensureSchema(
			this.viewSchema,
			// eslint-disable-next-line no-bitwise
			AllowedUpdateType.SchemaCompatible | AllowedUpdateType.Initialize,
			this.checkout,
			this.flexConfig,
		);
		assert(result, "Schema upgrade should always work if canUpgrade is set.");
	}

	/**
	 * undefined if disposed.
	 */
	public getViewOrError(): CheckoutFlexTreeView<FlexFieldSchema> | SchematizeError {
		if (this.disposed) {
			throw new UsageError("Accessed a disposed TreeView.");
		}
		assert(this.view !== undefined, "unexpected getViewOrError");
		return this.view;
	}

	public update(): void {
		if (this.updating) {
			return;
		}
		this.updating = true;
		const compatibility = evaluateUpdate(
			this.viewSchema,
			// eslint-disable-next-line no-bitwise
			AllowedUpdateType.SchemaCompatible | AllowedUpdateType.Initialize,
			this.checkout,
		);
		this.disposeView();
		switch (compatibility) {
			case UpdateType.None: {
				// Remove event from checkout when view is disposed
				this.view = requireSchema(
					this.checkout,
					this.viewSchema,
					() => {
						assert(cleanupCheckOutEvents !== undefined, "missing cleanup");
						cleanupCheckOutEvents();
						this.view = undefined;
						if (!this.disposed) {
							this.update();
						}
					},
					this.nodeKeyManager,
					this.nodeKeyFieldKey,
				);
				this.lastRoot = this.root;
				// TODO: trigger "rootChanged" if the root changes in the future.
				// Currently there is no good way to do this as FlexTreeField has no events for changes.
				// this.view.flexTree.on(????)
				// As a workaround for the above, trigger "rootChanged" in "afterBatch"
				// which isn't the correct time since we normally do events during the batch when the forest is modified, but its better than nothing.
				const cleanupCheckOutEvents = this.checkout.events.on("afterBatch", () => {
					if (this.lastRoot !== this.root) {
						this.lastRoot = this.root;
						this.events.emit("rootChanged");
					}
				});
				break;
			}
			case UpdateType.Incompatible:
			case UpdateType.Initialize:
			case UpdateType.SchemaCompatible: {
				this.view = new SchematizeError(compatibility);
				this.lastRoot = undefined;
				const unregister = this.checkout.storedSchema.on("afterSchemaChange", () => {
					unregister();
					this.update();
				});
				break;
			}
			default: {
				unreachableCase(compatibility);
			}
		}

		this.updating = false;
		this.events.emit("rootChanged");
	}

	private disposeView(): void {
		if (this.view !== undefined && !(this.view instanceof SchematizeError)) {
			this.view[disposeSymbol]();
			this.view = undefined;
		}
	}

	public get error(): SchematizeError | undefined {
		const view = this.getViewOrError();
		return view instanceof SchematizeError ? view : undefined;
	}

	public [disposeSymbol](): void {
		this.getViewOrError();
		this.disposed = true;
		this.disposeView();
	}

	public get root(): TreeFieldFromImplicitField<TRootSchema> {
		const view = this.getViewOrError();
		if (view instanceof SchematizeError) {
			throw new UsageError(
				"Document is out of schema. Check TreeView.error before accessing TreeView.root.",
			);
		}
		return getProxyForField(view.flexTree) as TreeFieldFromImplicitField<TRootSchema>;
	}
}

class SchematizeError implements SchemaIncompatible {
	public constructor(public readonly updateType: UpdateType) {}

	public get canUpgrade(): boolean {
		return (
			this.updateType === UpdateType.Initialize ||
			this.updateType === UpdateType.SchemaCompatible
		);
	}

	public get canInitialize(): boolean {
		return this.updateType === UpdateType.Initialize;
	}
}
