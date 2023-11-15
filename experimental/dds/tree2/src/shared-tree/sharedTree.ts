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
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { assert } from "@fluidframework/core-utils";
import { ICodecOptions, noopValidator } from "../codec";
import {
	Compatibility,
	FieldKey,
	InMemoryStoredSchemaRepository,
	JsonableTree,
	TreeStoredSchema,
	makeDetachedFieldIndex,
	moveToDetachedField,
	rootFieldKey,
	schemaDataIsEmpty,
} from "../core";
import { SharedTreeCore } from "../shared-tree-core";
import {
	defaultSchemaPolicy,
	ForestSummarizer,
	SchemaSummarizer as SchemaSummarizer,
	DefaultChangeFamily,
	DefaultEditBuilder,
	DefaultChangeset,
	buildForest,
	SchemaEditor,
	TreeFieldSchema,
	buildChunkedForest,
	makeTreeChunker,
	DetachedFieldIndexSummarizer,
	createNodeKeyManager,
	nodeKeyFieldKey as defailtNodeKeyFieldKey,
	jsonableTreeFromFieldCursor,
	TreeCompressionStrategy,
	TreeSchema,
	ViewSchema,
	NodeKeyManager,
	FieldKinds,
	normalizeNewFieldContent,
	ProxyRoot,
	getProxyForField,
	ProxyField,
} from "../feature-libraries";
import { HasListeners, IEmitter, ISubscribable, createEmitter } from "../events";
import { JsonCompatibleReadOnly, brand, disposeSymbol, fail } from "../util";
import { TreeView, type ITree } from "./simpleTree";
import {
	InitializeAndSchematizeConfiguration,
	afterSchemaChanges,
	initializeContent,
	schematize,
} from "./schematizedTree";
import { TreeCheckout, CheckoutEvents, createTreeCheckout } from "./treeCheckout";
import { FlexTreeView, CheckoutFlexTreeView } from "./treeView";

/**
 * Copy of data from an {@link ISharedTree} at some point in time.
 * @remarks
 * This is unrelated to Fluids concept of "snapshots".
 * @alpha
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
}

/**
 * Collaboratively editable tree distributed data-structure,
 * powered by {@link @fluidframework/shared-object-base#ISharedObject}.
 *
 * See [the README](../../README.md) for details.
 * @alpha
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
	 * Like {@link ITree.schematize}, but returns a more powerful type exposing more package internal information.
	 * @privateRemarks
	 * This has to avoid its name colliding with `schematize`.
	 * TODO: Either ITree and ISharedTree should be split into separate objects, the methods should be merged or a better convention for resolving such name conflicts should be selected.
	 */
	schematizeInternal<TRoot extends TreeFieldSchema>(
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
	requireSchema<TRoot extends TreeFieldSchema>(
		schema: TreeSchema<TRoot>,
		onSchemaIncompatible: () => void,
	): FlexTreeView<TRoot> | undefined;
}

/**
 * Shared tree, configured with a good set of indexes and field kinds which will maintain compatibility over time.
 *
 * TODO: detail compatibility requirements.
 */
