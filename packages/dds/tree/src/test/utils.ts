/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { LocalServerTestDriver } from "@fluid-private/test-drivers";
import { IContainer } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import {
	IChannelAttributes,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import {
	ITestObjectProvider,
	ChannelFactoryRegistry,
	TestObjectProvider,
	TestContainerRuntimeFactory,
	TestFluidObjectFactory,
	ITestFluidObject,
	createSummarizer,
	summarizeNow,
	ITestContainerConfig,
	SummaryInfo,
} from "@fluidframework/test-utils";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { ISummarizer } from "@fluidframework/container-runtime";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import {
	IIdCompressor,
	IIdCompressorCore,
	IdCreationRange,
	OpSpaceCompressedId,
	SerializedIdCompressor,
	SerializedIdCompressorWithNoSession,
	SerializedIdCompressorWithOngoingSession,
	SessionId,
	SessionSpaceCompressedId,
	StableId,
	createIdCompressor,
} from "@fluidframework/id-compressor";
import { makeRandom } from "@fluid-private/stochastic-test-utils";
import {
	ISharedTree,
	ITreeCheckout,
	SharedTreeFactory,
	TreeContent,
	CheckoutEvents,
	createTreeCheckout,
	SharedTree,
	InitializeAndSchematizeConfiguration,
	SharedTreeContentSnapshot,
	CheckoutFlexTreeView,
} from "../shared-tree/index.js";
import {
	buildForest,
	createMockNodeKeyManager,
	TreeFieldSchema,
	jsonableTreeFromFieldCursor,
	mapFieldChanges,
	mapFieldsChanges,
	mapMarkList,
	mapTreeFromCursor,
	nodeKeyFieldKey as nodeKeyFieldKeyDefault,
	NodeKeyManager,
	normalizeNewFieldContent,
	FlexTreeTypedField,
	jsonableTreeFromForest,
	nodeKeyFieldKey as defaultNodeKeyFieldKey,
	ContextuallyTypedNodeData,
	mapRootChanges,
	intoStoredSchema,
	cursorForMapTreeNode,
} from "../feature-libraries/index.js";
import {
	moveToDetachedField,
	mapCursorField,
	JsonableTree,
	TreeStoredSchema,
	rootFieldKey,
	compareUpPaths,
	UpPath,
	clonePath,
	ChangeFamilyEditor,
	ChangeFamily,
	TaggedChange,
	FieldUpPath,
	TreeStoredSchemaRepository,
	initializeForest,
	AllowedUpdateType,
	IEditableForest,
	DeltaVisitor,
	DetachedFieldIndex,
	AnnouncedVisitor,
	applyDelta,
	makeDetachedFieldIndex,
	announceDelta,
	FieldKey,
	Revertible,
	RevertibleKind,
	RevisionMetadataSource,
	revisionMetadataSourceFromInfo,
	RevisionInfo,
	RevisionTag,
	DeltaFieldChanges,
	DeltaMark,
	DeltaFieldMap,
	DeltaRoot,
} from "../core/index.js";
import { JsonCompatible, brand, nestedMapFromFlatList } from "../util/index.js";
import { ICodecFamily, IJsonCodec, withSchemaValidation } from "../codec/index.js";
import { typeboxValidator } from "../external-utilities/index.js";
import {
	cursorToJsonObject,
	jsonRoot,
	jsonSchema,
	singleJsonCursor,
	SchemaBuilder,
	leaf,
} from "../domains/index.js";
import { HasListeners, IEmitter, ISubscribable } from "../events/index.js";
// eslint-disable-next-line import/no-internal-modules
import { makeSchemaCodec } from "../feature-libraries/schema-index/codec.js";

// Testing utilities

const frozenMethod = () => {
	assert.fail("Object is frozen");
};

function freezeObjectMethods<T>(object: T, methods: (keyof T)[]): void {
	if (Object.isFrozen(object)) {
		for (const method of methods) {
			assert.equal(object[method], frozenMethod);
		}
	} else {
		for (const method of methods) {
			Object.defineProperty(object, method, {
				enumerable: false,
				configurable: false,
				writable: false,
				value: frozenMethod,
			});
		}
	}
}

/**
 * A {@link IJsonCodec} implementation which fails on encode and decode.
 *
 * Useful for testing codecs which compose over other codecs (in cases where the "inner" codec should never be called)
 */
export const failCodec: IJsonCodec<any, any, any, any> = {
	encode: () => assert.fail("Unexpected encode"),
	decode: () => assert.fail("Unexpected decode"),
};

/**
 * Recursively freezes the given object.
 *
 * WARNING: this function mutates Map and Set instances to override their mutating methods in order to ensure that the
 * state of those instances cannot be changed. This is necessary because calling `Object.freeze` on a Set or Map does
 * not prevent it from being mutated.
 *
 * @param object - The object to freeze.
 */
export function deepFreeze<T>(object: T): void {
	if (object === undefined || object === null) {
		return;
	}
	if (object instanceof Map) {
		for (const [key, value] of object.entries()) {
			deepFreeze(key);
			deepFreeze(value);
		}
		freezeObjectMethods(object, ["set", "delete", "clear"]);
	} else if (object instanceof Set) {
		for (const key of object.keys()) {
			deepFreeze(key);
		}
		freezeObjectMethods(object, ["add", "delete", "clear"]);
	} else {
		// Retrieve the property names defined on object
		const propNames: (keyof T)[] = Object.getOwnPropertyNames(object) as (keyof T)[];
		// Freeze properties before freezing self
		for (const name of propNames) {
			const value = object[name];
			if (typeof value === "object") {
				deepFreeze(value);
			}
		}
	}
	Object.freeze(object);
}

/**
 * Manages the creation, connection, and retrieval of SharedTrees and related components for ease of testing.
 * Satisfies the {@link ITestObjectProvider} interface.
 */
export type ITestTreeProvider = TestTreeProvider & ITestObjectProvider;

export enum SummarizeType {
	onDemand = 0,
	automatic = 1,
	disabled = 2,
}

/**
 * A test helper class that manages the creation, connection and retrieval of SharedTrees. Instances of this
 * class are created via {@link TestTreeProvider.create} and satisfy the {@link ITestObjectProvider} interface.
 */
export class TestTreeProvider {
	private static readonly treeId = "TestSharedTree";

	private readonly provider: ITestObjectProvider;
	private readonly _trees: SharedTree[] = [];
	private readonly _containers: IContainer[] = [];
	private readonly summarizer?: ISummarizer;

	public get trees(): readonly SharedTree[] {
		return this._trees;
	}

	public get containers(): readonly IContainer[] {
		return this._containers;
	}

	/**
	 * Create a new {@link TestTreeProvider} with a number of trees pre-initialized.
	 * @param trees - the number of trees to initialize this provider with. This is the same as calling
	 * {@link create} followed by {@link createTree} _trees_ times.
	 * @param summarizeType - enum to manually, automatically, or disable summarization
	 * @param factory - The factory to use for creating and loading trees. See {@link SharedTreeTestFactory}.
	 *
	 * @example
	 *
	 * ```typescript
	 * const provider = await TestTreeProvider.create(2);
	 * assert(provider.trees[0].isAttached());
	 * assert(provider.trees[1].isAttached());
	 * await trees.ensureSynchronized();
	 * ```
	 */
	public static async create(
		trees = 0,
		summarizeType: SummarizeType = SummarizeType.disabled,
		factory: SharedTreeFactory = new SharedTreeFactory({ jsonValidator: typeboxValidator }),
	): Promise<ITestTreeProvider> {
		// The on-demand summarizer shares a container with the first tree, so at least one tree and container must be created right away.
		assert(
			!(trees === 0 && summarizeType === SummarizeType.onDemand),
			"trees must be >= 1 to allow summarization on demand",
		);

		const registry = [[TestTreeProvider.treeId, factory]] as ChannelFactoryRegistry;
		const driver = new LocalServerTestDriver();
		const containerRuntimeFactory = () =>
			new TestContainerRuntimeFactory(
				"@fluid-example/test-dataStore",
				new TestFluidObjectFactory(registry),
				{
					summaryOptions: {
						summaryConfigOverrides:
							summarizeType === SummarizeType.disabled
								? { state: "disabled" }
								: undefined,
					},
					enableRuntimeIdCompressor: true,
				},
			);

		const objProvider = new TestObjectProvider(Loader, driver, containerRuntimeFactory);

		if (summarizeType === SummarizeType.onDemand) {
			const container = await objProvider.makeTestContainer();
			const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
			const firstTree = await dataObject.getSharedObject<SharedTree>(TestTreeProvider.treeId);
			const { summarizer } = await createSummarizer(objProvider, container);
			const provider = new TestTreeProvider(objProvider, [
				container,
				firstTree,
				summarizer,
			]) as ITestTreeProvider;
			for (let i = 1; i < trees; i++) {
				await provider.createTree();
			}
			return provider;
		} else {
			const provider = new TestTreeProvider(objProvider) as ITestTreeProvider;
			for (let i = 0; i < trees; i++) {
				await provider.createTree();
			}
			return provider;
		}
	}

	/**
	 * Create and initialize a new {@link ISharedTree} that is connected to all other trees from this provider.
	 * @returns the tree that was created. For convenience, the tree can also be accessed via `this[i]` where
	 * _i_ is the index of the tree in order of creation.
	 */
	public async createTree(): Promise<SharedTree> {
		const configProvider = (settings: Record<string, ConfigTypes>): IConfigProviderBase => ({
			getRawConfig: (name: string): ConfigTypes => settings[name],
		});
		const testContainerConfig: ITestContainerConfig = {
			loaderProps: {
				configProvider: configProvider({
					"Fluid.Container.enableOfflineLoad": true,
				}),
			},
		};
		const container =
			this.trees.length === 0
				? await this.provider.makeTestContainer(testContainerConfig)
				: await this.provider.loadTestContainer();

		this._containers.push(container);
		const dataObject = (await container.getEntryPoint()) as ITestFluidObject;
		return (this._trees[this.trees.length] = await dataObject.getSharedObject<SharedTree>(
			TestTreeProvider.treeId,
		));
	}

	/**
	 * Give this {@link TestTreeProvider} the ability to summarize on demand during a test by creating a summarizer
	 * client for the container at the given index.  This can only be called when the summarizeOnDemand parameter
	 * was set to true when calling the create() method.
	 * @returns void after a summary has been resolved. May be called multiple times.
	 */
	public async summarize(): Promise<SummaryInfo> {
		assert(
			this.summarizer !== undefined,
			"can't summarize because summarizeOnDemand was not set to true.",
		);
		return summarizeNow(this.summarizer, "TestTreeProvider");
	}

	public [Symbol.iterator](): IterableIterator<ISharedTree> {
		return this.trees[Symbol.iterator]();
	}

	private constructor(
		provider: ITestObjectProvider,
		firstTreeParams?: [IContainer, SharedTree, ISummarizer],
	) {
		this.provider = provider;
		if (firstTreeParams !== undefined) {
			const [container, firstTree, summarizer] = firstTreeParams;
			this._containers.push(container);
			this._trees.push(firstTree);
			this.summarizer = summarizer;
		}
		return new Proxy(this, {
			get: (target, prop, receiver) => {
				// Route all properties that are on the `TestTreeProvider` itself
				if ((target as never)[prop] !== undefined) {
					return Reflect.get(target, prop, receiver) as unknown;
				}

				// Route all other properties to the `TestObjectProvider`
				return Reflect.get(this.provider, prop, receiver) as unknown;
			},
		});
	}
}

/**
 * A test helper class that creates one or more SharedTrees connected to mock services.
 */
export class TestTreeProviderLite {
	private static readonly treeId = "TestSharedTree";
	private readonly runtimeFactory = new MockContainerRuntimeFactory();
	public readonly trees: readonly SharedTree[];

	/**
	 * Create a new {@link TestTreeProviderLite} with a number of trees pre-initialized.
	 * @param trees - the number of trees created by this provider.
	 * @param factory - an optional factory to use for creating and loading trees. See {@link SharedTreeTestFactory}.
	 * @param useDeterministicSessionIds - Whether or not to deterministically generate session ids
	 * @example
	 *
	 * ```typescript
	 * const provider = new TestTreeProviderLite(2);
	 * assert(provider.trees[0].isAttached());
	 * assert(provider.trees[1].isAttached());
	 * provider.processMessages();
	 * ```
	 */
	public constructor(
		trees = 1,
		private readonly factory = new SharedTreeFactory({ jsonValidator: typeboxValidator }),
		useDeterministicSessionIds = true,
	) {
		assert(trees >= 1, "Must initialize provider with at least one tree");
		const t: SharedTree[] = [];
		const random = useDeterministicSessionIds ? makeRandom(0xdeadbeef) : makeRandom();
		for (let i = 0; i < trees; i++) {
			const sessionId = random.uuid4() as SessionId;
			const runtime = new MockFluidDataStoreRuntime({
				clientId: `test-client-${i}`,
				id: "test",
				idCompressor: createIdCompressor(sessionId),
			});
			const tree = this.factory.create(runtime, TestTreeProviderLite.treeId) as SharedTree;
			this.runtimeFactory.createContainerRuntime(runtime);
			tree.connect({
				deltaConnection: runtime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			});
			t.push(tree);
		}
		this.trees = t;
	}

	public processMessages(count?: number): void {
		this.runtimeFactory.processSomeMessages(
			count ?? this.runtimeFactory.outstandingMessageCount,
		);
	}

	public get minimumSequenceNumber(): number {
		return this.runtimeFactory.getMinSeq();
	}

	public get sequenceNumber(): number {
		return this.runtimeFactory.sequenceNumber;
	}
}

/**
 * Run a custom "spy function" every time the given method is invoked.
 * @param methodClass - the class that has the method
 * @param methodName - the name of the method
 * @param spy - the spy function to run alongside the method
 * @returns a function which will remove the spy function when invoked. Should be called exactly once
 * after the spy is no longer needed.
 */
export function spyOnMethod(
	// eslint-disable-next-line @typescript-eslint/ban-types
	methodClass: Function,
	methodName: string,
	spy: () => void,
): () => void {
	const { prototype } = methodClass;
	const method = prototype[methodName];
	assert(typeof method === "function", `Method does not exist: ${methodName}`);

	const methodSpy = function (this: unknown, ...args: unknown[]): unknown {
		spy();
		return method.call(this, ...args);
	};
	prototype[methodName] = methodSpy;

	return () => {
		prototype[methodName] = method;
	};
}

/**
 * @returns `true` iff the given delta has a visible impact on the document tree.
 */
export function isDeltaVisible(delta: DeltaFieldChanges): boolean {
	for (const mark of delta.local ?? []) {
		if (mark.attach !== undefined || mark.detach !== undefined) {
			return true;
		}
		if (mark.fields !== undefined) {
			for (const field of mark.fields.values()) {
				if (isDeltaVisible(field)) {
					return true;
				}
			}
		}
	}
	return false;
}

/**
 * Assert two MarkList are equal, handling cursors.
 */
export function assertFieldChangesEqual(a: DeltaFieldChanges, b: DeltaFieldChanges): void {
	const aTree = mapFieldChanges(a, mapTreeFromCursor);
	const bTree = mapFieldChanges(b, mapTreeFromCursor);
	assert.deepStrictEqual(aTree, bTree);
}

/**
 * Assert two MarkList are equal, handling cursors.
 */
export function assertMarkListEqual(a: readonly DeltaMark[], b: readonly DeltaMark[]): void {
	const aTree = mapMarkList(a, mapTreeFromCursor);
	const bTree = mapMarkList(b, mapTreeFromCursor);
	assert.deepStrictEqual(aTree, bTree);
}

/**
 * Assert two Delta are equal, handling cursors.
 */
export function assertDeltaFieldMapEqual(a: DeltaFieldMap, b: DeltaFieldMap): void {
	const aTree = mapFieldsChanges(a, mapTreeFromCursor);
	const bTree = mapFieldsChanges(b, mapTreeFromCursor);
	assert.deepStrictEqual(aTree, bTree);
}

/**
 * Assert two Delta are equal, handling cursors.
 */
export function assertDeltaEqual(a: DeltaRoot, b: DeltaRoot): void {
	const aTree = mapRootChanges(a, mapTreeFromCursor);
	const bTree = mapRootChanges(b, mapTreeFromCursor);
	assert.deepStrictEqual(aTree, bTree);
}

/**
 * A test helper that allows custom code to be injected when a tree is created/loaded.
 */
export class SharedTreeTestFactory extends SharedTreeFactory {
	/**
	 * @param onCreate - Called once for each created tree (not called for trees loaded from summaries).
	 * @param onLoad - Called once for each tree that is loaded from a summary.
	 */
	public constructor(
		private readonly onCreate: (tree: SharedTree) => void,
		private readonly onLoad?: (tree: SharedTree) => void,
	) {
		super({ jsonValidator: typeboxValidator });
	}

	public override async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<ISharedTree> {
		const tree = (await super.load(runtime, id, services, channelAttributes)) as SharedTree;
		this.onLoad?.(tree);
		return tree;
	}

	public override create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree {
		const tree = super.create(runtime, id) as SharedTree;
		this.onCreate(tree);
		return tree;
	}
}

export function validateTree(tree: ITreeCheckout, expected: JsonableTree[]): void {
	const actual = toJsonableTree(tree);
	assert.deepEqual(actual, expected);
}

const schemaCodec = makeSchemaCodec({ jsonValidator: typeboxValidator });

export function checkRemovedRootsAreSynchronized(trees: readonly ITreeCheckout[]) {
	if (trees.length > 1) {
		const baseline = nestedMapFromFlatList(trees[0].getRemovedRoots());
		for (const tree of trees.slice(1)) {
			const actual = nestedMapFromFlatList(tree.getRemovedRoots());
			assert.deepEqual(actual, baseline);
		}
	}
}

/**
 * This does NOT check that the trees have the same edits, same edit manager state or anything like that.
 * This ONLY checks if the content of the forest of the main branch of the trees match.
 */
export function validateTreeConsistency(treeA: ISharedTree, treeB: ISharedTree): void {
	// TODO: validate other aspects of these trees are consistent, for example their collaboration window information.
	validateSnapshotConsistency(
		treeA.contentSnapshot(),
		treeB.contentSnapshot(),
		`id: ${treeA.id} vs id: ${treeB.id}`,
	);
}

function contentToJsonableTree(content: TreeContent): JsonableTree[] {
	return jsonableTreeFromFieldCursor(
		normalizeNewFieldContent(content, content.schema.rootFieldSchema, content.initialTree),
	);
}

export function validateTreeContent(tree: ITreeCheckout, content: TreeContent): void {
	assert.deepEqual(toJsonableTree(tree), contentToJsonableTree(content));
	expectSchemaEqual(tree.storedSchema, intoStoredSchema(content.schema));
}

export function expectSchemaEqual(
	a: TreeStoredSchema,
	b: TreeStoredSchema,
	idDifferentiator: string | undefined = undefined,
): void {
	assert.deepEqual(
		schemaCodec.encode(a),
		schemaCodec.encode(b),
		`Inconsistent schema: ${idDifferentiator}`,
	);
}

export function validateViewConsistency(
	treeA: ITreeCheckout,
	treeB: ITreeCheckout,
	idDifferentiator: string | undefined = undefined,
): void {
	validateSnapshotConsistency(
		{
			tree: toJsonableTree(treeA),
			schema: treeA.storedSchema,
			removed: treeA.getRemovedRoots(),
		},
		{
			tree: toJsonableTree(treeB),
			schema: treeB.storedSchema,
			removed: treeA.getRemovedRoots(),
		},
		idDifferentiator,
	);
}

export function validateSnapshotConsistency(
	treeA: SharedTreeContentSnapshot,
	treeB: SharedTreeContentSnapshot,
	idDifferentiator: string | undefined = undefined,
): void {
	assert.deepEqual(
		treeA.tree,
		treeB.tree,
		`Inconsistent document tree json representation: ${idDifferentiator}`,
	);
	// Note: removed trees are not currently GCed, which allows us to expect that all clients should share the same
	// exact set of them. In the future, we will need to relax this expectation and only enforce that whenever two
	// clients both have data for the same removed tree (as identified by the first two tuple entries), then they
	// should be consistent about the content being stored (the third tuple entry).
	const mapA = nestedMapFromFlatList(treeA.removed);
	const mapB = nestedMapFromFlatList(treeB.removed);
	assert.deepEqual(
		mapA,
		mapB,
		`Inconsistent removed trees json representation: ${idDifferentiator}`,
	);
	expectSchemaEqual(treeA.schema, treeB.schema, idDifferentiator);
}

export function checkoutWithContent(
	content: TreeContent,
	args?: {
		events?: ISubscribable<CheckoutEvents> &
			IEmitter<CheckoutEvents> &
			HasListeners<CheckoutEvents>;
	},
): ITreeCheckout {
	return flexTreeViewWithContent(content, args).checkout;
}

export function flexTreeViewWithContent<TRoot extends TreeFieldSchema>(
	content: TreeContent<TRoot>,
	args?: {
		events?: ISubscribable<CheckoutEvents> &
			IEmitter<CheckoutEvents> &
			HasListeners<CheckoutEvents>;
		nodeKeyManager?: NodeKeyManager;
		nodeKeyFieldKey?: FieldKey;
	},
): CheckoutFlexTreeView<TRoot> {
	const forest = forestWithContent(content);
	const view = createTreeCheckout(testIdCompressor, {
		...args,
		forest,
		schema: new TreeStoredSchemaRepository(intoStoredSchema(content.schema)),
	});
	return new CheckoutFlexTreeView(
		view,
		content.schema,
		args?.nodeKeyManager ?? createMockNodeKeyManager(),
		args?.nodeKeyFieldKey ?? brand(defaultNodeKeyFieldKey),
	);
}

export function forestWithContent(content: TreeContent): IEditableForest {
	const forest = buildForest();
	const fieldCursor = normalizeNewFieldContent(
		{ schema: content.schema },
		content.schema.rootFieldSchema,
		content.initialTree,
	);
	// TODO:AB6712 Make the delta format accept a single cursor in Field mode.
	const nodeCursors = mapCursorField(fieldCursor, (c) =>
		cursorForMapTreeNode(mapTreeFromCursor(c)),
	);
	initializeForest(forest, nodeCursors, testIdCompressor);
	return forest;
}

export function flexTreeWithContent<TRoot extends TreeFieldSchema>(
	content: TreeContent<TRoot>,
	args?: {
		nodeKeyManager?: NodeKeyManager;
		nodeKeyFieldKey?: FieldKey;
		events?: ISubscribable<CheckoutEvents> &
			IEmitter<CheckoutEvents> &
			HasListeners<CheckoutEvents>;
	},
): FlexTreeTypedField<TRoot> {
	const forest = forestWithContent(content);
	const branch = createTreeCheckout(testIdCompressor, {
		...args,
		forest,
		schema: new TreeStoredSchemaRepository(intoStoredSchema(content.schema)),
	});
	const manager = args?.nodeKeyManager ?? createMockNodeKeyManager();
	const view = new CheckoutFlexTreeView(
		branch,
		content.schema,
		manager,
		args?.nodeKeyFieldKey ?? brand(nodeKeyFieldKeyDefault),
	);
	return view.editableTree;
}

export const requiredBooleanRootSchema = new SchemaBuilder({
	scope: "RequiredBool",
}).intoSchema(SchemaBuilder.required(leaf.boolean));

export const jsonSequenceRootSchema = new SchemaBuilder({
	scope: "JsonSequenceRoot",
	libraries: [jsonSchema],
}).intoSchema(SchemaBuilder.sequence(jsonRoot));

export const stringSequenceRootSchema = new SchemaBuilder({
	scope: "StringSequenceRoot",
}).intoSchema(SchemaBuilder.sequence(leaf.string));

export const numberSequenceRootSchema = new SchemaBuilder({
	scope: "NumberSequenceRoot",
}).intoSchema(SchemaBuilder.sequence(leaf.number));

export const emptyJsonSequenceConfig = {
	schema: jsonSequenceRootSchema,
	allowedSchemaModifications: AllowedUpdateType.None,
	initialTree: [],
} satisfies InitializeAndSchematizeConfiguration;

export const emptyStringSequenceConfig = {
	schema: stringSequenceRootSchema,
	allowedSchemaModifications: AllowedUpdateType.None,
	initialTree: [],
} satisfies InitializeAndSchematizeConfiguration;

/**
 * If the root is an array, this creates a sequence field at the root instead of a JSON array node.
 *
 * If the root is not an array, a single item root sequence is used.
 */
export function makeTreeFromJson(json: JsonCompatible[] | JsonCompatible): ITreeCheckout {
	const cursors = (Array.isArray(json) ? json : [json]).map(singleJsonCursor);
	const tree = checkoutWithContent({
		schema: jsonSequenceRootSchema,
		initialTree: cursors,
	});
	return tree;
}

export function toJsonableTree(tree: ITreeCheckout): JsonableTree[] {
	return jsonableTreeFromForest(tree.forest);
}

/**
 * Assumes `tree` is in the json domain and returns its content as a json compatible object.
 */
export function toJsonTree(tree: ITreeCheckout): JsonCompatible[] {
	const readCursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, readCursor);
	const copy = mapCursorField(readCursor, cursorToJsonObject);
	readCursor.free();
	return copy;
}

