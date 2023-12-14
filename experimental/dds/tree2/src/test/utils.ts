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
} from "@fluidframework/test-utils";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { ISummarizer } from "@fluidframework/container-runtime";
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import {
	ISharedTree,
	ITreeCheckout,
	SharedTreeFactory,
	TreeContent,
	CheckoutEvents,
	createTreeCheckout,
	SharedTree,
	InitializeAndSchematizeConfiguration,
	runSynchronous,
	SharedTreeContentSnapshot,
	CheckoutFlexTreeView,
} from "../shared-tree";
import {
	Any,
	buildForest,
	createMockNodeKeyManager,
	TreeFieldSchema,
	jsonableTreeFromCursor,
	mapFieldChanges,
	mapFieldsChanges,
	mapMarkList,
	mapTreeFromCursor,
	nodeKeyFieldKey as nodeKeyFieldKeyDefault,
	NodeKeyManager,
	normalizeNewFieldContent,
	cursorForJsonableTreeNode,
	FlexTreeTypedField,
	jsonableTreeFromForest,
	nodeKeyFieldKey as defaultNodeKeyFieldKey,
	ContextuallyTypedNodeData,
	mapRootChanges,
	intoStoredSchema,
} from "../feature-libraries";
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
	InMemoryStoredSchemaRepository,
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
	DeltaProtoNode,
} from "../core";
import { JsonCompatible, brand } from "../util";
import { ICodecFamily, withSchemaValidation } from "../codec";
import { typeboxValidator } from "../external-utilities";
import {
	cursorToJsonObject,
	jsonRoot,
	jsonSchema,
	singleJsonCursor,
	SchemaBuilder,
	leaf,
} from "../domains";
import { HasListeners, IEmitter, ISubscribable } from "../events";
// eslint-disable-next-line import/no-internal-modules
import { makeSchemaCodec } from "../feature-libraries/schema-index/codec";

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
	public async summarize(): Promise<void> {
		assert(
			this.summarizer !== undefined,
			"can't summarize because summarizeOnDemand was not set to true.",
		);
		await summarizeNow(this.summarizer, "TestTreeProvider");
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
	 *
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
	) {
		assert(trees >= 1, "Must initialize provider with at least one tree");
		const t: SharedTree[] = [];
		for (let i = 0; i < trees; i++) {
			const runtime = new MockFluidDataStoreRuntime({
				clientId: `test-client-${i}`,
				id: "test",
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

export function noRepair(): DeltaProtoNode[] {
	assert.fail("Unexpected request for repair data");
}

export function validateTree(tree: ITreeCheckout, expected: JsonableTree[]): void {
	const actual = toJsonableTree(tree);
	assert.deepEqual(actual, expected);
}

const schemaCodec = makeSchemaCodec({ jsonValidator: typeboxValidator });

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
	return normalizeNewFieldContent(
		content,
		content.schema.rootFieldSchema,
		content.initialTree,
	).map(jsonableTreeFromCursor);
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
		{ tree: toJsonableTree(treeA), schema: treeA.storedSchema },
		{ tree: toJsonableTree(treeB), schema: treeB.storedSchema },
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
		`Inconsistent json representation: ${idDifferentiator}`,
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
	const view = createTreeCheckout({
		...args,
		forest,
		schema: new InMemoryStoredSchemaRepository(intoStoredSchema(content.schema)),
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
	initializeForest(
		forest,
		normalizeNewFieldContent(
			{ schema: content.schema },
			content.schema.rootFieldSchema,
			content.initialTree,
		),
	);
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
	const branch = createTreeCheckout({
		...args,
		forest,
		schema: new InMemoryStoredSchemaRepository(intoStoredSchema(content.schema)),
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
	field.delete(index, count);
}

export function expectJsonTree(
	actual: ITreeCheckout | ITreeCheckout[],
	expected: JsonCompatible[],
): void {
	const trees = Array.isArray(actual) ? actual : [actual];
	for (const tree of trees) {
		const roots = toJsonTree(tree);
		assert.deepEqual(roots, expected);
	}
}

/**
 * Updates the given `tree` to the given `schema` and inserts `state` as its root.
 */
// TODO: replace use of this with initialize or schematize, and/or move them out of this file and use viewWithContent
export function initializeTestTree(
	tree: ITreeCheckout,
	state: JsonableTree | JsonableTree[] | undefined,
	schema: TreeStoredSchema = intoStoredSchema(wrongSchema),
): void {
	if (state === undefined) {
		tree.storedSchema.update(schema);
		return;
	}

	if (!Array.isArray(state)) {
		initializeTestTree(tree, [state], schema);
	} else {
		tree.storedSchema.update(schema);

		// Apply an edit to the tree which inserts a node with a value
		runSynchronous(tree, () => {
			const writeCursors = state.map(cursorForJsonableTreeNode);
			const field = tree.editor.sequenceField({
				parent: undefined,
				field: rootFieldKey,
			});
			field.insert(0, writeCursors);
		});
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

export interface EncodingTestData<TDecoded, TEncoded> {
	/**
	 * Contains test cases which should round-trip successfully through all persisted formats.
	 */
	successes: [name: string, data: TDecoded][];
	/**
	 * Contains malformed encoded data which a particular version's codec should fail to decode.
	 */
	failures?: { [version: string]: [name: string, data: TEncoded][] };
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
export function makeEncodingTestSuite<TDecoded, TEncoded>(
	family: ICodecFamily<TDecoded>,
	encodingTestData: EncodingTestData<TDecoded, TEncoded>,
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
							for (const [name, data] of encodingTestData.successes) {
								it(name, () => {
									let encoded = jsonCodec.encode(data);
									if (includeStringification) {
										encoded = JSON.parse(JSON.stringify(encoded));
									}
									const decoded = jsonCodec.decode(encoded);
									assertEquivalent(decoded, data);
								});
							}
						},
					);
				}
			});

			describe("can binary roundtrip", () => {
				for (const [name, data] of encodingTestData.successes) {
					it(name, () => {
						const encoded = codec.binary.encode(data);
						const decoded = codec.binary.decode(encoded);
						assertEquivalent(decoded, data);
					});
				}
			});

			const failureCases = encodingTestData.failures?.[version] ?? [];
			if (failureCases.length > 0) {
				describe("rejects malformed data", () => {
					for (const [name, encodedData] of failureCases) {
						it(name, () => {
							assert.throws(() => jsonCodec.decode(encodedData as JsonCompatible));
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

/**
 * Document Schema which is not correct.
 * Use as a transitionary tool when migrating code that does not provide a schema toward one that provides a correct schema.
 * Using this allows representing an intermediate state that still has an incorrect schema, but is explicit about it.
 * This is particularly useful when modifying APIs to require schema, and a lot of code has to be updated.
 *
 * @deprecated This in invalid and only used to explicitly mark code as using the wrong schema. All usages of this should be fixed to use correct schema.
 */
// TODO: remove all usages of this.
export const wrongSchema = new SchemaBuilder({
	scope: "Wrong Schema",
	lint: {
		rejectEmpty: false,
	},
}).intoSchema(SchemaBuilder.sequence(Any));

export function applyTestDelta(
	delta: DeltaFieldMap,
	deltaProcessor: { acquireVisitor: () => DeltaVisitor },
	detachedFieldIndex?: DetachedFieldIndex,
): void {
	const rootDelta: DeltaRoot = { fields: delta };
	applyDelta(rootDelta, deltaProcessor, detachedFieldIndex ?? makeDetachedFieldIndex());
}

export function announceTestDelta(
	delta: DeltaFieldMap,
	deltaProcessor: { acquireVisitor: () => DeltaVisitor & AnnouncedVisitor },
	detachedFieldIndex?: DetachedFieldIndex,
): void {
	const rootDelta: DeltaRoot = { fields: delta };
	announceDelta(rootDelta, deltaProcessor, detachedFieldIndex ?? makeDetachedFieldIndex());
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
