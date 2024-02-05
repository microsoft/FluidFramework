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
import { assert } from "@fluidframework/core-utils";
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
	rootFieldKey,
	schemaDataIsEmpty,
	RevisionTagCodec,
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
	nodeKeyFieldKey as defailtNodeKeyFieldKey,
	jsonableTreeFromFieldCursor,
	TreeCompressionStrategy,
	FlexTreeSchema,
	ViewSchema,
	NodeKeyManager,
	FieldKinds,
	normalizeNewFieldContent,
	makeMitigatedChangeFamily,
	makeFieldBatchCodec,
} from "../feature-libraries/index.js";
import { HasListeners, IEmitter, ISubscribable, createEmitter } from "../events/index.js";
import { brand, disposeSymbol, fail } from "../util/index.js";
import {
	ITree,
	TreeConfiguration,
	WrapperTreeView,
	toFlexConfig,
	ImplicitFieldSchema,
	TreeFieldFromImplicitField,
	TreeView,
} from "../simple-tree/index.js";
import {
	InitializeAndSchematizeConfiguration,
	afterSchemaChanges,
	initializeContent,
	schematize,
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
	): FlexTreeView<TRoot>;

	/**
	 * Like {@link ISharedTree.schematizeInternal}, but will never modify the document.
	 *
	 * @param schema - The view schema to use.
	 * @param onSchemaIncompatible - A callback.
	 * Invoked when the returned ISharedTreeView becomes invalid to use due to a change to the stored schema which makes it incompatible with the view schema.
	 * Called at most once.
	 * @returns a view compatible with the provided schema, or undefined if the stored schema is not compatible with the provided view schema.
	 * If this becomes invalid to use due to a change in the stored schema, onSchemaIncompatible will be invoked.
	 *
	 * @privateRemarks
	 * TODO:
	 * Once views actually have a view schema, onSchemaIncompatible can become an event on the view (which ends its lifetime),
	 * instead of a separate callback.
	 */
	requireSchema<TRoot extends FlexFieldSchema>(
		schema: FlexTreeSchema<TRoot>,
		onSchemaIncompatible: () => void,
	): FlexTreeView<TRoot> | undefined;
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

	/**
	 * Creating multiple editable tree contexts for the same branch, and thus with the same underlying AnchorSet does not work due to how TreeNode caching works.
	 * This flag is used to detect if one already exists for the main branch and error if creating a second.
	 * THis should catch most accidental violations of this restriction but there are still ways to create two conflicting contexts (for example calling constructing one manually).
	 *
	 * TODO:
	 * 1. API docs need to reflect this limitation or the limitation has to be removed.
	 */
	private hasView = false;

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
			options.treeEncodeType,
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
			{ schema, policy: defaultSchemaPolicy },
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
			chunkCompressionStrategy: options.treeEncodeType,
		});
	}

	public requireSchema<TRoot extends FlexFieldSchema>(
		schema: FlexTreeSchema<TRoot>,
		onSchemaIncompatible: () => void,
		nodeKeyManager?: NodeKeyManager,
		nodeKeyFieldKey?: FieldKey,
	): CheckoutFlexTreeView<TRoot> | undefined {
		assert(this.hasView === false, 0x7f1 /* Cannot create second view from tree. */);

		const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, schema);
		const compatibility = viewSchema.checkCompatibility(this.storedSchema);
		if (
			compatibility.write !== Compatibility.Compatible ||
			compatibility.read !== Compatibility.Compatible
		) {
			return undefined;
		}

		this.hasView = true;
		const view = new CheckoutFlexTreeView(
			this.checkout,
			schema,
			nodeKeyManager ?? createNodeKeyManager(this.runtime.idCompressor),
			nodeKeyFieldKey ?? brand(defailtNodeKeyFieldKey),
			() => {
				assert(this.hasView, 0x7f2 /* unexpected dispose */);
				this.hasView = false;
			},
		);
		const onSchemaChange = () => {
			const compatibilityInner = viewSchema.checkCompatibility(this.storedSchema);
			if (
				compatibilityInner.write !== Compatibility.Compatible ||
				compatibilityInner.read !== Compatibility.Compatible
			) {
				view[disposeSymbol]();
				onSchemaIncompatible();
				return false;
			} else {
				return true;
			}
		};

		afterSchemaChanges(this._events, this.checkout, onSchemaChange);
		return view;
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
		nodeKeyManager?: NodeKeyManager,
		nodeKeyFieldKey?: FieldKey,
	): CheckoutFlexTreeView<TRoot> {
		if (this.hasView === true) {
			throw new UsageError(
				"Only one view can be constructed from a given tree at a time. Dispose of the first before creating a second.",
			);
		}
		// TODO:
		// When this becomes a more proper out of schema adapter, editing should be made lazy.
		// This will improve support for readonly documents, cross version collaboration and attribution.

		// Check for empty.
		if (this.checkout.forest.isEmpty && schemaDataIsEmpty(this.storedSchema)) {
			this.checkout.transaction.start();
			initializeContent(this.checkout, config.schema, () => {
				const field = { field: rootFieldKey, parent: undefined };
				const content = normalizeNewFieldContent(
					{ schema: config.schema },
					config.schema.rootFieldSchema,
					config.initialTree,
				);
				switch (this.storedSchema.rootFieldSchema.kind.identifier) {
					case FieldKinds.optional.identifier: {
						const fieldEditor = this.editor.optionalField(field);
						assert(
							content.getFieldLength() <= 1,
							0x7f4 /* optional field content should normalize at most one item */,
						);
						fieldEditor.set(content.getFieldLength() === 0 ? undefined : content, true);
						break;
					}
					case FieldKinds.sequence.identifier: {
						const fieldEditor = this.editor.sequenceField(field);
						// TODO: should do an idempotent edit here.
						fieldEditor.insert(0, content);
						break;
					}
					default: {
						fail("unexpected root field kind during initialize");
					}
				}
			});
			this.checkout.transaction.commit();
		}

		schematize(this.checkout.events, this.checkout, config);

		return (
			this.requireSchema(
				config.schema,
				() => fail("schema incompatible"),
				nodeKeyManager,
				nodeKeyFieldKey,
			) ?? fail("Schematize failed")
		);
	}

	public schematize<TRoot extends ImplicitFieldSchema>(
		config: TreeConfiguration<TRoot>,
	): TreeView<TreeFieldFromImplicitField<TRoot>> {
		const flexConfig = toFlexConfig(config);
		const view = this.schematizeInternal(flexConfig);
		return new WrapperTreeView(view);
	}

	protected override async loadCore(services: IChannelStorageService): Promise<void> {
		await super.loadCore(services);
		this._events.emit("afterBatch");
	}
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