/**
 * Helper function to insert node at a given index.
 *
 * TODO: delete once the JSON editing API is ready for use.
 *
 * @param tree - The tree on which to perform the insert.
 * @param index - The index in the root field at which to insert.
 * @param value - The value of the inserted nodes.
 */
export function insert(
	tree: ITreeCheckout,
	index: number,
	...values: ContextuallyTypedNodeData[]
): void {
	const fieldEditor = tree.editor.sequenceField({ field: rootFieldKey, parent: undefined });
	const content = normalizeNewFieldContent(
		{ schema: jsonSequenceRootSchema },
		jsonSequenceRootSchema.rootFieldSchema,
		values,
	);
	fieldEditor.insert(index, content);
}

export function remove(tree: ITreeCheckout, index: number, count: number): void {
	const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKey });
	field.remove(index, count);
}

export function expectJsonTree(
	actual: ITreeCheckout | ITreeCheckout[],
	expected: JsonCompatible[],
	expectRemovedRootsAreSynchronized = true,
): void {
	const trees = Array.isArray(actual) ? actual : [actual];
	for (const tree of trees) {
		const roots = toJsonTree(tree);
		assert.deepEqual(roots, expected);
	}
	if (expectRemovedRootsAreSynchronized) {
		checkRemovedRootsAreSynchronized(trees);
	}
}

