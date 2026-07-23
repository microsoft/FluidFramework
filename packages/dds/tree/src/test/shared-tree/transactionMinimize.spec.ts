/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import type { ImplicitFieldSchema, ValidateRecursiveSchema } from "@fluidframework/tree";
import type {
	InsertableField,
	JsonCompatibleReadOnly,
	ReadableField,
} from "@fluidframework/tree/alpha";
import { createIndependentTreeAlpha, minimize } from "@fluidframework/tree/alpha";

import { SchematizingSimpleTreeView, SharedTreeChange } from "../../shared-tree/index.js";
import { TestTreeProviderLite, validateViewConsistency } from "../utils.js";
import type { JsonString } from "@fluidframework/core-interfaces/internal";
import { JsonStringify } from "@fluidframework/core-interfaces/internal";

/**
 * Reads the change associated with the head commit on the main branch.
 * @remarks This is the squashed change produced by the most recently committed transaction.
 */
function getHeadChange(
	view: Pick<SchematizingSimpleTreeView<ImplicitFieldSchema>, "checkout">,
): SharedTreeChange {
	return view.checkout.mainBranch.getHead().change;
}

/**
 * Classification of builds within a SharedTreeChange.
 */
interface BuildStatistics {
	/**
	 * The number of build entries (each entry is a chunk of one or more contiguous nodes).
	 */
	readonly builds: number;
	/**
	 * The total number of top-level nodes across all build entries (the sum of each chunk's `topLevelLength`).
	 */
	readonly tops: number;
}

/**
 * Counts the detached-node `builds` carried by the data changes within a {@link SharedTreeChange}.
 * @remarks
 * A `build` is retained for every run of nodes created during the transaction.
 * After minimization, a `build` should only remain for nodes that are still
 * present in the document once the transaction is squashed.
 *
 * Also asserts that the `destroys` and `refreshers` fields of the inner change
 * are undefined as they are never expected for a head which is the only change
 * examined in these tests.
 */
function countBuilds(change: SharedTreeChange): BuildStatistics {
	let builds = 0;
	let tops = 0;
	for (const inner of change.changes) {
		if (inner.type === "data") {
			const innerBuilds = inner.innerChange.builds;
			if (innerBuilds !== undefined) {
				builds += innerBuilds.size;
				for (const chunk of innerBuilds.values()) {
					tops += chunk.topLevelLength;
				}
			}
			assert(inner.innerChange.destroys === undefined);
			assert(inner.innerChange.refreshers === undefined);
		}
	}
	return { builds, tops };
}

const sf = new SchemaFactory("transaction-minimize");
const RootStringArray = sf.array("RootArray", sf.string);

class Box extends sf.objectRecursive("Box", {
	value: sf.optional(sf.string),
	nested: sf.optionalRecursive([() => Box]),
	tags: sf.optional(sf.array("tags", sf.string)),
}) {}
{
	type _check = ValidateRecursiveSchema<typeof Box>;
}
const OptionalBox = sf.optional(Box);
const BoxArray = sf.array("BoxArray", Box);

class Pallet extends sf.object("Pallet", {
	boxes: BoxArray,
}) {}
const PalletArray = sf.array("PalletArray", Pallet);

// A second schema factory is used to avoid collisions with the first factory's
// schema names and altering the schema to check upgrading.
const sf2 = new SchemaFactory("transaction-minimize");
const RootStringOrBoxArray = sf2.array("RootArray", [sf2.string, Box]);
const StringOrBoxArraySchemaConfig = {
	schema: RootStringOrBoxArray,
	enableSchemaValidation: true,
} as const;

class BoxWithASecret extends sf2.objectRecursive("Box", {
	value: sf2.optional(sf2.string),
	nested: sf2.optionalRecursive([() => BoxWithASecret]),
	tags: sf2.optional(sf2.array("tags", sf2.string)),
	secret: sf2.optional(sf2.string),
}) {}
{
	type _check = ValidateRecursiveSchema<typeof BoxWithASecret>;
}

const SketchyBoxArray = sf2.array("BoxArray", BoxWithASecret);
const SketchyBoxArraySchemaConfig = {
	schema: SketchyBoxArray,
	enableSchemaValidation: true,
} as const;

/** Transaction parameters that request {@link minimize | minimization} of the resulting change. */
const minimizeParams = { postProcessor: minimize } as const;

type ViewableTreeAlpha = ReturnType<typeof createIndependentTreeAlpha>;

/**
 * A transaction scenario: the schema/content a view is initialized with, plus the sequence of edits to apply to
 * the strongly-typed root node within a single minimized transaction.
 * @typeParam TSchema - The schema of the view the scenario runs against. The initial content and the root node the
 * edits are applied to are both derived from this schema.
 * @remarks The scenario is parameterized by its schema (rather than by the concrete view type) so that a single
 * generic helper can both create the view from {@link TransactionScenario.schema} and run the transaction.
 */
interface TransactionScenario<
	TSchema extends ImplicitFieldSchema,
	TApplyReturn extends
		void | SchematizingSimpleTreeView<ImplicitFieldSchema> = void | SchematizingSimpleTreeView<ImplicitFieldSchema>,
> {
	/** The schema the view is created with before the transaction runs. */
	readonly schema: TSchema;
	/** The content the view is initialized with before the transaction runs. */
	readonly initialContent: InsertableField<TSchema> | (() => InsertableField<TSchema>);
	/** Applies the scenario's edits to the strongly-typed root node inside the transaction. */
	readonly apply: (
		root: ReadableField<TSchema>,
		tree: ViewableTreeAlpha,
		view: SchematizingSimpleTreeView<TSchema>,
	) => TApplyReturn;

	/** Expected build statistics for the scenario executed without minimization. */
	readonly unminimizedBuildExpectations?: BuildStatistics;
	/** Set to true when ❤️ is expected to survive the transaction as content. */
	readonly expectSurvivingMarker: boolean;
}

type StringArrayScenario = TransactionScenario<typeof RootStringArray>;
type BoxScenario = TransactionScenario<typeof OptionalBox>;
type BoxArrayScenario = TransactionScenario<typeof BoxArray>;
type PalletArrayScenario = TransactionScenario<typeof PalletArray>;

/**
 * Given the TreeViewConfiguration, returns a tree, an uninitialized view,
 * and the provider that has a secondary tree for consistency checking.
 *
 * @see ../utils.ts#getView that is basis for this helper.
 */
function getTreeAndView<const TSchema extends ImplicitFieldSchema>(
	config: TreeViewConfiguration<TSchema>,
): {
	tree: ViewableTreeAlpha;
	view: SchematizingSimpleTreeView<TSchema>;
	provider: TestTreeProviderLite;
} {
	const provider = new TestTreeProviderLite(2);
	const tree = provider.trees[0];
	const view = tree.viewWith(config);
	assert(view instanceof SchematizingSimpleTreeView);
	return { tree, view, provider };
}

function isGeneratorFunction<T>(value: T | (() => T)): value is () => T {
	return typeof value === "function";
}

/** Creates the tree and view for a scenario, initialized with the scenario's initial content. */
function createScenarioView<TSchema extends ImplicitFieldSchema>({
	schema,
	initialContent,
}: TransactionScenario<TSchema>): {
	tree: ViewableTreeAlpha;
	view: SchematizingSimpleTreeView<TSchema>;
	provider: TestTreeProviderLite;
} {
	const treeAndView = getTreeAndView(
		new TreeViewConfiguration({
			schema,
			enableSchemaValidation: true,
		}),
	);
	const data = isGeneratorFunction(initialContent) ? initialContent() : initialContent;
	treeAndView.view.initialize(data);
	return treeAndView;
}

const initialContentMarkerRegex = /🕰️/;
const someSurvivingMarkerRegex = /❤️/;
const transientMarkerRegex = /☠️/;

/**
 * Runs a {@link TransactionScenario} in a single minimized transaction.
 *
 * @returns The resulting scenario view and the persisted (serialized) change as a JSON string.
 *
 * @remarks
 * The persisted change is the operation SharedTree writes for document storage.
 * It is obtained via the alpha `getChange` API surfaced on the local "changed"
 * event. Unlike the in-memory {@link SharedTreeChange} (whose inserted node
 * contents live in tree chunks that a naive `JSON.stringify` does not traverse),
 * the serialized change fully encodes inserted node values, so tests can assert
 * that transient content (tagged with ☠️) was stripped by inspecting the JSON text.
 *
 * Additional work needs to be done to inspect any modifications to detached node content.
 * Scenarios may need to define other edits that will reattach detached nodes
 * to the document, so that minimization can be verified to have stripped any
 * extraneous modifications thereof.
 */
function runScenario<
	TSchema extends ImplicitFieldSchema,
	TApplyReturn extends void | SchematizingSimpleTreeView<ImplicitFieldSchema>,
>(
	scenario: TransactionScenario<TSchema, TApplyReturn>,
	{
		validateConsistency = false,
		doNotMinimize = false,
	}: { validateConsistency?: boolean; doNotMinimize?: boolean } = {},
): {
	tree: ViewableTreeAlpha;
	view: TApplyReturn extends SchematizingSimpleTreeView<ImplicitFieldSchema>
		? TApplyReturn
		: SchematizingSimpleTreeView<TSchema>;
	stringifiedChange: JsonString<unknown>;
} {
	const { tree, view, provider } = createScenarioView(scenario);

	let changeJson: JsonCompatibleReadOnly | undefined;
	// Be sure to listen to checkout "changed" instead of view "changed" because the latter
	// might get disposed during the transaction.
	const unsubscribe = view.checkout.events.on("changed", (metadata) => {
		assert(metadata.isLocal, "expected a local change to be produced by the transaction");
		assert(
			changeJson === undefined,
			"expected only one change to be produced by the transaction",
		);
		changeJson = metadata.getChange();
	});
	const result = view.runTransaction(
		() => ({ value: scenario.apply(view.root, tree, view) }),
		doNotMinimize ? undefined : minimizeParams,
	);
	unsubscribe();
	assert(changeJson !== undefined, "expected a change to be produced by the transaction");

	const viewOut = (result.value ??
		view) as TApplyReturn extends SchematizingSimpleTreeView<ImplicitFieldSchema>
		? TApplyReturn
		: SchematizingSimpleTreeView<TSchema>;
	// If requested, validate that the view is consistent with another view
	//  of the same(remote) tree after the transaction.
	if (validateConsistency) {
		provider.synchronizeMessages();
		const otherView = provider.trees[1].kernel.viewWith(
			new TreeViewConfiguration({
				schema: viewOut.schema,
				enableSchemaValidation: true,
			}),
		);
		validateViewConsistency(view.checkout, otherView.checkout);
	}

	const stringifiedChange = JsonStringify<Readonly<unknown> | null>(changeJson);

	// Presence of surviving marker should be consistent regardless of minimize use.
	// So assert within runScenario helper to test minimize expectations and also
	// to catch any test configuration errors where the expectation is not set.
	const survivingAssertionPreface = doNotMinimize
		? "This is a test configuration error: "
		: "";
	if (scenario.expectSurvivingMarker === true) {
		assert.match(
			stringifiedChange,
			someSurvivingMarkerRegex,
			`${survivingAssertionPreface}expected content matching ${someSurvivingMarkerRegex}.`,
		);
	} else {
		assert.doesNotMatch(
			stringifiedChange,
			someSurvivingMarkerRegex,
			`${survivingAssertionPreface}expected no content matching ${someSurvivingMarkerRegex}.`,
		);
	}

	// Initial content marker expectation is also invariant regardless of minimize
	// use. It is never new content and thus should never appear in a change.
	assert.doesNotMatch(stringifiedChange, initialContentMarkerRegex);

	return {
		tree,
		view: viewOut,
		stringifiedChange,
	};
}