export class SharedTree
	extends SharedTreeCore<DefaultEditBuilder, DefaultChangeset>
	implements ISharedTree
{
	private readonly _events: ISubscribable<CheckoutEvents> &
		IEmitter<CheckoutEvents> &
		HasListeners<CheckoutEvents>;
	public readonly view: TreeCheckout;
	public readonly storedSchema: SchemaEditor<InMemoryStoredSchemaRepository>;

	/**
	 * Creating multiple editable tree contexts for the same branch, and thus with the same underlying AnchorSet does not work due to how TreeNode caching works.
	 * This flag is used to detect if one already exists for the main branch and error if creating a second.
	 * THis should catch most accidental violations of this restriction but there are still ways to create two conflicting contexts (for example calling constructing one manually).
	 *
	 * TODO:
	 * 1. API docs need to reflect this limitation or the limitation has to be removed.
	 */
	private hasView2 = false;

	public constructor(
		id: string,
		runtime: IFluidDataStoreRuntime,
		attributes: IChannelAttributes,
		optionsParam: SharedTreeOptions,
		telemetryContextPrefix: string,
	) {
		const options = { ...defaultSharedTreeOptions, ...optionsParam };
		const schema = new InMemoryStoredSchemaRepository();
		const forest =
			options.forest === ForestType.Optimized
				? buildChunkedForest(makeTreeChunker(schema, defaultSchemaPolicy))
				: buildForest();
		const removedTrees = makeDetachedFieldIndex("repair", options);
		const schemaSummarizer = new SchemaSummarizer(runtime, schema, options);
		const forestSummarizer = new ForestSummarizer(
			forest,
			schema,
			defaultSchemaPolicy,
			options.summaryEncodeType,
		);
		const removedTreesSummarizer = new DetachedFieldIndexSummarizer(removedTrees);
		const changeFamily = new DefaultChangeFamily(options);
		super(
			[schemaSummarizer, forestSummarizer, removedTreesSummarizer],
			changeFamily,
			options,
			id,
			runtime,
			attributes,
			telemetryContextPrefix,
		);
		this.storedSchema = new SchemaEditor(schema, (op) => this.submitLocalMessage(op), options);
		this._events = createEmitter<CheckoutEvents>();
		this.view = createTreeCheckout({
			branch: this.getLocalBranch(),
			// TODO:
			// This passes in a version of schema thats not wrapped with the editor.
			// This allows editing schema on the view without sending ops, which is incorrect behavior.
			schema,
			forest,
			events: this._events,
			removedTrees,
		});
	}

	public requireSchema<TRoot extends TreeFieldSchema>(
		schema: TreeSchema<TRoot>,
		onSchemaIncompatible: () => void,
		nodeKeyManager?: NodeKeyManager,
		nodeKeyFieldKey?: FieldKey,
	): CheckoutFlexTreeView<TRoot> | undefined {
		assert(this.hasView2 === false, "Cannot create second view from tree.");

		const viewSchema = new ViewSchema(defaultSchemaPolicy, {}, schema);
		const compatibility = viewSchema.checkCompatibility(this.storedSchema);
		if (
			compatibility.write !== Compatibility.Compatible ||
			compatibility.read !== Compatibility.Compatible
		) {
			return undefined;
		}

		this.hasView2 = true;
		const view2 = new CheckoutFlexTreeView(
			this.view,
			schema,
			nodeKeyManager ?? createNodeKeyManager(this.runtime.idCompressor),
			nodeKeyFieldKey ?? brand(defailtNodeKeyFieldKey),
			() => {
				assert(this.hasView2, "unexpected dispose");
				this.hasView2 = false;
			},
		);
		const onSchemaChange = () => {
			const compatibilityInner = viewSchema.checkCompatibility(this.storedSchema);
			if (
				compatibilityInner.write !== Compatibility.Compatible ||
				compatibilityInner.read !== Compatibility.Compatible
			) {
				view2[disposeSymbol]();
				onSchemaIncompatible();
				return false;
			} else {
				return true;
			}
		};

		afterSchemaChanges(this._events, this.storedSchema, onSchemaChange);
		return view2;
	}

	public contentSnapshot(): SharedTreeContentSnapshot {
		const cursor = this.view.forest.allocateCursor();
		try {
			moveToDetachedField(this.view.forest, cursor);
			return {
				schema: new InMemoryStoredSchemaRepository(this.storedSchema),
				tree: jsonableTreeFromFieldCursor(cursor),
			};
		} finally {
			cursor.free();
		}
	}

	public schematizeInternal<TRoot extends TreeFieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
		nodeKeyManager?: NodeKeyManager,
		nodeKeyFieldKey?: FieldKey,
	): CheckoutFlexTreeView<TRoot> {
		assert(this.hasView2 === false, "Cannot create second view from tree.");
		// TODO:
		// When this becomes a more proper out of schema adapter, editing should be made lazy.
		// This will improve support for readonly documents, cross version collaboration and attribution.

		// Check for empty.
		if (this.view.forest.isEmpty && schemaDataIsEmpty(this.storedSchema)) {
			this.view.transaction.start();
			initializeContent(this.storedSchema, config.schema, () => {
				const field = { field: rootFieldKey, parent: undefined };
				const content = normalizeNewFieldContent(
					{ schema: this.storedSchema },
					this.storedSchema.rootFieldSchema,
					config.initialTree,
				);
				switch (this.storedSchema.rootFieldSchema.kind.identifier) {
					case FieldKinds.optional.identifier: {
						const fieldEditor = this.editor.optionalField(field);
						assert(
							content.length <= 1,
							"optional field content should normalize at most one item",
						);
						fieldEditor.set(content.length === 0 ? undefined : content[0], true);
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
			this.view.transaction.commit();
		}

		schematize(this.view.events, this.storedSchema, config);

		return (
			this.requireSchema(
				config.schema,
				() => fail("schema incompatible"),
				nodeKeyManager,
				nodeKeyFieldKey,
			) ?? fail("Schematize failed")
		);
	}

	public schematize<TRoot extends TreeFieldSchema>(
		config: InitializeAndSchematizeConfiguration<TRoot>,
	): TreeView<ProxyRoot<TreeSchema<TRoot>>> {
		const view = this.schematizeInternal(config);
		return new WrapperTreeView(view);
	}

	/**
	 * TODO: Shared tree needs a pattern for handling non-changeset operations.
	 * Whatever pattern is adopted should probably also handle multiple versions of changeset operations.
	 * A single top level enum listing all ops (including their different versions),
	 * with at least fine grained enough detail to direct them to the correct subsystem would be a good approach.
	 * The current use-case (with an op applying to a specific index) is a temporary hack,
	 * and its not clear how it would fit into such a system if implemented in shared-tree-core:
	 * maybe op dispatch is part of the shared-tree level?
	 */
	protected override processCore(
		message: ISequencedDocumentMessage,
		local: boolean,
		localOpMetadata: unknown,
	) {
		// TODO: Get rid of this `as any`. There should be a better way to narrow the type of message.contents.
		if (!this.storedSchema.tryHandleOp(message.contents as any)) {
			super.processCore(message, local, localOpMetadata);
		}
	}

	protected override reSubmitCore(
		content: JsonCompatibleReadOnly,
		localOpMetadata: unknown,
	): void {
		if (!this.storedSchema.tryResubmitOp(content)) {
			super.reSubmitCore(content, localOpMetadata);
		}
	}

	protected override applyStashedOp(content: JsonCompatibleReadOnly): undefined {
		if (!this.storedSchema.tryApplyStashedOp(content)) {
			return super.applyStashedOp(content);
		}
	}

	protected override async loadCore(services: IChannelStorageService): Promise<void> {
		await super.loadCore(services);
		this._events.emit("afterBatch");
	}
}

/**
 * @alpha
 */
export interface SharedTreeOptions extends Partial<ICodecOptions> {
	/**
	 * The {@link ForestType} indicating which forest type should be created for the SharedTree.
	 */
	forest?: ForestType;
	summaryEncodeType?: TreeCompressionStrategy;
}

/**
 * Used to distinguish between different forest types.
 * @alpha
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

// TODO: The default summaryEncodeType is set to Uncompressed as there are many out of schema tests that break when using Compressed.
// This should eventually be changed to use Compressed as the default tree compression strategy so production gets the compressed format.
export const defaultSharedTreeOptions: Required<SharedTreeOptions> = {
	jsonValidator: noopValidator,
	forest: ForestType.Reference,
	summaryEncodeType: TreeCompressionStrategy.Uncompressed,
};

/**
 * A channel factory that creates {@link ISharedTree}s.
 * @alpha
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
export class WrapperTreeView<
	in out TRoot extends TreeFieldSchema,
	TView extends FlexTreeView<TRoot>,
> implements TreeView<ProxyField<TRoot>>
{
	public constructor(public readonly view: TView) {}

	public [disposeSymbol](): void {
		this.view[disposeSymbol]();
	}

	public get events(): ISubscribable<CheckoutEvents> {
		return this.view.checkout.events;
	}

	public get root(): ProxyRoot<TreeSchema<TRoot>> {
		return getProxyForField(this.view.editableTree);
	}
}