export function expectEqualPaths(path: UpPath | undefined, expectedPath: UpPath | undefined): void {
	if (!compareUpPaths(path, expectedPath)) {
		// This is slower than above compare, so only do it in the error case.
		// Make a nice error message:
		assert.deepEqual(clonePath(path), clonePath(expectedPath));
		assert.fail("unequal paths, but clones compared equal");
	}
}

export function expectEqualFieldPaths(path: FieldUpPath, expectedPath: FieldUpPath): void {
	expectEqualPaths(path.parent, expectedPath.parent);
	assert.equal(path.field, expectedPath.field);
}

export const mockIntoDelta = (delta: DeltaRoot) => delta;

export interface EncodingTestData<TDecoded, TEncoded, TContext = void> {
	/**
	 * Contains test cases which should round-trip successfully through all persisted formats.
	 */
	successes: TContext extends void
		? [name: string, data: TDecoded][]
		: [name: string, data: TDecoded, context: TContext][];
	/**
	 * Contains malformed encoded data which a particular version's codec should fail to decode.
	 */
	failures?: {
		[version: string]: TContext extends void
			? [name: string, data: TEncoded][]
			: [name: string, data: TEncoded, context: TContext][];
	};
}

const assertDeepEqual = (a: any, b: any) => assert.deepEqual(a, b);

