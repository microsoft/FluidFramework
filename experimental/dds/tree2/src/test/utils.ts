/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { unreachableCase } from "@fluidframework/common-utils";
import { LocalServerTestDriver } from "@fluid-internal/test-drivers";
import { IContainer } from "@fluidframework/container-definitions";
import { Loader } from "@fluidframework/container-loader";
import {
	IChannelAttributes,
	IChannelServices,
	IFluidDataStoreRuntime,
} from "@fluidframework/datastore-definitions";
import { requestFluidObject } from "@fluidframework/runtime-utils";
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
import { ConfigTypes, IConfigProviderBase } from "@fluidframework/telemetry-utils";
import {
	ISharedTree,
	ISharedTreeView,
	SharedTreeFactory,
	TreeContent,
	ViewEvents,
	createSharedTreeView,
} from "../shared-tree";
import {
	buildForest,
	DefaultChangeFamily,
	DefaultChangeset,
	DefaultEditBuilder,
	defaultSchemaPolicy,
	ForestRepairDataStoreProvider,
	jsonableTreeFromCursor,
	mapFieldMarks,
	mapMarkList,
	mapTreeFromCursor,
	NodeKeyIndex,
	NodeKeyManager,
	NodeReviver,
	normalizeNewFieldContent,
	RevisionInfo,
	RevisionMetadataSource,
	revisionMetadataSourceFromInfo,
	SchemaBuilder,
	singleTextCursor,
} from "../feature-libraries";
import {
	RevisionTag,
	Delta,
	InvalidationToken,
	SimpleObservingDependent,
	moveToDetachedField,
	mapCursorField,
	JsonableTree,
	SchemaData,
	rootFieldKey,
	Value,
	compareUpPaths,
	UpPath,
	clonePath,
	RepairDataStore,
	ITreeCursorSynchronous,
	FieldKey,
	IRepairDataStoreProvider,
	UndoRedoManager,
	ChangeFamilyEditor,
	ChangeFamily,
	TaggedChange,
	TreeSchemaBuilder,
	treeSchema,
	FieldUpPath,
	TreeSchemaIdentifier,
	TreeStoredSchema,
	IForestSubscription,
	InMemoryStoredSchemaRepository,
	initializeForest,
} from "../core";
import { JsonCompatible, Named, brand, makeArray } from "../util";
import { ICodecFamily, withSchemaValidation } from "../codec";
import { typeboxValidator } from "../external-utilities";
import { cursorToJsonObject, jsonRoot, jsonSchema, jsonString, singleJsonCursor } from "../domains";
import { HasListeners, IEmitter, ISubscribable } from "../events";

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

export class MockDependent extends SimpleObservingDependent {
	public readonly tokens: (InvalidationToken | undefined)[] = [];
	public constructor(name: string = "MockDependent") {
		super((token) => this.tokens.push(token), name);
	}
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
	private readonly _trees: ISharedTree[] = [];
	private readonly _containers: IContainer[] = [];
	private readonly summarizer?: ISummarizer;