/**
 * Like {@link runScenario}, but runs the scenario's edits within an async transaction.
 * @remarks The post-processor infrastructure is agnostic to whether the transaction is sync or async, so this
 * exists to exercise that path "for good measure".
 */
async function runScenarioAsync<
	TSchema extends ImplicitFieldSchema,
	TApplyReturn extends void | SchematizingSimpleTreeView<ImplicitFieldSchema>,
>(
	scenario: TransactionScenario<TSchema, TApplyReturn>,
): Promise<{
	tree: ViewableTreeAlpha;
	view: TApplyReturn extends void ? SchematizingSimpleTreeView<TSchema> : TApplyReturn;
	stringifiedChange: JsonString<unknown>;
}> {
	const { tree, view } = createScenarioView(scenario);

	let changeJson: JsonCompatibleReadOnly | undefined;
	// Be sure to listen to checkout "changed" instead of view "changed" because the latter
	// might get disposed during the transaction.
	const unsubscribe = view.checkout.events.on("changed", (metadata) => {
		assert(metadata.isLocal, "expected a local change to be produced by the transaction");
		assert(
			changeJson === undefined,
			"expected only one change to be produced by the transaction",
		);
		changeJson = metadata.getChange();
	});
	const result = await view.runTransactionAsync(
		async () => ({ value: scenario.apply(view.root, tree, view) }),
		minimizeParams,
	);
	unsubscribe();
	assert(changeJson !== undefined, "expected a change to be produced by the transaction");

	const stringifiedChange = JsonStringify<Readonly<unknown> | null>(changeJson);
	return {
		tree,
		view: (result.value ?? view) as TApplyReturn extends void
			? SchematizingSimpleTreeView<TSchema>
			: TApplyReturn,
		stringifiedChange,
	};
}

// #region Scenario definitions
// Each scenario declares the initial document content and the edits applied to the strongly-typed root node
// within a single minimized transaction. The TSDoc shows the document state (the contents of the root array)
// after each edit step. Nodes tagged with "☠️" are transient: they are created and then removed within the same
// transaction, so their data is extraneous and should be dropped by minimization. Nodes tagged with "❤️" are
// created within the transaction and survive to the end, so their data must be retained.