/**
 * Constructs a basic suite of round-trip tests for all versions of a codec family.
 * This helper should generally be wrapped in a `describe` block.
 *
 * Encoded data for JSON codecs within `family` will be validated using `typeboxValidator`.
 *
 * @privateRemarks It is generally not valid to compare the decoded formats with assert.deepEqual,
 * but since these round trip tests start with the decoded format (not the encoded format),
 * they require assert.deepEqual to be a valid comparison.
 * This can be problematic for some cases (for example edits containing cursors).
 *
 * TODO:
 * - Consider extending this to allow testing in a way where encoded formats (which can safely use deepEqual) are compared.
 * - Consider adding a custom comparison function for non-encoded data.
 * - Consider adding a way to test that specific values have specific encodings.
 * Maybe generalize test cases to each have an optional encoded and optional decoded form (require at least one), for example via:
 * `{name: string, encoded?: JsonCompatibleReadOnly, decoded?: TDecoded}`.
 */
export function makeEncodingTestSuite<TDecoded, TEncoded, TContext>(
	family: ICodecFamily<TDecoded, TContext>,
	encodingTestData: EncodingTestData<TDecoded, TEncoded, TContext>,
	assertEquivalent: (a: TDecoded, b: TDecoded) => void = assertDeepEqual,
): void {
	for (const version of family.getSupportedFormats()) {
		describe(`version ${version}`, () => {
			const codec = family.resolve(version);
			// A common pattern to avoid validating the same portion of encoded data multiple times
			// is for a codec to either validate its data is in schema itself and not return `encodedSchema`,
			// or for it to not validate its own data but return an `encodedSchema` and let the caller use that.
			// This block makes sure we still validate the encoded data schema for codecs following the latter
			// pattern.
			const jsonCodec =
				codec.json.encodedSchema !== undefined
					? withSchemaValidation(codec.json.encodedSchema, codec.json, typeboxValidator)
					: codec.json;
			describe("can json roundtrip", () => {
				for (const includeStringification of [false, true]) {
					describe(
						includeStringification ? "with stringification" : "without stringification",
						() => {
							for (const [name, data, context] of encodingTestData.successes) {
								it(name, () => {
									// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
									let encoded = jsonCodec.encode(data, context!);
									if (includeStringification) {
										encoded = JSON.parse(JSON.stringify(encoded));
									}
									// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
									const decoded = jsonCodec.decode(encoded, context!);
									assertEquivalent(decoded, data);
								});
							}
						},
					);
				}
			});

			describe("can binary roundtrip", () => {
				for (const [name, data, context] of encodingTestData.successes) {
					it(name, () => {
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const encoded = codec.binary.encode(data, context!);
						// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
						const decoded = codec.binary.decode(encoded, context!);
						assertEquivalent(decoded, data);
					});
				}
			});

			const failureCases = encodingTestData.failures?.[version] ?? [];
			if (failureCases.length > 0) {
				describe("rejects malformed data", () => {
					for (const [name, encodedData, context] of failureCases) {
						it(name, () => {
							assert.throws(() =>
								// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
								jsonCodec.decode(encodedData as JsonCompatible, context!),
							);
						});
					}
				});
			}
		});
	}
}