	public get trees(): readonly ISharedTree[] {
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
	 * ```ts
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
			const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
			const firstTree = await dataObject.getSharedObject<ISharedTree>(
				TestTreeProvider.treeId,
			);
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
	public async createTree(): Promise<ISharedTree> {
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
		const dataObject = await requestFluidObject<ITestFluidObject>(container, "/");
		return (this._trees[this.trees.length] = await dataObject.getSharedObject<ISharedTree>(
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
		firstTreeParams?: [IContainer, ISharedTree, ISummarizer],
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
	public readonly trees: readonly ISharedTree[];

	/**
	 * Create a new {@link TestTreeProviderLite} with a number of trees pre-initialized.
	 * @param trees - the number of trees created by this provider.
	 * @param factory - an optional factory to use for creating and loading trees. See {@link SharedTreeTestFactory}.
	 *
	 * @example
	 * ```ts
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
		const t: ISharedTree[] = [];
		for (let i = 0; i < trees; i++) {
			const runtime = new MockFluidDataStoreRuntime({
				clientId: `test-client-${i}`,
				id: "test",
			});
			const tree = this.factory.create(runtime, TestTreeProviderLite.treeId);
			const containerRuntime = this.runtimeFactory.createContainerRuntime(runtime);
			tree.connect({
				deltaConnection: containerRuntime.createDeltaConnection(),
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
export function isDeltaVisible(delta: Delta.MarkList): boolean {
	for (const mark of delta) {
		if (typeof mark === "object") {
			const type = mark.type;
			switch (type) {
				case Delta.MarkType.Modify: {
					if (Object.prototype.hasOwnProperty.call(mark, "setValue")) {
						return true;
					}
					if (mark.fields !== undefined) {
						for (const field of mark.fields.values()) {
							if (isDeltaVisible(field)) {
								return true;
							}
						}
					}
					break;
				}
				case Delta.MarkType.Insert: {
					if (mark.isTransient !== true) {
						return true;
					}
					break;
				}
				case Delta.MarkType.MoveOut:
				case Delta.MarkType.MoveIn:
				case Delta.MarkType.Delete:
					return true;
					break;
				default:
					unreachableCase(type);
			}
		}
	}
	return false;
}

/**
 * Assert two MarkList are equal, handling cursors.
 */
export function assertMarkListEqual(a: Delta.MarkList, b: Delta.MarkList): void {
	const aTree = mapMarkList(a, mapTreeFromCursor);
	const bTree = mapMarkList(b, mapTreeFromCursor);
	assert.deepStrictEqual(aTree, bTree);
}

/**
 * Assert two Delta are equal, handling cursors.
 */
export function assertDeltaEqual(a: Delta.FieldMarks, b: Delta.FieldMarks): void {
	const aTree = mapFieldMarks(a, mapTreeFromCursor);
	const bTree = mapFieldMarks(b, mapTreeFromCursor);
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
		private readonly onCreate: (tree: ISharedTree) => void,
		private readonly onLoad?: (tree: ISharedTree) => void,
	) {
		super({ jsonValidator: typeboxValidator });
	}

	public override async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		channelAttributes: Readonly<IChannelAttributes>,
	): Promise<ISharedTree> {
		const tree = await super.load(runtime, id, services, channelAttributes);
		this.onLoad?.(tree);
		return tree;
	}

	public override create(runtime: IFluidDataStoreRuntime, id: string): ISharedTree {
		const tree = super.create(runtime, id);
		this.onCreate(tree);
		return tree;
	}
}

export function noRepair(): Delta.ProtoNode[] {
	assert.fail("Unexpected request for repair data");
}

const cursorValueKey = Symbol("FakeRepairDataValue");

/**
 * Creates a {@link NodeReviver} with values generated by the provided valueGenerator.
 * @param valueGenerator - Delegate invoked to generate the value of each node.
 * @param tagCursorWithValue - When true, each produced cursor will have a field that contains the same value at that
 * of the node accessible through the cursor. Use this to ensure the cursor can be deep-compared.
 * Do not use this in encoding/decoding tests as the extra field will not roundtrip.
 */
export function createFakeRepair(
	valueGenerator: (revision: RevisionTag, index: number) => Value,
	tagCursorWithValue?: boolean,
): NodeReviver {
	return (revision: RevisionTag, index: number, count: number) =>
		makeArray(count, (currentIndex) => {
			const value = valueGenerator(revision, index + currentIndex);
			const cursor = singleTextCursor({
				type: brand("FakeRepairedNode"),
				value,
			});
			if (tagCursorWithValue === true) {
				// We put a copy of the value on the cursor itself to ensure deep comparison detects differences.
				(cursor as { [cursorValueKey]?: Value })[cursorValueKey] = value;
			}
			return cursor;
		});
}

/**
 * A {@link NodeReviver} that creates fake repair nodes with values dependent on the revision and index.
 */
export const fakeRepair = createFakeRepair(
	(revisionInner: RevisionTag, indexInner: number) =>
		`revision ${revisionInner} index ${indexInner}`,
);

/**
 * A {@link NodeReviver} that creates fake repair nodes with values dependent on the revision and index.
 */
export const fakeTaggedRepair = createFakeRepair(
	(revisionInner: RevisionTag, indexInner: number) =>
		`revision ${revisionInner} index ${indexInner}`,
	true,
);

export function validateTree(tree: ISharedTreeView, expected: JsonableTree[]): void {
	const actual = toJsonableTree(tree);
	assert.deepEqual(actual, expected);
}

export function validateTreeConsistency(treeA: ISharedTree, treeB: ISharedTree): void {
	assert.deepEqual(toJsonableTree(treeA), toJsonableTree(treeB));
}

export function viewWithContent(
	content: TreeContent,
	args?: {
		repairProvider?: ForestRepairDataStoreProvider<DefaultChangeset>;
		nodeKeyManager?: NodeKeyManager;
		nodeKeyIndex?: NodeKeyIndex;
		events?: ISubscribable<ViewEvents> & IEmitter<ViewEvents> & HasListeners<ViewEvents>;
	},
): ISharedTreeView {
	const schema = new InMemoryStoredSchemaRepository(defaultSchemaPolicy, content.schema);
	const forest = buildForest(schema);
	initializeForest(
		forest,
		normalizeNewFieldContent({ schema }, schema.rootFieldSchema, content.initialTree),
	);
	const view = createSharedTreeView({ ...args, forest, schema });
	return view;
}

const jsonSequenceRootField = SchemaBuilder.fieldSequence(...jsonRoot);
export const jsonSequenceRootSchema = new SchemaBuilder(
	"JsonSequenceRoot",
	{},
	jsonSchema,
).intoDocumentSchema(jsonSequenceRootField);

/**
 * If the root is an array, this creates a sequence field at the root instead of a JSON array node.
 *
 * If the root is not an array, a single item root sequence is used.
 */
export function makeTreeFromJson(json: JsonCompatible[] | JsonCompatible): ISharedTreeView {
	const cursors = (Array.isArray(json) ? json : [json]).map(singleJsonCursor);
	const tree = viewWithContent({
		schema: jsonSequenceRootSchema,
		initialTree: cursors,
	});
	return tree;
}

export function toJsonableTree(tree: ISharedTreeView): JsonableTree[] {
	return jsonableTreeFromForest(tree.forest);
}

export function jsonableTreeFromForest(forest: IForestSubscription): JsonableTree[] {
	const readCursor = forest.allocateCursor();
	moveToDetachedField(forest, readCursor);
	const jsonable = mapCursorField(readCursor, jsonableTreeFromCursor);
	readCursor.free();
	return jsonable;
}

/**
 * Assumes `tree` is in the json domain and returns its content as a json compatible object.
 */
export function toJsonTree(tree: ISharedTreeView): JsonCompatible[] {
	const readCursor = tree.forest.allocateCursor();
	moveToDetachedField(tree.forest, readCursor);
	const copy = mapCursorField(readCursor, cursorToJsonObject);
	readCursor.free();
	return copy;
}

/**
 * Helper function to insert a jsonString at a given index of the documents root field.
 *
 * @param tree - The tree on which to perform the insert.
 * @param index - The index in the root field at which to insert.
 * @param value - The value of the inserted node.
 */
export function insert(tree: ISharedTreeView, index: number, ...values: string[]): void {
	const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKey });
	const nodes = values.map((value) => singleTextCursor({ type: jsonString.name, value }));
	field.insert(index, nodes);
}

export function remove(tree: ISharedTreeView, index: number, count: number): void {
	const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKey });
	field.delete(index, count);
}