// #region Array (of strings) scenarios
const arrayScenarios = {
	/**
	 * Inserts "A❤️" at the end of the root.
	 * @remarks
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A❤️" -\> `["A❤️"]`
	 */
	A_inserted: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root) => {
			root.insertAtEnd("A❤️");
		},
		unminimizedBuildExpectations: { builds: 1, tops: 1 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Inserts "A❤️" then "B❤️" at the end of the root.
	 * @remarks
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A❤️" -\> `["A❤️"]`
	 * 2. insert "B❤️" -\> `["A❤️", "B❤️"]`
	 */
	A_then_B_inserted: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root) => {
			root.insertAtEnd("A❤️");
			root.insertAtEnd("B❤️");
		},
		unminimizedBuildExpectations: { builds: 2, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Inserts "A☠️" and then removes it, leaving the root empty.
	 * @remarks
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A☠️" -\> `["A☠️"]`
	 * 2. remove at 0  -\> `[]`
	 */
	A_added_then_removed: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root) => {
			root.insertAtEnd("A☠️");
			root.removeAt(0);
		},
		unminimizedBuildExpectations: { builds: 1, tops: 1 },
		expectSurvivingMarker: false,
	} as const,

	/**
	 * Inserts "A❤️" (which persists) and a transient "B☠️" that is removed within the same transaction.
	 * @remarks
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A❤️"  -\> `["A❤️"]`
	 * 2. insert "B☠️"  -\> `["A❤️", "B☠️"]`
	 * 3. remove at 1   -\> `["A❤️"]`
	 */
	A_kept_and_B_transient: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root) => {
			root.insertAtEnd("A❤️");
			root.insertAtEnd("B☠️");
			root.removeAt(1);
		},
		unminimizedBuildExpectations: { builds: 2, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Inserts "A☠️", then inserts "B❤️" at the end, then removes "A☠️", so only "B❤️" remains.
	 * @remarks
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A☠️"  -\> `["A☠️"]`
	 * 2. insert "B❤️"  -\> `["A☠️", "B❤️"]`
	 * 3. remove at 0   -\> `["B❤️"]`
	 */
	A_replaced_by_B: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root) => {
			root.insertAtEnd("A☠️");
			root.insertAtEnd("B❤️");
			root.removeAt(0);
		},
		unminimizedBuildExpectations: { builds: 2, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Inserts "A☠️", inserts "B❤️" in front of "A☠️", then removes "A☠️", so only "B❤️" remains.
	 * @remarks
	 * Unlike {@link arrayScenarios.A_replaced_by_B}, "B❤️" is inserted ahead of "A☠️" rather than after it. This relocates "A☠️"
	 * (it shifts from index 0 to index 1) before it is removed, exercising minimization's tracking of content that is
	 * inserted and then removed after being moved within the same transaction.
	 *
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A☠️"          -\> `["A☠️"]`
	 * 2. insert "B❤️" at start -\> `["B❤️", "A☠️"]`
	 * 3. remove at 1           -\> `["B❤️"]`
	 */
	B_inserted_before_A_then_A_removed: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root) => {
			root.insertAtEnd("A☠️");
			root.insertAtStart("B❤️");
			root.removeAt(1);
		},
		unminimizedBuildExpectations: { builds: 2, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Inserts "A❤️", "B☠️", "C❤️" and then removes the middle node "B☠️", splitting the inserted run so "A❤️" and "C❤️" remain.
	 * @remarks
	 * "B☠️" is built and then removed in the same transaction, so its build is extraneous; only "A❤️" and "C❤️" survive.
	 *
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A❤️", "B☠️", "C❤️" -\> `["A❤️", "B☠️", "C❤️"]`
	 * 2. remove at 1                 -\> `["A❤️", "C❤️"]`
	 */
	ABC_inserted_then_B_removed: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root) => {
			root.insertAtEnd("A❤️", "B☠️", "C❤️");
			root.removeAt(1);
		},
		unminimizedBuildExpectations: { builds: 1, tops: 3 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Inserts "A❤️", then "B❤️", "C❤️", and then rearranges them by moving "C❤️" to the start.
	 * @remarks
	 * All three nodes survive the transaction (only their order changes), so both builds are expected to remain.
	 *
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A❤️"         -\> `["A❤️"]`
	 * 2. insert "B❤️", "C❤️"  -\> `["A❤️", "B❤️", "C❤️"]`
	 * 3. move "C❤️" to start  -\> `["C❤️", "A❤️", "B❤️"]`
	 */
	A_then_BC_inserted_then_rearranged: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root) => {
			root.insertAtEnd("A❤️");
			root.insertAtEnd("B❤️", "C❤️");
			root.moveToStart(2);
		},
		unminimizedBuildExpectations: { builds: 2, tops: 3 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Inserts "A❤️", "B☠️", "C❤️", moves "B☠️" to the start, and then removes it.
	 * @remarks
	 * "B☠️" is built, relocated, and then removed all within the same transaction, so both its build and its move are
	 * extraneous; only "A❤️" and "C❤️" survive.
	 *
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A❤️", "B☠️", "C❤️" -\> `["A❤️", "B☠️", "C❤️"]`
	 * 2. move "B☠️" to start        -\> `["B☠️", "A❤️", "C❤️"]`
	 * 3. remove at 0                -\> `["A❤️", "C❤️"]`
	 */
	ABC_inserted_then_B_moved_then_removed: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root) => {
			root.insertAtEnd("A❤️", "B☠️", "C❤️");
			root.moveToStart(1);
			root.removeAt(0);
		},
		unminimizedBuildExpectations: { builds: 1, tops: 3 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Inserts "A☠️", "B☠️", "C❤️", moves "B☠️" to the start, and then removes both "B☠️" and "A☠️".
	 * @remarks
	 * "A☠️" and "B☠️" are built, "B☠️" is relocated, and then both are removed all within the same transaction, so both
	 * their builds and moves are extraneous; only "C❤️" survives.
	 *
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A☠️", "B☠️", "C❤️" -\> `["A☠️", "B☠️", "C❤️"]`
	 * 2. move "B☠️" to start        -\> `["B☠️", "A☠️", "C❤️"]`
	 * 3. remove range [0, 2)        -\> `["C❤️"]`
	 */
	ABC_inserted_then_B_moved_then_B_and_A_removed: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root) => {
			root.insertAtEnd("A☠️", "B☠️", "C❤️");
			root.moveToStart(1);
			root.removeRange(0, 2);
		},
		unminimizedBuildExpectations: { builds: 1, tops: 3 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Inserts "A❤️", "B☠️", "C☠️", moves "B☠️" to the start, and then removes both "C☠️" and "B☠️".
	 * @remarks
	 * "B☠️" and "C☠️" are built, "B☠️" is relocated, and then both are removed all within the same transaction, so both
	 * their builds and moves are extraneous; only "A❤️" survives.
	 *
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A❤️", "B☠️", "C☠️" -\> `["A❤️", "B☠️", "C☠️"]`
	 * 2. move "B☠️" to start         -\> `["B☠️", "A❤️", "C☠️"]`
	 * 3. remove at 2                 -\> `["B☠️", "A❤️"]`
	 * 4. remove at 0                 -\> `["A❤️"]`
	 */
	ABC_inserted_then_B_moved_then_C_and_B_removed: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root) => {
			root.insertAtEnd("A❤️", "B☠️", "C☠️");
			root.moveToStart(1);
			root.removeAt(2);
			root.removeAt(0);
		},
		unminimizedBuildExpectations: { builds: 1, tops: 3 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Starts from pre-existing content `["X🕰️", "Y🕰️"]` and inserts a transient "A☠️" that is removed before the
	 * transaction closes, leaving the document unchanged.
	 * @remarks
	 * The pre-existing nodes "X🕰️" and "Y🕰️" are not created by this transaction, so they contribute no builds to its
	 * change. "A☠️" is built and removed within the transaction, so its build is extraneous and should be dropped,
	 * leaving zero builds.
	 *
	 * Steps (root state shown after each):
	 *
	 * 0. initial      -\> `["X🕰️", "Y🕰️"]`
	 * 1. insert "A☠️" -\> `["X🕰️", "A☠️", "Y🕰️"]`
	 * 2. remove at 1  -\> `["X🕰️", "Y🕰️"]`
	 */
	preexisting_content_and_transient_insert: {
		schema: RootStringArray,
		initialContent: ["X🕰️", "Y🕰️"],
		apply: (root) => {
			root.insertAt(1, "A☠️");
			root.removeAt(1);
		},
		unminimizedBuildExpectations: { builds: 1, tops: 1 },
		expectSurvivingMarker: false,
	} as const,

	/**
	 * Starts from pre-existing content `["X🕰️"]` and inserts a transient "A☠️" and a surviving "B❤️", removing "A☠️"
	 * before the transaction closes.
	 * @remarks
	 * "X🕰️" is not created by this transaction. "A☠️" is built and removed within the transaction (extraneous), while
	 * "B❤️" survives, so exactly one build should remain.
	 *
	 * Steps (root state shown after each):
	 *
	 * 0. initial              -\> `["X🕰️"]`
	 * 1. insert "A☠️", "B❤️" -\> `["X🕰️", "A☠️", "B❤️"]`
	 * 2. remove at 1          -\> `["X🕰️", "B❤️"]`
	 */
	preexisting_content_and_surviving_insert: {
		schema: RootStringArray,
		initialContent: ["X🕰️"],
		apply: (root) => {
			root.insertAtEnd("A☠️", "B❤️");
			root.removeAt(1);
		},
		unminimizedBuildExpectations: { builds: 1, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Starts from pre-existing content `["X🕰️", "Y🕰️", "Z🕰️"]` and rearranges it by moving "Z🕰️" to the start, without
	 * creating or removing any nodes.
	 * @remarks
	 * No nodes are created by this transaction (only existing nodes are moved), so the change should carry no builds.
	 *
	 * Steps (root state shown after each):
	 *
	 * 0. initial             -\> `["X🕰️", "Y🕰️", "Z🕰️"]`
	 * 1. move "Z🕰️" to start -\> `["Z🕰️", "X🕰️", "Y🕰️"]`
	 */
	preexisting_content_rearranged: {
		schema: RootStringArray,
		initialContent: ["X🕰️", "Y🕰️", "Z🕰️"],
		apply: (root) => {
			root.moveToStart(2);
		},
		unminimizedBuildExpectations: { builds: 0, tops: 0 },
		expectSurvivingMarker: false,
	} as const,

	/**
	 * Starts from pre-existing content `["X🕰️", "Y🕰️", "Z🕰️"]` and removes "Y🕰️".
	 * @remarks
	 * No nodes are created by this transaction (only an existing node is removed), so the change should carry no builds.
	 *
	 * Steps (root state shown after each):
	 *
	 * 0. initial      -\> `["X🕰️", "Y🕰️", "Z🕰️"]`
	 * 1. remove "Y🕰️" -\> `["X🕰️", "Z🕰️"]`
	 */
	preexisting_content_removed: {
		schema: RootStringArray,
		initialContent: ["X🕰️", "Y🕰️", "Z🕰️"],
		apply: (root) => {
			root.removeAt(1);
		},
		unminimizedBuildExpectations: { builds: 0, tops: 0 },
		expectSurvivingMarker: false,
	} as const,
} as const satisfies Record<string, StringArrayScenario>;
// #endregion

// #region Object (optional Box) scenarios
const objectScenarios = {
	/**
	 * Starts from a {@link Box} with no value, then sets its `value` field twice.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial      -\> `Box: <empty>`
	 * 1. set to "x☠️" -\> `Box: { value: "x☠️" }`
	 * 2. set to "y❤️" -\> `Box: { value: "y❤️" }`
	 *
	 * Classification: x☠️ comes in as new root and leaves as detached root
	 */
	root_Box_value_set_twice: {
		schema: OptionalBox,
		// The initial content is provided as it may be used inserted into more than one tree with in one test case.
		initialContent: () => new Box({}),
		apply: (root) => {
			assert.ok(root);
			root.value = "x☠️";
			root.value = "y❤️";
		},
		unminimizedBuildExpectations: { builds: 2, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Starts from a nested {@link Box} with no value, then sets its `value` field twice.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial      -\> `Box: { nested: Box: <empty> }`
	 * 1. set to "x☠️" -\> `Box: { nested: Box: { value: "x☠️" } }`
	 * 2. set to "y❤️" -\> `Box: { nested: Box: { value: "y❤️" } }`
	 *
	 * Classification: x☠️ comes in as new root and leaves as detached root
	 */
	nested_Box_value_set_twice: {
		schema: OptionalBox,
		// The initial content is provided as it may be used inserted into more than one tree with in one test case.
		initialContent: () => new Box({ nested: new Box({}) }),
		apply: (root) => {
			assert.ok(root?.nested);
			root.nested.value = "x☠️";
			root.nested.value = "y❤️";
		},
		unminimizedBuildExpectations: { builds: 2, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Starts from a {@link Box} with no value, sets its `value` field, then removes the box.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial      -\> `Box: <empty>`
	 * 1. set to "x☠️" -\> `Box: { value: "x☠️" }`
	 * 2. remove box   -\> `undefined`
	 *
	 * Classification: x☠️ comes in as new root and leaves as nested under [detached] prior node
	 */

	root_Box_value_set_then_root_Box_removed: {
		schema: OptionalBox,
		// The initial content is provided as it may be used inserted into more than one tree with in one test case.
		initialContent: () => new Box({}),
		apply: (_root, _tree, view) => {
			assert.ok(view.root);
			view.root.value = "x☠️";
			view.root = undefined;
		},
		unminimizedBuildExpectations: { builds: 1, tops: 1 },
		expectSurvivingMarker: false,
	} as const,

	/**
	 * Starts from a nested {@link Box} with no value, sets its `value` field, then removes the root box.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial          -\> `Box: { nested: Box: <empty> } }`
	 * 1. set to "x☠️"     -\> `Box: { nested: Box: { value: "x☠️" } }`
	 * 2. remove root box  -\> `undefined`
	 *
	 * Classification: x☠️ comes in as new root and leaves as nested under [detached] prior node
	 */
	nested_Box_value_set_then_root_Box_removed: {
		schema: OptionalBox,
		// The initial content is provided as it may be used inserted into more than one tree with in one test case.
		initialContent: () => new Box({ nested: new Box({}) }),
		apply: (_root, _tree, view) => {
			assert.ok(view.root?.nested);
			view.root.nested.value = "x☠️";
			view.root = undefined;
		},
		unminimizedBuildExpectations: { builds: 1, tops: 1 },
		expectSurvivingMarker: false,
	} as const,

	/**
	 * Starts from a nested {@link Box} with no value, sets its `value` field, then removes the nested box.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial            -\> `Box: { nested: Box: <empty> }`
	 * 1. set to "x☠️"       -\> `Box: { nested: Box: { value: "x☠️" } }`
	 * 2. remove nested box  -\> `Box: <empty>`
	 *
	 * Classification: x☠️ comes in as new root and leaves as nested under [detached] prior node
	 */
	nested_Box_value_set_then_nested_Box_removed: {
		schema: OptionalBox,
		// The initial content is provided as it may be used inserted into more than one tree with in one test case.
		initialContent: () => new Box({ nested: new Box({}) }),
		apply: (_root, _tree, view) => {
			assert.ok(view.root?.nested);
			view.root.nested.value = "x☠️";
			delete view.root.nested;
		},
		unminimizedBuildExpectations: { builds: 1, tops: 1 },
		expectSurvivingMarker: false,
	} as const,

	/**
	 * Starts from an empty {@link Box}, adds a nested {@link Box} with a `value` field, then removes the box.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial                             -\> `Box: <empty>`
	 * 1. insert nested Box with value "x☠️"  -\> `Box: { nested: Box: { value: "x☠️" } }`
	 * 2. remove root box                     -\> `undefined`
	 *
	 * Classification: x☠️ comes in as new nested content and leaves as nested under [detached] prior node (same parent)
	 */
	nest_Box_with_value_then_root_Box_removed: {
		schema: OptionalBox,
		// The initial content is provided as it may be used inserted into more than one tree with in one test case.
		initialContent: () => new Box({}),
		apply: (_root, _tree, view) => {
			assert.ok(view.root);
			view.root.nested = new Box({ value: "x☠️" });
			view.root = undefined;
		},
		unminimizedBuildExpectations: { builds: 1, tops: 1 },
		expectSurvivingMarker: false,
	} as const,

	/**
	 * Starts from an empty root, inserts a {@link Box} with value "x☠️", then sets its value to "y❤️".
	 * @remarks
	 * Steps:
	 *
	 * 0. initial                 -\> `undefined`
	 * 1. insert Box "x☠️"        -\> `Box: { value: "x☠️" }`
	 * 2. set Box value to "y❤️"  -\> `Box: { value: "y❤️" }`
	 *
	 * Classification: x☠️ comes in as new nested content and leaves as detached root
	 */
	add_root_Box_then_replace_value: {
		schema: OptionalBox,
		initialContent: undefined,
		apply: (_root, _tree, view) => {
			const root = new Box({ value: "x☠️" });
			view.root = root;
			root.value = "y❤️";
		},
		unminimizedBuildExpectations: { builds: 2, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Starts from an empty root, inserts a nested {@link Box} with value "x☠️", then sets its value to "y❤️".
	 * @remarks
	 * Steps:
	 *
	 * 0. initial                  -\> `undefined`
	 * 1. insert nested Box "x☠️"  -\> `Box: { nested: Box: { value: "x☠️" } }`
	 * 2. set Box value to "y❤️"   -\> `Box: { nested: Box: { value: "y❤️" } }`
	 *
	 * Classification: x☠️ comes in as new nested content and leaves as detached root
	 */
	add_nested_Box_then_replace_value: {
		schema: OptionalBox,
		initialContent: undefined,
		apply: (_root, _tree, view) => {
			// Step 1: insert nested Box
			const nested = new Box({ value: "x☠️" });
			view.root = new Box({ nested });
			// Step 2: set nested Box value
			nested.value = "y❤️";
		},
		unminimizedBuildExpectations: { builds: 2, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Starts from an empty root, inserts a nested {@link Box} with value "x☠️", then replaces nested Box with new "y❤️" box.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial                              -\> `undefined`
	 * 1. insert nested Box "x☠️"              -\> `Box: { nested: Box: { value: "x☠️" } }`
	 * 2. replace nested Box (with "y❤️" Box)  -\> `Box: { nested: Box: { value: "y❤️" } }`
	 *
	 * Classification: x☠️ comes in as new nested content and leaves as nested under [detached] new node (same parent)
	 */
	add_nested_Box_then_replace_nested_Box: {
		schema: OptionalBox,
		initialContent: undefined,
		apply: (_root, _tree, view) => {
			// Step 1: insert nested Box
			const nested = new Box({ value: "x☠️" });
			const root = new Box({ nested });
			view.root = root;
			// Step 2: replace nested Box
			root.nested = new Box({ value: "y❤️" });
		},
		unminimizedBuildExpectations: { builds: 2, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Starts from an empty root, inserts a nested {@link Box}, sets value "x☠️", then replaces nested Box with new "y❤️" box.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial                              -\> `undefined`
	 * 1. insert nested empty Box              -\> `Box: { nested: Box: <empty> }`
	 * 2. set nested Box to "x☠️"              -\> `Box: { nested: Box: { value: "x☠️" } }`
	 * 3. replace nested Box (with "y❤️" Box)  -\> `Box: { nested: Box: { value: "y❤️" } }`
	 *
	 * Classification: x☠️ comes in as new root content and leaves as nested under [detached] new node
	 */
	add_nested_Box_set_value_then_replace_nested_Box: {
		schema: OptionalBox,
		initialContent: undefined,
		apply: (_root, _tree, view) => {
			// Step 1: insert nested empty Box
			const nested = new Box({});
			const root = new Box({ nested });
			view.root = root;
			// Step 2: set nested Box to "x☠️"
			nested.value = "x☠️";
			// Step 3: replace nested Box
			root.nested = new Box({ value: "y❤️" });
		},
		unminimizedBuildExpectations: { builds: 3, tops: 3 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Starts from an empty root, inserts a box with "x❤️" and a nested {@link Box} with value "y☠️", then removes nested Box.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial                                  -\> `undefined`
	 * 1. insert Box "x❤️" with nested Box "y☠️"  -\> `Box: { value: "x❤️", nested: Box: { value: "y☠️" } }`
	 * 2. remove nested Box                        -\> `Box: { value: "x❤️" }`
	 *
	 * Classification: y☠️ comes in as new nested content and leaves nested under [detached] new node
	 */
	add_Box_with_nested_Box_then_remove_nested_Box: {
		schema: OptionalBox,
		initialContent: undefined,
		apply: (_root, _tree, view) => {
			// Step 1: insert nested Box
			const nested = new Box({ value: "y☠️" });
			const root = new Box({ value: "x❤️", nested });
			view.root = root;
			// Step 2: remove nested Box
			root.nested = undefined;
		},
		unminimizedBuildExpectations: { builds: 1, tops: 1 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Starts from a nested {@link Box} with one tag, inserts two tags, moves one, then removes the root box.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial                  -\> `Box: { nested: Box: { tags: ["a🕰️"] } } }`
	 * 1. insert tags "x☠️" "y☠️" -\> `Box: { nested: Box: { tags: ["x☠️", "y☠️","a🕰️"] } }`
	 * 2. move tag 0 to end        -\> `Box: { nested: Box: { tags: ["y☠️", "a🕰️", "x☠️"] } }`
	 * 3. remove root box          -\> `undefined`  |: `Box: { nested: Box: { tags: ["y☠️", "a🕰️", "x☠️"] } }`
	 *
	 * Classification: x☠️ and y☠️ come in as new roots and leave as nested under [detached] prior node
	 */
	nested_Box_tags_inserted_then_one_tag_moved_and_root_Box_removed: {
		schema: OptionalBox,
		// The initial content is generated as it may be used inserted into more than one tree with in one test case.
		initialContent: () => new Box({ nested: new Box({ tags: ["a🕰️"] }) }),
		apply: (_root, _tree, view) => {
			assert.ok(view.root?.nested?.tags);
			const tags = view.root.nested.tags;
			tags.insertAtStart("x☠️", "y☠️");
			tags.moveRangeToEnd(0, 1);
			view.root = undefined;
		},
		unminimizedBuildExpectations: { builds: 1, tops: 2 },
		expectSurvivingMarker: false,
	} as const,

	/**
	 * Starts from a nested {@link Box} with two tags, inserts two tags, rearranges tags, removes a tag, then removes the tags field.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial           -\> `Box: { nested: Box: { tags: ["a🕰️", "b🕰️"] } } }`
	 * 1. insert tags "x☠️" "y☠️"  -\> `Box: { nested: Box: { tags: ["a🕰️", "x☠️", "y☠️", "b🕰️"] } }`
	 * 2. rearrange                 -\> `Box: { nested: Box: { tags: ["a🕰️", "y☠️", "b🕰️", "x☠️"] } }`
	 * 2. remove tag[0]             -\> `Box: { nested: Box: { tags: ["y☠️", "b🕰️", "x☠️"] } }`         |: "a🕰️"
	 * 3. delete nested.tags        -\> `Box: { nested: Box: <empty> } }`                                |: "a🕰️", `tags: ["y☠️", "b🕰️", "x☠️"]`
	 * 4. set nested value          -\> `Box: { nested: Box: { value: "z❤️" } } }`                       |: "a🕰️", `tags: ["y☠️", "b🕰️", "x☠️"]`
	 *
	 * Classification: x☠️ and y☠️ come in as new root and leave as nested under [detached] prior node
	 */
	nested_Box_tags_inserted_then_tags_rearranged_and_removed: {
		schema: OptionalBox,
		// The initial content is generated as it may be used inserted into more than one tree with in one test case.
		initialContent: () => new Box({ nested: new Box({ tags: ["a🕰️", "b🕰️"] }) }),
		apply: (_root, _tree, view) => {
			const nested = view.root?.nested;
			assert.ok(nested?.tags);
			nested.tags.insertAt(1, "x☠️", "y☠️");
			nested.tags.moveRangeToIndex(1, 2, 4);
			nested.tags.removeAt(0);
			delete nested.tags;
			// Set a surving value to be able to verify some change survives
			nested.value = "z❤️";
		},
		unminimizedBuildExpectations: { builds: 2, tops: 3 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Starts from an empty {@link Box}, adds a nested {@link Box} with `tags` field, changes `tags`, then removes the box.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial                                      -\> `Box: <empty>`
	 * 1. insert nested Box with tags ["x☠️", "y☠️"]  -\> `Box: { nested: Box: { tags: ["x☠️", "y☠️"] } }`
	 * 2. remove tag at 0                              -\> `Box: { nested: Box: { tags: ["y☠️"] } }`         |: "x☠️"
	 * 3. remove root box                              -\> `undefined`                                       |: "x☠️", `Box: { nested: Box: { tags: ["y☠️"] } }`
	 *
	 * Classification: x☠️ and y☠️ come in as new nested content and leave as detached root and nested under [detached] prior node (same parent), respectively
	 */
	nest_Box_with_tags_then_root_Box_removed: {
		schema: OptionalBox,
		// The initial content is generated as it may be used inserted into more than one tree with in one test case.
		initialContent: () => new Box({}),
		apply: (_root, _tree, view) => {
			assert.ok(view.root);
			const nested = new Box({ tags: ["x☠️", "y☠️"] });
			view.root.nested = nested;
			nested.tags?.removeAt(0);
			view.root = undefined;
		},
		unminimizedBuildExpectations: { builds: 1, tops: 1 },
		expectSurvivingMarker: false,
	} as const,

	/**
	 * Starts from an empty root, inserts a {@link Box} with tags ["x❤️", "y☠️"], then transforms tags to ["z❤️", "x❤️"].
	 * @remarks
	 * This injected "x❤️" and "y☠️" are both moved twice. Then "y☠️" is removed, leaving "x❤️".
	 * Steps:
	 *
	 * 0. initial                    -\> `undefined`
	 * 1. insert Box with tags ["x❤️", "y☠️"]  -\> `Box: { tags: ["x❤️", "y☠️"] }`
	 * 2. insert tag "z❤️" at 0      -\> `Box: { tags: ["z❤️", "x❤️", "y☠️"] }`
	 * 3. move tag 1 "x❤️" to 0      -\> `Box: { tags: ["x❤️", "z❤️", "y☠️"] }`
	 * 4. move tag 2 "y☠️" to 1      -\> `Box: { tags: ["x❤️", "y☠️", "z❤️"] }`
	 * 5. move tag 1 "y☠️" to 0      -\> `Box: { tags: ["y☠️", "x❤️", "z❤️"] }`
	 * 6. move tag 1 "x❤️" to 2      -\> `Box: { tags: ["y☠️", "z❤️", "x❤️"] }`
	 * 7. remove tag at 0            -\> `Box: { tags: ["z❤️", "x❤️"] }`          |: "y☠️"
	 *
	 * Classification: y☠️ comes in as new nested content and leaves as detached root
	 */
	add_root_Box_then_edit_tags: {
		schema: OptionalBox,
		initialContent: undefined,
		apply: (_root, _tree, view) => {
			const root = new Box({ tags: ["x❤️", "y☠️"] });
			view.root = root;
			assert.ok(root.tags);
			root.tags.insertAt(0, "z❤️");
			root.tags.moveRangeToIndex(0, 1, 2); // Move "x❤️" to index 0
			root.tags.moveRangeToIndex(1, 2, 3); // Move "y☠️" to index 1
			root.tags.moveRangeToStart(1, 2); // Move "y☠️" to index 0
			root.tags.moveRangeToEnd(1, 2); // Move "x❤️" to index 2
			root.tags.removeAt(0);
		},
		unminimizedBuildExpectations: { builds: 2, tops: 2 },
		expectSurvivingMarker: true,
	} as const,
} as const satisfies Record<string, BoxScenario>;
// #endregion

// #region Multiple Object (parallel Pallet trees) scenarios
const parallelObjectScenarios = {
	/**
	 * Starts from a root array of two {@link Pallet} nodes, each with two boxes. Inserts two boxes into the first Pallet,
	 * moves a range of the first Pallet's boxes into the second Pallet, then removes the second Pallet.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial                                                     -\> `[ { boxes: [{ "1🕰️" }, { "2🕰️" }]                        }, { boxes: [{ "3🕰️" }, { "4🕰️" }] } ]`
	 * 1. insert Box "5☠️", Box "6❤️" into pallet0.boxes             -\> `[ { boxes: [{ "1🕰️" }, { "5☠️" }, { "6❤️" }, { "2🕰️" }] }, { boxes: [{ "3🕰️" }, { "4🕰️" }] } ]`
	 * 2. move pallet0.boxes[0..2) ("1🕰️", "5☠️") into pallet1.boxes -\> `[ { boxes: [{ "6❤️" }, { "2🕰️" }]                        }, { boxes: [{ "3🕰️" }, { "1🕰️" }, { "5☠️" }, { "4🕰️" }] } ]`
	 * 3. remove root[1] (pallet1)                                    -\> `[ { boxes: [{ "6❤️" }, { "2🕰️" }] } ]`      |: `{ boxes: [{ "3🕰️" }, { "1🕰️" }, { "5☠️" }, { "4🕰️" }] }`
	 *
	 * Classification: 5☠️ comes in as new content under pallet0 and leaves under the detached sibling pallet1
	 */
	boxes_inserted_then_some_moved_to_sibling_Pallet_that_is_then_removed: {
		schema: PalletArray,
		// The initial content is generated as it may be used inserted into more than one tree with in one test case.
		initialContent: () => [
			new Pallet({ boxes: [new Box({ value: "1🕰️" }), new Box({ value: "2🕰️" })] }),
			new Pallet({ boxes: [new Box({ value: "3🕰️" }), new Box({ value: "4🕰️" })] }),
		],
		apply: (root) => {
			const [pallet0, pallet1] = root;
			pallet0.boxes.insertAt(1, new Box({ value: "5☠️" }), new Box({ value: "6❤️" }));
			pallet1.boxes.moveRangeToIndex(1, 0, 2, pallet0.boxes);
			root.removeAt(1);
		},
		unminimizedBuildExpectations: { builds: 1, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Starts from a root array of two {@link Pallet} nodes, each with two boxes. Inserts two boxes into the first Pallet,
	 * moves a range of the first Pallet's boxes into the second Pallet, then removes the first Pallet.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial                                                     -\> `[ { boxes: [{ "1🕰️" }, { "2🕰️" }]                        }, { boxes: [{ "3🕰️" }, { "4🕰️" }] } ]`
	 * 1. insert Box "5❤️", Box "6☠️" into pallet0.boxes             -\> `[ { boxes: [{ "1🕰️" }, { "5❤️" }, { "6☠️" }, { "2🕰️" }] }, { boxes: [{ "3🕰️" }, { "4🕰️" }] } ]`
	 * 2. move pallet0.boxes[0..2) ("1🕰️", "5❤️") into pallet1.boxes -\> `[ { boxes: [{ "6☠️" }, { "2🕰️" }]                        }, { boxes: [{ "3🕰️" }, { "1🕰️" }, { "5❤️" }, { "4🕰️" }] } ]`
	 * 3. remove root[0] (pallet0)                                    -\> `[ { boxes: [{ "3🕰️" }, { "1🕰️" }, { "5❤️" }, { "4🕰️" }] } ]`   |: `{ boxes: [{ "6☠️" }, { "2🕰️" }] }`
	 *
	 * Classification: 6☠️ comes in as new content under pallet0 and leaves under the detached pallet0
	 */
	boxes_inserted_then_some_moved_to_sibling_Pallet_and_original_parent_Pallet_is_then_removed:
		{
			schema: PalletArray,
			// The initial content is generated as it may be used inserted into more than one tree with in one test case.
			initialContent: () => [
				new Pallet({ boxes: [new Box({ value: "1🕰️" }), new Box({ value: "2🕰️" })] }),
				new Pallet({ boxes: [new Box({ value: "3🕰️" }), new Box({ value: "4🕰️" })] }),
			],
			apply: (root) => {
				const [pallet0, pallet1] = root;
				pallet0.boxes.insertAt(1, new Box({ value: "5❤️" }), new Box({ value: "6☠️" }));
				pallet1.boxes.moveRangeToIndex(1, 0, 2, pallet0.boxes);
				root.removeAt(0);
			},
			unminimizedBuildExpectations: { builds: 1, tops: 2 },
			expectSurvivingMarker: true,
		} as const,

	/**
	 * Starts from a root array of one {@link Pallet} node with two boxes. Inserts two boxes into a new Pallet,
	 * moves one of the new Pallet's boxes into the first Pallet, then removes the new Pallet.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial                                                    -\> `[ { boxes: [{ "1🕰️" }, { "2🕰️" }]             } ]`
	 * 1. insert pallet1                                             -\> `[ { boxes: [{ "1🕰️" }, { "2🕰️" }]             }, { boxes: []                      } ]`
	 * 2. insert Box "3❤️", Box "4☠️" into pallet1.boxes            -\> `[ { boxes: [{ "1🕰️" }, { "2🕰️" }]             }, { boxes: [{ "3❤️" }, { "4☠️" }] } ]`
	 * 3. move pallet1.boxes[0..1) ("3❤️") into pallet0.boxes        -\> `[ { boxes: [{ "1🕰️" }, { "3❤️" }, { "2🕰️" }] }, { boxes: [{ "4☠️" }]             } ]`
	 * 4. remove root[1] (pallet1)                                   -\> `[ { boxes: [{ "1🕰️" }, { "3❤️" }, { "2🕰️" }] } ]`   |: `{ boxes: [{ "4☠️" }] }`
	 *
	 * Classification: 4☠️ comes in as new content under new Pallet and leaves under the detached new Pallet
	 */
	boxes_inserted_in_new_Pallet_then_one_moved_to_sibling_Pallet_and_new_Pallet_is_then_removed:
		{
			schema: PalletArray,
			// The initial content is generated as it may be used inserted into more than one tree with in one test case.
			initialContent: () => [
				new Pallet({ boxes: [new Box({ value: "1🕰️" }), new Box({ value: "2🕰️" })] }),
			],
			apply: (root) => {
				const [pallet0] = root;
				const pallet1 = new Pallet({ boxes: [] });
				root.insertAtEnd(pallet1);
				pallet1.boxes.insertAtStart(new Box({ value: "3❤️" }), new Box({ value: "4☠️" }));
				pallet0.boxes.moveRangeToIndex(1, 0, 1, pallet1.boxes);
				root.removeAt(1);
			},
			unminimizedBuildExpectations: { builds: 2, tops: 3 },
			expectSurvivingMarker: true,
		} as const,

	/**
	 * Starts from a root array of one {@link Pallet} node with two boxes. Inserts a new Pallet holding a single box,
	 * moves one of the first Pallet's boxes into the new Pallet, then removes the new Pallet.
	 * @remarks
	 * Steps:
	 *
	 * 0. initial                                                    -\> `[ { boxes: [{ "1🕰️" }, { "2🕰️" }] } ]`
	 * 1. insert pallet1 with box "3☠️"                              -\> `[ { boxes: [{ "1🕰️" }, { "2🕰️" }] }, { boxes: [{ "3☠️" }] } ]`
	 * 2. move pallet0.boxes[0..1) ("1🕰️") into pallet1.boxes        -\> `[ { boxes: [{ "2🕰️" }] }, { boxes: [{ "3☠️" }, { "1🕰️" }] } ]`
	 * 3. remove root[1] (pallet1)                                   -\> `[ { boxes: [{ "2🕰️" }] } ]`   |: `{ boxes: [{ "3☠️" }, { "1🕰️" }] }`
	 *
	 * Classification: transient 3☠️ comes in as new content under new pallet1 and leaves under the detached pallet1;
	 * pre-existing 1🕰️ is moved into new pallet1 and also leaves under the detached pallet1. Nothing survives as new content.
	 */
	boxes_moved_into_new_Pallet_then_new_Pallet_is_then_removed: {
		schema: PalletArray,
		// The initial content is generated as it may be used inserted into more than one tree with in one test case.
		initialContent: () => [
			new Pallet({ boxes: [new Box({ value: "1🕰️" }), new Box({ value: "2🕰️" })] }),
		],
		apply: (root) => {
			const [pallet0] = root;
			const pallet1 = new Pallet({ boxes: [new Box({ value: "3☠️" })] });
			root.insertAtEnd(pallet1);
			pallet1.boxes.moveRangeToIndex(1, 0, 1, pallet0.boxes);
			root.removeAt(1);
		},
		unminimizedBuildExpectations: { builds: 1, tops: 1 },
		expectSurvivingMarker: false,
	} as const,
} as const satisfies Record<string, PalletArrayScenario>;
// #endregion

// #region Schema upgrade scenarios
const schemaUpgradeScenarios = {
	/**
	 * Starts from an empty root, inserts a transient "A☠️" and a surviving "B❤️", then upgrades the schema to allow {@link Box} nodes in the root array.
	 * @remarks
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A☠️"    -\> `["A☠️"]`
	 * 2. insert "B❤️"    -\> `["A☠️", "B❤️"]`
	 * 3. remove at 0     -\> `["B❤️"]`
	 * 4. upgrade schema  -\> `["B❤️"]`
	 */
	edit_before_schema_change: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root, tree, view) => {
			root.insertAtEnd("A☠️");
			root.insertAtEnd("B❤️");
			root.removeAt(0);

			// before upgrade edits are complete; dispose view to permit upgrade
			view.dispose();

			// Update schema which now allows Boxes in root array.
			const view2 = tree.viewWith(new TreeViewConfiguration(StringOrBoxArraySchemaConfig));
			assert(view2 instanceof SchematizingSimpleTreeView);
			view2.upgradeSchema();

			return view2;
		},
		unminimizedBuildExpectations: { builds: 2, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Performs schema upgrade to allow {@link Box} nodes in the root array, inserts a {@link Box} with value "C☠️", and finally sets its value to "D❤️".
	 * @remarks
	 * Steps (root state shown after each):
	 *
	 * 0. initial                 -\> `["A🕰️"]`
	 * 1. upgrade schema          -\> `["A🕰️"]`
	 * 2. insert Box "C☠️"       -\> `["A🕰️", Box: "C☠️"]`
	 * 3. set Box value to "D❤️" -\> `["A🕰️", Box: "D❤️"]`
	 */
	edit_after_schema_change: {
		schema: RootStringArray,
		initialContent: ["A🕰️"],
		apply: (_root, tree, view) => {
			// Force dispose view to permit upgrade
			view.dispose();

			// Update schema which now allows Boxes in root array.
			const view2 = tree.viewWith(new TreeViewConfiguration(StringOrBoxArraySchemaConfig));
			assert(view2 instanceof SchematizingSimpleTreeView);
			view2.upgradeSchema();

			const box = new Box({ value: "C☠️" });
			view2.root.insertAtEnd(box);
			box.value = "D❤️";

			return view2;
		},
		unminimizedBuildExpectations: { builds: 2, tops: 2 },
		expectSurvivingMarker: true,
	} as const,

	/**
	 * Combines {@link arrayScenarios.edit_before_schema_change} and {@link arrayScenarios.edit_after_schema_change} to perform edits on both sides of a schema change.
	 * @remarks
	 * Steps (root state shown after each):
	 *
	 * 1. insert "A☠️"           -\> `["A☠️"]`
	 * 2. insert "B❤️"           -\> `["A☠️", "B❤️"]`
	 * 3. remove at 0             -\> `["B❤️"]`
	 * 4. upgrade schema          -\> `["B❤️"]`
	 * 5. insert Box "C☠️"       -\> `["B❤️", Box: "C☠️"]`
	 * 6. set Box value to "D❤️" -\> `["B❤️", Box: "D❤️"]`
	 */
	edit_before_and_after_schema_change: {
		schema: RootStringArray,
		initialContent: [],
		apply: (root, tree, view) => {
			root.insertAtEnd("A☠️");
			root.insertAtEnd("B❤️");
			root.removeAt(0);

			// before upgrade edits are complete; dispose view to permit upgrade
			view.dispose();

			// Update schema which now allows Boxes in root array.
			const view2 = tree.viewWith(new TreeViewConfiguration(StringOrBoxArraySchemaConfig));
			assert(view2 instanceof SchematizingSimpleTreeView);
			view2.upgradeSchema();

			const box = new Box({ value: "C☠️" });
			view2.root.insertAtEnd(box);
			box.value = "D❤️";

			return view2;
		},
		unminimizedBuildExpectations: { builds: 4, tops: 4 },
		expectSurvivingMarker: true,
	} as const,

	// #endregion
} as const satisfies Record<string, StringArrayScenario>;
// #endregion

describe("transaction minimize post-processor", () => {
	it("can be supplied as a transaction post-processor without error", () => {
		const { view } = runScenario(arrayScenarios.A_inserted);
		assert.deepEqual([...view.root], ["A❤️"]);
	});

	describe("self-tests - no minimization applicable", () => {
		it("embeds surviving markers but not transient marker for a purely additive scenario", () => {
			const { stringifiedChange } = runScenario(arrayScenarios.A_then_B_inserted);
			// Sanity check for the serialization mechanism: content that survives the
			// transaction is present in the persisted change, so tests can meaningfully
			// assert on its absence for transient content.

			// Custom assertion for this self-test
			assert.match(stringifiedChange, /[AB]❤️.*[AB]❤️/);

			// Common assertions
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
		});

		it("result carries no build when pre-existing content is only rearranged", () => {
			const { view, stringifiedChange } = runScenario(
				arrayScenarios.preexisting_content_rearranged,
			);
			assert.deepEqual([...view.root], ["Z🕰️", "X🕰️", "Y🕰️"]);
			// Nothing inserted; should always pass.
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// No nodes are created by the transaction (only moved), so the change should carry no builds.
			assert.deepEqual(countBuilds(change), { builds: 0, tops: 0 });
		});

		it("result carries no build when pre-existing content is only removed", () => {
			const { view, stringifiedChange } = runScenario(
				arrayScenarios.preexisting_content_removed,
			);
			assert.deepEqual([...view.root], ["X🕰️", "Z🕰️"]);
			// Nothing inserted; should always pass.
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// No nodes are created by the transaction (only removed), so the change should carry no builds.
			assert.deepEqual(countBuilds(change), { builds: 0, tops: 0 });
		});

		it("reflects the order of only-rearranged inserted nodes and keeps every build", () => {
			const { view, stringifiedChange } = runScenario(
				arrayScenarios.A_then_BC_inserted_then_rearranged,
			);
			assert.deepEqual([...view.root], ["C❤️", "A❤️", "B❤️"]);
			// None were inserted; should always pass.
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// "A❤️", "B❤️", and "C❤️" all survive (only reordered), so both builds (A and B-C) should remain.
			assert.deepEqual(countBuilds(change), { builds: 2, tops: 3 });
		});

		// If any of these tests start to fail, the system has new capabilities
		// and additional scenarios should be added to verify minimize handles
		// them correctly.
		describe("existing content re-inserted raises exception", () => {
			it("nesting original box under new parent in array", () => {
				assert.throws(() => {
					const { view, stringifiedChange } = runScenario({
						schema: BoxArray,
						initialContent: [new Box({ value: "A🕰️" })],
						apply: (root) => {
							const originalBox = root[0];
							// detach the original box
							root.removeAt(0);
							const parent = new Box({ value: "B❤️", nested: originalBox }); // currently throws here
							root.insertAtEnd(parent);
						},
						expectSurvivingMarker: true,
					} as const satisfies BoxArrayScenario);
					assert.equal(view.root.length, 1);
					assert.equal(view.root[0].value, "B❤️");
					assert.equal(view.root[0].nested?.value, "A🕰️");
					assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
				}, /A node with schema .+ was inserted into the tree more than once. This is not supported./);
			});

			it("nesting original box under new root parent", () => {
				assert.throws(() => {
					const { view: viewResult, stringifiedChange } = runScenario({
						schema: OptionalBox,
						initialContent: new Box({ value: "A🕰️" }),
						apply: (_root, _tree, view_) => {
							const originalBox = view_.root;
							// detach the original box
							view_.root = undefined;
							const parent = new Box({ value: "B❤️", nested: originalBox }); // currently throws here
							view_.root = parent;
						},
						expectSurvivingMarker: true,
					} as const satisfies BoxScenario);
					assert.equal(viewResult.root?.value, "B❤️");
					assert.equal(viewResult.root?.nested?.value, "A🕰️");
					assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
				}, /A node with schema .+ was inserted into the tree more than once. This is not supported./);
			});
		});
	});

	// These tests only assert the observable end state of the document. Minimization must never change the
	// observable result of a transaction, so these are expected to PASS regardless of whether minimization is
	// actually implemented.
	describe("preserves the observable result and new content appears in change", () => {
		it("keeps inserted nodes", () => {
			const { view } = runScenario(arrayScenarios.A_then_B_inserted);
			assert.deepEqual([...view.root], ["A❤️", "B❤️"]);
		});

		it("nets a create-then-remove to no change", () => {
			const { view } = runScenario(arrayScenarios.A_added_then_removed);
			assert.deepEqual([...view.root], []);
		});

		it("keeps only the persisted node when a transient node is also created", () => {
			const { view } = runScenario(arrayScenarios.A_kept_and_B_transient);
			assert.deepEqual([...view.root], ["A❤️"]);
		});

		it("reflects only the final value of a node replaced within the transaction", () => {
			const { view } = runScenario(arrayScenarios.A_replaced_by_B);
			assert.deepEqual([...view.root], ["B❤️"]);
		});

		it("reflects only the surviving node when inserted content is relocated then removed", () => {
			const { view } = runScenario(arrayScenarios.B_inserted_before_A_then_A_removed);
			assert.deepEqual([...view.root], ["B❤️"]);
		});

		it("keeps the surrounding nodes when a node in the middle of an inserted run is removed", () => {
			const { view } = runScenario(arrayScenarios.ABC_inserted_then_B_removed);
			assert.deepEqual([...view.root], ["A❤️", "C❤️"]);
		});

		it("keeps the surrounding nodes when an inserted node is moved then removed", () => {
			const { view } = runScenario(arrayScenarios.ABC_inserted_then_B_moved_then_removed);
			assert.deepEqual([...view.root], ["A❤️", "C❤️"]);
		});

		it("keeps only the trailing node when a moved node and its successor from leading node are removed", () => {
			const { view } = runScenario(
				arrayScenarios.ABC_inserted_then_B_moved_then_B_and_A_removed,
			);
			assert.deepEqual([...view.root], ["C❤️"]);
		});

		it("keeps only the leading node when a moved node and its insertion companion are removed", () => {
			const { view } = runScenario(
				arrayScenarios.ABC_inserted_then_B_moved_then_C_and_B_removed,
			);
			assert.deepEqual([...view.root], ["A❤️"]);
		});

		it("leaves pre-existing content unchanged when a transient node is inserted then removed", () => {
			const { view } = runScenario(arrayScenarios.preexisting_content_and_transient_insert);
			assert.deepEqual([...view.root], ["X🕰️", "Y🕰️"]);
		});

		it("keeps pre-existing content and the surviving inserted node", () => {
			const { view } = runScenario(arrayScenarios.preexisting_content_and_surviving_insert);
			assert.deepEqual([...view.root], ["X🕰️", "B❤️"]);
		});

		it("reflects only the final value of a root object field set multiple times", () => {
			const { view } = runScenario(objectScenarios.root_Box_value_set_twice);
			assert.equal(view.root?.value, "y❤️");
		});

		it("reflects only the final undefined root when only item's value of a field is set and then the item is removed", () => {
			const { view } = runScenario(objectScenarios.root_Box_value_set_then_root_Box_removed);
			assert.equal(view.root, undefined);
		});

		it("reflects only the final value of a field of newly inserted root object when it is replaced", () => {
			const { view } = runScenario(objectScenarios.add_root_Box_then_replace_value);
			assert.equal(view.root?.value, "y❤️");
		});

		it("reflects only the final value of a nested field set multiple times", () => {
			const { view } = runScenario(objectScenarios.nested_Box_value_set_twice);
			assert.equal(view.root?.nested?.value, "y❤️");
		});

		it("reflects an undefined root when a nested field is set and then the root object is removed", () => {
			const { view } = runScenario(objectScenarios.nested_Box_value_set_then_root_Box_removed);
			assert.equal(view.root, undefined);
		});

		it("reflects an empty root object when a nested field is set and then the nested field is removed", () => {
			const { view } = runScenario(
				objectScenarios.nested_Box_value_set_then_nested_Box_removed,
			);
			assert.ok(view.root);
			assert.equal(view.root.nested, undefined);
			assert.equal(view.root.value, undefined);
		});

		it("reflects an empty root when a nested object with a value is added and then the root object is removed", () => {
			const { view } = runScenario(objectScenarios.nest_Box_with_value_then_root_Box_removed);
			assert.equal(view.root, undefined);
		});

		it("reflects only the final value of a field of a newly inserted nested object when nested field value is replaced", () => {
			const { view } = runScenario(objectScenarios.add_nested_Box_then_replace_value);
			assert.equal(view.root?.nested?.value, "y❤️");
		});

		it("reflects only the final value of a newly inserted nested object when nested object is replaced", () => {
			const { view } = runScenario(objectScenarios.add_nested_Box_then_replace_nested_Box);
			assert.equal(view.root?.nested?.value, "y❤️");
		});

		it("reflects only the final value of a newly inserted nested object whose value was set before it was replaced", () => {
			const { view } = runScenario(
				objectScenarios.add_nested_Box_set_value_then_replace_nested_Box,
			);
			assert.equal(view.root?.nested?.value, "y❤️");
		});

		it("reflects the surviving object when a newly inserted object's nested object is removed", () => {
			const { view } = runScenario(
				objectScenarios.add_Box_with_nested_Box_then_remove_nested_Box,
			);
			assert.equal(view.root?.value, "x❤️");
			assert.equal(view.root?.nested, undefined);
		});

		it("reflects an undefined root when nested tags are inserted and one moved, then the root is removed", () => {
			const { view } = runScenario(
				objectScenarios.nested_Box_tags_inserted_then_one_tag_moved_and_root_Box_removed,
			);
			assert.equal(view.root, undefined);
		});

		it("reflects an empty nested tags field when tags are inserted, rearranged, and then removed", () => {
			const { view } = runScenario(
				objectScenarios.nested_Box_tags_inserted_then_tags_rearranged_and_removed,
			);
			assert.ok(view.root?.nested);
			assert.equal(view.root.nested.tags, undefined);
			assert.equal(view.root.nested.value, "z❤️");
		});

		it("reflects an undefined root when a nested object with tags is added and then the root object is removed", () => {
			const { view } = runScenario(objectScenarios.nest_Box_with_tags_then_root_Box_removed);
			assert.equal(view.root, undefined);
		});

		it("reflects surviving tags of a newly inserted root object when tags are inserted, moved, and removed", () => {
			const { view } = runScenario(objectScenarios.add_root_Box_then_edit_tags);
			assert.deepEqual([...(view.root?.tags ?? [])], ["z❤️", "x❤️"]);
		});

		it("reflects surviving boxes of boxes inserted and one moved to sibling that is then removed", () => {
			const { view } = runScenario(
				parallelObjectScenarios.boxes_inserted_then_some_moved_to_sibling_Pallet_that_is_then_removed,
			);
			assert.deepEqual(
				view.root.map((pallet) => pallet.boxes.map((box) => box.value)),
				[["6❤️", "2🕰️"]],
			);
		});

		it("reflects surviving boxes of boxes inserted and one moved to sibling when the original parent is then removed", () => {
			const { view } = runScenario(
				parallelObjectScenarios.boxes_inserted_then_some_moved_to_sibling_Pallet_and_original_parent_Pallet_is_then_removed,
			);
			assert.deepEqual(
				view.root.map((pallet) => pallet.boxes.map((box) => box.value)),
				[["3🕰️", "1🕰️", "5❤️", "4🕰️"]],
			);
		});

		it("reflects surviving boxes of boxes inserted in a new pallet and one moved to sibling when the new pallet is then removed", () => {
			const { view } = runScenario(
				parallelObjectScenarios.boxes_inserted_in_new_Pallet_then_one_moved_to_sibling_Pallet_and_new_Pallet_is_then_removed,
			);
			assert.deepEqual(
				view.root.map((pallet) => pallet.boxes.map((box) => box.value)),
				[["1🕰️", "3❤️", "2🕰️"]],
			);
		});

		it("reflects the remaining box when a box is moved into a new pallet that is then removed", () => {
			const { view } = runScenario(
				parallelObjectScenarios.boxes_moved_into_new_Pallet_then_new_Pallet_is_then_removed,
			);
			assert.deepEqual(
				view.root.map((pallet) => pallet.boxes.map((box) => box.value)),
				[["2🕰️"]],
			);
		});

		it("reflects edits made before a schema change", () => {
			const { view } = runScenario(schemaUpgradeScenarios.edit_before_schema_change);
			assert.deepEqual([...view.root], ["B❤️"]);
		});

		it("reflects edits made after a schema change", () => {
			const { view } = runScenario(schemaUpgradeScenarios.edit_after_schema_change);
			assert.equal(view.root.length, 2);
			assert.equal(view.root[0], "A🕰️");
			const box = view.root[1];
			assert(box instanceof Box);
			assert.deepEqual({ ...box }, { value: "D❤️" });
		});
	});

	it("throws when edits are made before and after a schema change", () => {
		assert.throws(
			() =>
				// This transaction is expected to throw because edits are made
				// before and after a schema change, which is not allowed by
				// the current minimization implementation.
				runScenario(schemaUpgradeScenarios.edit_before_and_after_schema_change),
			/At most one edit group can be minimized, but 2 were found/,
		);
	});

	// post-processor infrastructure is agnostic to the transaction being async or sync, so this test is just for "good measure".
	it("preserves the observable result across an async transaction and new content appears in change", async () => {
		const { view, stringifiedChange } = await runScenarioAsync(arrayScenarios.A_replaced_by_B);
		assert.deepEqual([...view.root], ["B❤️"]);
		assert.match(stringifiedChange, someSurvivingMarkerRegex);
		assert.doesNotMatch(stringifiedChange, initialContentMarkerRegex);
	});

	function beautifyScenarioName(scenarioName: string): string {
		return scenarioName
			.replaceAll("_", " ") // Replace underscores with spaces
			.replaceAll(/([A-Z])(?=[A-Z])/g, "$1,"); // Insert comma between uppercase letters
	}

	function assertUnminimizedExpectations(
		expectations: BuildStatistics,
		view: Pick<SchematizingSimpleTreeView<ImplicitFieldSchema>, "checkout">,
		scenarioName: string,
	) {
		const change = getHeadChange(view);
		assert.deepEqual(
			countBuilds(change),
			expectations,
			`This is a testing failure - build counts for scenario ${scenarioName} did not match expectations.`,
		);
	}

	describe("produces a consistent view and the same observable result as not minimized", () => {
		for (const [scenarioName, scenario] of Object.entries(arrayScenarios)) {
			it(`for ${beautifyScenarioName(scenarioName)}`, () => {
				const { tree: unminimizedTree, view: unminimizedView } = runScenario(scenario, {
					doNotMinimize: true,
				});
				const { tree: minimizedTree } = runScenario(scenario, {
					validateConsistency: true,
				});
				assert.deepEqual(minimizedTree.exportVerbose(), unminimizedTree.exportVerbose());
				// Testing self-check: verify that the unminimized view has the expected build and destroy counts.
				assertUnminimizedExpectations(
					scenario.unminimizedBuildExpectations,
					unminimizedView,
					`arrayScenarios.${scenarioName}`,
				);
			});
		}
		for (const [scenarioName, scenario] of Object.entries(objectScenarios)) {
			it(`for ${beautifyScenarioName(scenarioName)}`, () => {
				const { tree: unminimizedTree, view: unminimizedView } = runScenario(scenario, {
					doNotMinimize: true,
				});
				const { tree: minimizedTree } = runScenario(scenario, {
					validateConsistency: true,
				});
				assert.deepEqual(minimizedTree.exportVerbose(), unminimizedTree.exportVerbose());
				// Testing self-check: verify that the unminimized view has the expected build and destroy counts.
				assertUnminimizedExpectations(
					scenario.unminimizedBuildExpectations,
					unminimizedView,
					`objectScenarios.${scenarioName}`,
				);
			});
		}
		for (const [scenarioName, scenario] of Object.entries(parallelObjectScenarios)) {
			it(`for ${beautifyScenarioName(scenarioName)}`, () => {
				const { tree: unminimizedTree, view: unminimizedView } = runScenario(scenario, {
					doNotMinimize: true,
				});
				const { tree: minimizedTree } = runScenario(scenario, {
					validateConsistency: true,
				});
				assert.deepEqual(minimizedTree.exportVerbose(), unminimizedTree.exportVerbose());
				// Testing self-check: verify that the unminimized view has the expected build and destroy counts.
				assertUnminimizedExpectations(
					scenario.unminimizedBuildExpectations,
					unminimizedView,
					`parallelObjectScenarios.${scenarioName}`,
				);
			});
		}
		for (const [scenarioName, scenario] of Object.entries(schemaUpgradeScenarios).filter(
			([name]) => name !== "edit_before_and_after_schema_change", // This scenario is expected to throw, so skip it for this test.
		)) {
			it(`for ${beautifyScenarioName(scenarioName)}`, () => {
				const { tree: unminimizedTree, view: unminimizedView } = runScenario(scenario, {
					doNotMinimize: true,
				});
				const { tree: minimizedTree } = runScenario(scenario, {
					validateConsistency: true,
				});
				assert.deepEqual(minimizedTree.exportVerbose(), unminimizedTree.exportVerbose());
				// Testing self-check: verify that the unminimized view has the expected build and destroy counts.
				assertUnminimizedExpectations(
					scenario.unminimizedBuildExpectations,
					unminimizedView,
					`schemaUpgradeScenarios.${scenarioName}`,
				);
			});
		}
	});

	/**
	 * Attempts to inject a hidden property using temporary schema change, then reverts to the original schema.
	 * @remarks
	 * Steps (root state shown after each):
	 *
	 * 0. initial                 -\> `[Box: { value: "A🕰️" }]`
	 * 1. upgrade schema          -\> `[Box: { value: "A🕰️" }]`
	 * 2. set Box secret to "B☠️" -\> `[Box: { value: "A🕰️", secret: "B☠️" }]`
	 * 3. downgrade schema        -\> stored: `[Box: { value: "A🕰️", secret: "B☠️" }]  visible: { value: "A🕰️" }`
	 *
	 * This invariant is independent of minimization, but is critical behavior for
	 * minimization criteria as minimize only operates on data edits.
	 */
	it("temporary schema change throws restoring schema", () => {
		let scenarioStuffHiddenSecretInBoxReachedSchemaRollback = false;

		assert.throws(() => {
			const { view } = runScenario({
				schema: BoxArray,
				initialContent: [new Box({ value: "A🕰️" })],
				apply: (_root, tree, view1) => {
					// Force dispose view to permit upgrade
					view1.dispose();

					// Update schema which now allows Boxes with secrets in root array.
					const view2 = tree.viewWith(new TreeViewConfiguration(SketchyBoxArraySchemaConfig));
					view2.upgradeSchema();

					view2.root[0].secret = "B☠️";
					view2.dispose();

					// Restore schema which does now allows Boxes with secrets in root array.
					const view3 = tree.viewWith(
						new TreeViewConfiguration({
							schema: BoxArray,
							enableSchemaValidation: true,
						}),
					);
					assert(view3 instanceof SchematizingSimpleTreeView);
					scenarioStuffHiddenSecretInBoxReachedSchemaRollback = true;
					view3.upgradeSchema();

					return view3;
				},
				expectSurvivingMarker: false,
			} as const satisfies BoxArrayScenario);
			assert.equal(
				// @ts-expect-error -- Property 'secret' does not exist on type 'Box'.
				view.root[0].secret,
				"B☠️",
			);
		}, /Existing stored schema cannot be upgraded/);

		assert(
			scenarioStuffHiddenSecretInBoxReachedSchemaRollback,
			"scenario did not reach schema rollback step",
		);
	});

	// These tests assert that the squashed change carries no extraneous information about nodes that are not
	// present in the final document. They are NOT EXPECTED TO PASS (though some may by accident) until the
	// minimization algorithm is implemented. (`minimize` is currently a no-op.)
	describe.skip("removes extraneous data from the squashed changes (expected to fail until minimize is implemented)", () => {
		it("drops the build and destroy for a create-then-remove", () => {
			const { view, stringifiedChange } = runScenario(arrayScenarios.A_added_then_removed);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The created node is not present in the final document, so its build should be removed.
			assert.deepEqual(countBuilds(change), { builds: 0, tops: 0 });
		});

		it("keeps only the persisted node's build when a transient node is also created", () => {
			const { view, stringifiedChange } = runScenario(arrayScenarios.A_kept_and_B_transient);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only "A❤️" survives the transaction, so exactly one build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("keeps only the final node's build when a node is replaced", () => {
			const { view, stringifiedChange } = runScenario(arrayScenarios.A_replaced_by_B);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only "B❤️" survives the transaction, so exactly one build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("keeps only the surviving node's build when inserted content is relocated then removed", () => {
			const { view, stringifiedChange } = runScenario(
				arrayScenarios.B_inserted_before_A_then_A_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only "B❤️" survives the transaction, so exactly one build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("keeps the surrounding builds when a node in the middle of an inserted run is removed", () => {
			const { view, stringifiedChange } = runScenario(
				arrayScenarios.ABC_inserted_then_B_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// "A❤️" and "C❤️" survive but "B☠️" is removed, so A-B-C build should be split, leaving two.
			assert.deepEqual(countBuilds(change), { builds: 2, tops: 2 });
		});

		it("drops the build for an inserted node that is moved then removed", () => {
			const { view, stringifiedChange } = runScenario(
				arrayScenarios.ABC_inserted_then_B_moved_then_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// "B☠️" is removed despite being moved, so A-B-C build should be split, leaving two.
			assert.deepEqual(countBuilds(change), { builds: 2, tops: 2 });
		});

		it("keeps only the trailing node's [modified] build when a moved node and its successor from leading node build are removed", () => {
			const { view, stringifiedChange } = runScenario(
				arrayScenarios.ABC_inserted_then_B_moved_then_B_and_A_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// "A☠️" and the moved "B☠️" are removed, so only "C❤️"'s build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("keeps only the leading node's build when a moved node and its insertion companion are removed", () => {
			const { view, stringifiedChange } = runScenario(
				arrayScenarios.ABC_inserted_then_B_moved_then_C_and_B_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The moved "B☠️" and "C☠️" are removed, so only "A❤️"'s build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("carries no build for a transient insert over pre-existing content", () => {
			const { view, stringifiedChange } = runScenario(
				arrayScenarios.preexisting_content_and_transient_insert,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Pre-existing nodes are not built by this transaction and "A☠️" is removed, so no builds should remain.
			assert.deepEqual(countBuilds(change), { builds: 0, tops: 0 });
		});

		it("keeps only the surviving inserted node's build over pre-existing content", () => {
			const { view, stringifiedChange } = runScenario(
				arrayScenarios.preexisting_content_and_surviving_insert,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only "B❤️" is created and survives ("A☠️" is removed; "X" pre-exists), so exactly one build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("keeps only the final value's build when a field is set multiple times", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.root_Box_value_set_twice,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only the final value "y❤️" survives the transaction, so exactly one build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("carries no build when root's value of a field is set and then the root is removed", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.root_Box_value_set_then_root_Box_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The created node is not present in the final document, so its build should be removed.
			assert.deepEqual(countBuilds(change), { builds: 0, tops: 0 });
		});

		it("keeps only the final value's builds when a field of newly inserted object is replaced", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.add_root_Box_then_replace_value,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only the final value "y❤️" survives the transaction, so one or two builds should remain.
			const { builds, tops } = countBuilds(change);
			assert(builds === 1 || builds === 2, `Expected 1 or 2 builds, but found ${builds}`);
			assert.equal(
				tops,
				builds,
				`Expected top-level nodes ${tops} to match the number of builds ${builds}`,
			);
		});

		it("keeps only the final value's build when a nested field is set multiple times", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.nested_Box_value_set_twice,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only the final value "y❤️" survives the transaction, so exactly one build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("carries no build when a nested field is set and then the root object is removed", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.nested_Box_value_set_then_root_Box_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// No created node is present in the final document, so no builds should remain.
			assert.deepEqual(countBuilds(change), { builds: 0, tops: 0 });
		});

		it("keeps one build when a nested field is set and then the nested object is removed", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.nested_Box_value_set_then_nested_Box_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The node with new content is not present in the final document, so no builds should remain.
			assert.deepEqual(countBuilds(change), { builds: 0, tops: 0 });
		});

		it("carries no build when a nested object with a value is added and then the root object is removed", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.nest_Box_with_value_then_root_Box_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// No created node is present in the final document, so no builds should remain.
			assert.deepEqual(countBuilds(change), { builds: 0, tops: 0 });
		});

		it("keeps only the final value's builds when a field of a newly inserted nested object is replaced", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.add_nested_Box_then_replace_value,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The new root, nested, and the final value "y❤️" survive the transaction, so one or two builds should remain.
			const { builds, tops } = countBuilds(change);
			assert(builds === 1 || builds === 2, `Expected 1 or 2 builds, but found ${builds}`);
			assert.equal(
				tops,
				builds,
				`Expected top-level nodes ${tops} to match the number of builds ${builds}`,
			);
		});

		it("keeps only the final value's builds when a newly inserted nested object is replaced", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.add_nested_Box_then_replace_nested_Box,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The new root and the final value "y❤️" box survive the transaction, so one or two builds should remain.
			const { builds, tops } = countBuilds(change);
			assert(builds === 1 || builds === 2, `Expected 1 or 2 builds, but found ${builds}`);
			assert.equal(
				tops,
				builds,
				`Expected top-level nodes ${tops} to match the number of builds ${builds}`,
			);
		});

		it("keeps only the final value's builds when a newly inserted nested object's value is set before the nested object is replaced", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.add_nested_Box_set_value_then_replace_nested_Box,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The new root and the final value "y❤️" box survive the transaction, so one or two builds should remain.
			const { builds, tops } = countBuilds(change);
			assert(builds === 1 || builds === 2, `Expected 1 or 2 builds, but found ${builds}`);
			assert.equal(
				tops,
				builds,
				`Expected top-level nodes ${tops} to match the number of builds ${builds}`,
			);
		});

		it("keeps only the surviving object's build when a newly inserted object's nested object is removed", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.add_Box_with_nested_Box_then_remove_nested_Box,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only the surviving root object "x❤️" (without the removed nested "y☠️") remains, so exactly one build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("carries no build when nested tags are inserted and one moved, then the root is removed", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.nested_Box_tags_inserted_then_one_tag_moved_and_root_Box_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The root is removed, so none of the inserted tags are present in the final document and no builds should remain.
			assert.deepEqual(countBuilds(change), { builds: 0, tops: 0 });
		});

		it("carries no build when nested tags are inserted, rearranged, and then removed", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.nested_Box_tags_inserted_then_tags_rearranged_and_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// All inserted tags are removed, so only the nested value is present in the final document and only that build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("carries no build when a nested object with tags is added and then the root object is removed", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.nest_Box_with_tags_then_root_Box_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// No created node is present in the final document, so no builds should remain.
			assert.deepEqual(countBuilds(change), { builds: 0, tops: 0 });
		});

		it("keeps the surviving tags' builds when tags are inserted, moved, and removed under a newly inserted object", () => {
			const { view, stringifiedChange } = runScenario(
				objectScenarios.add_root_Box_then_edit_tags,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Both the inserted root Box (originally carrying "x☠️") and the separately inserted "y❤️" survive
			// in the final document, so both builds should remain.
			assert.deepEqual(countBuilds(change), { builds: 2, tops: 2 });
		});

		it("keeps the surviving box's build when boxes are inserted and one moved to sibling that is then removed", () => {
			const { view, stringifiedChange } = runScenario(
				parallelObjectScenarios.boxes_inserted_then_some_moved_to_sibling_Pallet_that_is_then_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The surviving "6❤️" was inserted into pallet0. Transient "5☠️" was moved into pallet1 before
			// pallet1 was removed. So only the surviving "6❤️" build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("keeps the surviving box's build when boxes are inserted and one moved to sibling when the original parent is then removed", () => {
			const { view, stringifiedChange } = runScenario(
				parallelObjectScenarios.boxes_inserted_then_some_moved_to_sibling_Pallet_and_original_parent_Pallet_is_then_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The surviving "5❤️" was moved into pallet1 before its original parent pallet0 (carrying transient
			// "6☠️") was removed, so only the surviving "5❤️" build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("keeps the surviving box's build when boxes are inserted in a new pallet and one moved to sibling when the new pallet is then removed", () => {
			const { view, stringifiedChange } = runScenario(
				parallelObjectScenarios.boxes_inserted_in_new_Pallet_then_one_moved_to_sibling_Pallet_and_new_Pallet_is_then_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The surviving "3❤️" was moved into pallet0 before the newly inserted pallet1 (carrying transient
			// "4☠️") was removed, so only the surviving build for "3❤️" should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("carries no build when a box is moved into a new pallet that is then removed", () => {
			const { view, stringifiedChange } = runScenario(
				parallelObjectScenarios.boxes_moved_into_new_Pallet_then_new_Pallet_is_then_removed,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The new pallet1 (carrying transient "3☠️") and the pre-existing "1🕰️" moved into it are both
			// removed, so no created node survives in the final document and no builds should remain.
			assert.deepEqual(countBuilds(change), { builds: 0, tops: 0 });
		});

		it("keeps only edits' surviving builds made before a schema change", () => {
			const { view, stringifiedChange } = runScenario(
				schemaUpgradeScenarios.edit_before_schema_change,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only the final value "B❤️" survives the transaction, so exactly one build should remain.
			assert.deepEqual(countBuilds(change), { builds: 1, tops: 1 });
		});

		it("keeps only edits' surviving builds made after a schema change", () => {
			const { view, stringifiedChange } = runScenario(
				schemaUpgradeScenarios.edit_after_schema_change,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only the final Box value "D❤️" survives the transaction but the
			// Box insert was separate action, so two builds should remain
			// with the first one having been altered.
			assert.deepEqual(countBuilds(change), { builds: 2, tops: 2 });
		});
	});
});