/**
 * Creates a change receiver function for passing to an `EditBuilder` which records the changes
 * applied via that editor and allows them to be queried via a function.
 * @param _changeFamily - this optional change family allows for type inference of `TChange` for
 * convenience, but is otherwise unused.
 * @returns a change receiver function and a function that will return all changes received
 */
export function testChangeReceiver<TChange>(
	_changeFamily?: ChangeFamily<ChangeFamilyEditor, TChange>,
): [
	changeReceiver: Parameters<ChangeFamily<ChangeFamilyEditor, TChange>["buildEditor"]>[0],
	getChanges: () => readonly TChange[],
] {
	const changes: TChange[] = [];
	const changeReceiver = (change: TChange) => changes.push(change);
	return [changeReceiver, () => [...changes]];
}

export function defaultRevisionMetadataFromChanges(
	changes: readonly TaggedChange<unknown>[],
): RevisionMetadataSource {
	return revisionMetadataSourceFromInfo(defaultRevInfosFromChanges(changes));
}

export function defaultRevInfosFromChanges(
	changes: readonly TaggedChange<unknown>[],
): RevisionInfo[] {
	const revInfos: RevisionInfo[] = [];
	const revisions = new Set<RevisionTag>();
	const rolledBackRevisions: RevisionTag[] = [];
	for (const change of changes) {
		if (change.revision !== undefined) {
			revInfos.push({
				revision: change.revision,
				rollbackOf: change.rollbackOf,
			});

			revisions.add(change.revision);
			if (change.rollbackOf !== undefined) {
				rolledBackRevisions.push(change.rollbackOf);
			}
		}
	}

	rolledBackRevisions.reverse();
	for (const revision of rolledBackRevisions) {
		if (!revisions.has(revision)) {
			revInfos.push({ revision });
		}
	}

	return revInfos;
}