export function expectJsonTree(
	actual: ISharedTreeView | ISharedTreeView[],
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
export function initializeTestTree(
	tree: ISharedTreeView,
	state: JsonableTree | undefined,
	schema: SchemaData,
): void {
	tree.storedSchema.update(schema);

	if (state) {
		// Apply an edit to the tree which inserts a node with a value
		const writeCursor = singleTextCursor(state);
		const field = tree.editor.sequenceField({ parent: undefined, field: rootFieldKey });
		field.insert(0, writeCursor);
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

export class MockRepairDataStore<TChange> implements RepairDataStore<TChange> {
	public capturedData = new Map<RevisionTag, (ITreeCursorSynchronous | Value)[]>();

	public capture(change: TChange, revision: RevisionTag): void {
		const existing = this.capturedData.get(revision);

		if (existing === undefined) {
			this.capturedData.set(revision, [revision]);
		} else {
			existing.push(revision);
		}
	}

	public getNodes(
		revision: RevisionTag,
		path: UpPath | undefined,
		key: FieldKey,
		index: number,
		count: number,
	): ITreeCursorSynchronous[] {
		return makeArray(count, () => singleTextCursor({ type: brand("MockRevivedNode") }));
	}

	public getValue(revision: RevisionTag, path: UpPath): Value {
		return brand("MockRevivedValue");
	}
}

export const mockIntoDelta = (delta: Delta.Root) => delta;

export class MockRepairDataStoreProvider<TChange> implements IRepairDataStoreProvider<TChange> {
	public freeze(): void {
		// Noop
	}

	public applyChange(change: TChange): void {
		// Noop
	}

	public createRepairData(): MockRepairDataStore<TChange> {
		return new MockRepairDataStore();
	}

	public clone(): IRepairDataStoreProvider<TChange> {
		return new MockRepairDataStoreProvider();
	}
}

export function createMockUndoRedoManager(): UndoRedoManager<DefaultChangeset, DefaultEditBuilder> {
	return UndoRedoManager.create(new DefaultChangeFamily({ jsonValidator: typeboxValidator }));
}

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
 * @privateRemarks - It is generally not valid to compare the decoded formats with assert.deepEqual,
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
	const revInfos: RevisionInfo[] = [];
	for (const change of changes) {
		if (change.revision !== undefined) {
			revInfos.push({
				revision: change.revision,
				rollbackOf: change.rollbackOf,
			});
		}
	}
	return revisionMetadataSourceFromInfo(revInfos);
}

/**
 * Helper for building {@link Named} {@link TreeStoredSchema} without using {@link SchemaBuilder}.
 */
export function namedTreeSchema(
	data: TreeSchemaBuilder & Named<string>,
): Named<TreeSchemaIdentifier> & TreeStoredSchema {
	return {
		name: brand(data.name),
		...treeSchema({ ...data }),
	};
}