export function applyTestDelta(
	delta: DeltaFieldMap,
	deltaProcessor: { acquireVisitor: () => DeltaVisitor },
	detachedFieldIndex?: DetachedFieldIndex,
): void {
	const rootDelta: DeltaRoot = { fields: delta };
	applyDelta(
		rootDelta,
		deltaProcessor,
		detachedFieldIndex ?? makeDetachedFieldIndex(undefined, testIdCompressor),
	);
}

export function announceTestDelta(
	delta: DeltaFieldMap,
	deltaProcessor: { acquireVisitor: () => DeltaVisitor & AnnouncedVisitor },
	detachedFieldIndex?: DetachedFieldIndex,
): void {
	const rootDelta: DeltaRoot = { fields: delta };
	announceDelta(
		rootDelta,
		deltaProcessor,
		detachedFieldIndex ?? makeDetachedFieldIndex(undefined, testIdCompressor),
	);
}

export function createTestUndoRedoStacks(
	events: ISubscribable<{ revertible(type: Revertible): void }>,
): {
	undoStack: Revertible[];
	redoStack: Revertible[];
	unsubscribe: () => void;
} {
	const undoStack: Revertible[] = [];
	const redoStack: Revertible[] = [];

	const unsubscribe = events.on("revertible", (revertible) => {
		if (revertible.kind === RevertibleKind.Undo) {
			redoStack.push(revertible);
		} else {
			undoStack.push(revertible);
		}
	});

	return { undoStack, redoStack, unsubscribe };
}

/**
 * Mock IdCompressor for testing that returns an incrementing ID.
 * Should not be used for tests that have multiple clients as doing so will generate
 * duplicate IDs that collide.
 */
export class MockIdCompressor implements IIdCompressor, IIdCompressorCore {
	private count = 0;
	public localSessionId: SessionId = "MockLocalSessionId" as SessionId;

	public serialize(withSession: true): SerializedIdCompressorWithOngoingSession;
	public serialize(withSession: false): SerializedIdCompressorWithNoSession;
	public serialize(hasLocalState: boolean): SerializedIdCompressor {
		throw new Error("Method not implemented.");
	}

	public takeNextCreationRange(): IdCreationRange {
		return undefined as unknown as IdCreationRange;
	}
	public finalizeCreationRange(range: IdCreationRange): void {
		throw new Error("Method not implemented.");
	}

	public generateCompressedId(): SessionSpaceCompressedId {
		return this.count++ as SessionSpaceCompressedId;
	}
	public normalizeToOpSpace(id: SessionSpaceCompressedId): OpSpaceCompressedId {
		return id as unknown as OpSpaceCompressedId;
	}
	public normalizeToSessionSpace(
		id: OpSpaceCompressedId,
		originSessionId: SessionId,
	): SessionSpaceCompressedId {
		return id as unknown as SessionSpaceCompressedId;
	}
	public decompress(id: SessionSpaceCompressedId): StableId {
		throw new Error("Method not implemented.");
	}
	public recompress(uncompressed: StableId): SessionSpaceCompressedId {
		throw new Error("Method not implemented.");
	}
	public tryRecompress(uncompressed: StableId): SessionSpaceCompressedId | undefined {
		throw new Error("Method not implemented.");
	}
	public beginGhostSession(ghostSessionId: SessionId, ghostSessionCallback: () => void) {
		throw new Error("Method not implemented.");
	}
}

export const testIdCompressor = createIdCompressor();
export function mintRevisionTag(): RevisionTag {
	return testIdCompressor.generateCompressedId();
}
