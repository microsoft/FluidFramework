/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import type { ImplicitFieldSchema } from "@fluidframework/tree";
import type { JsonCompatibleReadOnly } from "@fluidframework/tree/alpha";
import {
	FluidClientVersion,
	createIndependentTreeAlpha,
	minimize,
} from "@fluidframework/tree/alpha";

import { SchematizingSimpleTreeView, SharedTreeChange } from "../../shared-tree/index.js";
import { createSnapshotCompressor } from "../utils.js";
import type { JsonString } from "@fluidframework/core-interfaces/internal";
import { JsonStringify } from "@fluidframework/core-interfaces/internal";

/**
 * Reads the change associated with the head commit on the main branch.
 * @remarks This is the squashed change produced by the most recently committed transaction.
 */
function getHeadChange<TSchema extends ImplicitFieldSchema>(
	view: SchematizingSimpleTreeView<TSchema>,
): SharedTreeChange {
	return view.checkout.mainBranch.getHead().change;
}

/**
 * Counts the total number of detached-node `builds` carried by the data changes within a {@link SharedTreeChange}.
 * @remarks A `build` is retained for every node created during the transaction. After minimization, a `build` should
 * only remain for nodes that are still present in the document once the transaction is squashed.
 */
function countBuilds(change: SharedTreeChange): number {
	let total = 0;
	for (const inner of change.changes) {
		if (inner.type === "data") {
			total += inner.innerChange.builds?.size ?? 0;
		}
	}
	return total;
}

/**
 * Counts the total number of detached-node `destroys` carried by the data changes within a {@link SharedTreeChange}.
 */
function countDestroys(change: SharedTreeChange): number {
	let total = 0;
	for (const inner of change.changes) {
		if (inner.type === "data") {
			total += inner.innerChange.destroys?.size ?? 0;
		}
	}
	return total;
}

const sf = new SchemaFactory("transaction-minimize");
const StringArray = sf.array("StringArray", sf.string);
const StringArraySchemaConfig = { schema: StringArray, enableSchemaValidation: true } as const;
type StringArrayView = SchematizingSimpleTreeView<typeof StringArraySchemaConfig.schema>;

class Box extends sf.object("Box", {
	label: sf.optional(sf.string),
	value: sf.optional(sf.string),
}) {}
const BoxArray = sf.array("BoxArray", Box);
const BoxArraySchemaConfig = { schema: BoxArray, enableSchemaValidation: true } as const;
type BoxArrayView = SchematizingSimpleTreeView<typeof BoxArraySchemaConfig.schema>;

const StringOrBoxArraySchemaConfig = {
	schema: [sf.array(sf.string), sf.array([sf.string, Box])],
	enableSchemaValidation: true,
} as const;

const sf2 = new SchemaFactory("transaction-minimize");
class UpgradedBox extends sf2.object("Box", {
	label: sf2.string,
	value: sf2.optional(sf2.string),
}) {}
const UpgradedBoxArraySchemaConfig = {
	schema: sf2.array(UpgradedBox),
	enableSchemaValidation: true,
} as const;

/** Transaction parameters that request {@link minimize | minimization} of the resulting change. */
const minimizeParams = { postProcessor: minimize } as const;

/**
 * The subset of a tree view a {@link TransactionScenario} depends on: the strongly-typed root node it edits and
 * the `initialize` signature from which the required initial content type is derived.
 * @remarks Used as the generic constraint instead of {@link SchematizingSimpleTreeView} directly because that type
 * is invariant in its schema, so a concretely-typed view does not satisfy a `SchematizingSimpleTreeView<ImplicitFieldSchema>` constraint.
 */
interface ScenarioTargetView {
	readonly root: unknown;
	initialize(content: never): void;
}

type Tree = ReturnType<typeof createIndependentTreeAlpha>;

/**
 * A transaction scenario: the content a view is initialized with, plus the sequence of edits to apply to the
 * strongly-typed root node within a single minimized transaction.
 * @typeParam TView - The view type the scenario runs against. Both the initial content and the root node the edits
 * are applied to are derived from this type.
 */
interface TransactionScenario<TView extends ScenarioTargetView> {
	/** The content the view is initialized with before the transaction runs. */
	readonly initialContent: Parameters<TView["initialize"]>[0];
	/** Applies the scenario's edits to the strongly-typed root node inside the transaction. */
	readonly apply: (root: TView["root"], tree: Tree, view?: TView) => void;
}

type StringArrayScenario = TransactionScenario<StringArrayView>;
type BoxArrayScenario = TransactionScenario<BoxArrayView>;

/**
 * Given the TreeViewConfiguration, returns a tree and an uninitialized view.
 *
 * @see {@link ../utils.ts#getView} that is basis for this helper.
 */
function getTreeAndView<const TSchema extends ImplicitFieldSchema>(
	config: TreeViewConfiguration<TSchema>,
): { tree: Tree; view: SchematizingSimpleTreeView<TSchema> } {
	const tree = createIndependentTreeAlpha({
		idCompressor: createSnapshotCompressor(),
		minVersionForCollab: FluidClientVersion.v2_80,
	});
	const view = tree.viewWith(config);
	assert(view instanceof SchematizingSimpleTreeView);
	return { tree, view };
}

/** Creates a {@link StringArray} view initialized with the given content. */
function createStringArrayView(initialContent: StringArrayScenario["initialContent"]): {
	tree: Tree;
	view: StringArrayView;
} {
	const treeAndView = getTreeAndView(new TreeViewConfiguration(StringArraySchemaConfig));
	treeAndView.view.initialize(initialContent);
	return treeAndView;
}

/** Creates a {@link BoxArray} view initialized with the given content. */
function createBoxArrayView(initialContent: BoxArrayScenario["initialContent"]): {
	tree: Tree;
	view: BoxArrayView;
} {
	const treeAndView = getTreeAndView(new TreeViewConfiguration(BoxArraySchemaConfig));
	treeAndView.view.initialize(initialContent);
	return treeAndView;
}

/**
 * Runs a scenario in a single minimized transaction and returns the persisted (serialized) change as a JSON string.
 * @remarks
 * The persisted change is the operation SharedTree writes for document storage. It is obtained via the alpha
 * `getChange` API surfaced on the local {@link https://fluidframework.com | "changed"} event. Unlike the in-memory
 * {@link SharedTreeChange} (whose inserted node contents live in tree chunks that a naive `JSON.stringify` does not
 * traverse), the serialized change fully encodes inserted node values, so tests can assert that transient content
 * (tagged with ☠️) was stripped by inspecting the JSON text.
 */
function serializeScenarioChange<TSchema extends ImplicitFieldSchema>(
	view: SchematizingSimpleTreeView<TSchema>,
	tree: Tree,
	scenario: TransactionScenario<SchematizingSimpleTreeView<TSchema>>,
): JsonString<unknown> {
	let changeJson: JsonCompatibleReadOnly | undefined;
	const unsubscribe = view.events.on("changed", (metadata) => {
		assert(metadata.isLocal, "expected a local change to be produced by the transaction");
		changeJson = metadata.getChange();
	});
	view.runTransaction(() => scenario.apply(view.root, tree), minimizeParams);
	unsubscribe();
	assert(
		changeJson !== undefined,
		"expected a local change to be produced by the transaction",
	);
	return JsonStringify<Readonly<unknown> | null>(changeJson);
}

/**
 * Runs a string-array {@link TransactionScenario} within a single minimized transaction.
 * @returns The resulting view and the persisted (serialized) change as a JSON string.
 * @remarks This is the shared setup + act used by each string-array test case.
 */
function runStringArrayScenario(scenario: StringArrayScenario): {
	view: StringArrayView;
	stringifiedChange: JsonString<unknown>;
} {
	const { tree, view } = createStringArrayView(scenario.initialContent);
	const stringifiedChange = serializeScenarioChange(view, tree, scenario);
	return { view, stringifiedChange };
}

/**
 * Like {@link runStringArrayScenario}, but runs the scenario's edits within an async transaction.
 * @remarks The post-processor infrastructure is agnostic to whether the transaction is sync or async, so this
 * exists to exercise that path "for good measure".
 */
async function runStringArrayScenarioAsync(
	scenario: StringArrayScenario,
): Promise<{ view: StringArrayView; stringifiedChange: JsonString<unknown> }> {
	const { tree, view } = createStringArrayView(scenario.initialContent);
	let changeJson: JsonCompatibleReadOnly | undefined;
	const unsubscribe = view.events.on("changed", (metadata) => {
		assert(metadata.isLocal, "expected a local change to be produced by the transaction");
		changeJson = metadata.getChange();
	});
	await view.runTransactionAsync(async () => scenario.apply(view.root, tree), minimizeParams);
	unsubscribe();
	assert(
		changeJson !== undefined,
		"expected a local change to be produced by the transaction",
	);
	return { view, stringifiedChange: JsonStringify<Readonly<unknown> | null>(changeJson) };
}

/**
 * Runs a box-array {@link TransactionScenario} within a single minimized transaction.
 * @returns The resulting view and the persisted (serialized) change as a JSON string.
 * @remarks This is the shared setup + act used by each box-array test case.
 */
function runBoxArrayScenario(scenario: BoxArrayScenario): {
	view: BoxArrayView;
	stringifiedChange: JsonString<unknown>;
} {
	const { tree, view } = createBoxArrayView(scenario.initialContent);
	const stringifiedChange = serializeScenarioChange(view, tree, scenario);
	return { view, stringifiedChange };
}

// #region Scenario definitions
// Each scenario declares the initial document content and the edits applied to the strongly-typed root node
// within a single minimized transaction. The TSDoc shows the document state (the contents of the root array)
// after each edit step. Nodes tagged with "☠️" are transient: they are created and then removed within the same
// transaction, so their data is extraneous and should be dropped by minimization. Nodes tagged with "❤️" are
// created within the transaction and survive to the end, so their data must be retained.

// #region String Array scenarios
/**
 * Inserts "A❤️" at the end of the root.
 * @remarks
 * Steps (root state shown after each):
 * 1. insert "A❤️" -\> `["A❤️"]`
 */
const scenarioAInserted = {
	initialContent: [],
	apply: (root) => {
		root.insertAtEnd("A❤️");
	},
} as const satisfies StringArrayScenario;

/**
 * Inserts "A❤️" then "B❤️" at the end of the root.
 * @remarks
 * Steps (root state shown after each):
 * 1. insert "A❤️" -\> `["A❤️"]`
 * 2. insert "B❤️" -\> `["A❤️", "B❤️"]`
 */
const scenarioAThenBInserted = {
	initialContent: [],
	apply: (root) => {
		root.insertAtEnd("A❤️");
		root.insertAtEnd("B❤️");
	},
} as const satisfies StringArrayScenario;

/**
 * Inserts "A☠️" and then removes it, leaving the root empty.
 * @remarks
 * Steps (root state shown after each):
 * 1. insert "A☠️" -\> `["A☠️"]`
 * 2. remove at 0  -\> `[]`
 */
const scenarioAAddedThenRemoved = {
	initialContent: [],
	apply: (root) => {
		root.insertAtEnd("A☠️");
		root.removeAt(0);
	},
} as const satisfies StringArrayScenario;

/**
 * Inserts "A❤️" (which persists) and a transient "B☠️" that is removed within the same transaction.
 * @remarks
 * Steps (root state shown after each):
 * 1. insert "A❤️"  -\> `["A❤️"]`
 * 2. insert "B☠️"  -\> `["A❤️", "B☠️"]`
 * 3. remove at 1   -\> `["A❤️"]`
 */
const scenarioAKeptAndBTransient = {
	initialContent: [],
	apply: (root) => {
		root.insertAtEnd("A❤️");
		root.insertAtEnd("B☠️");
		root.removeAt(1);
	},
} as const satisfies StringArrayScenario;

/**
 * Inserts "A☠️", then inserts "B❤️" at the end, then removes "A☠️", so only "B❤️" remains.
 * @remarks
 * Steps (root state shown after each):
 * 1. insert "A☠️"  -\> `["A☠️"]`
 * 2. insert "B❤️"  -\> `["A☠️", "B❤️"]`
 * 3. remove at 0   -\> `["B❤️"]`
 */
const scenarioAReplacedByB = {
	initialContent: [],
	apply: (root) => {
		root.insertAtEnd("A☠️");
		root.insertAtEnd("B❤️");
		root.removeAt(0);
	},
} as const satisfies StringArrayScenario;

/**
 * Inserts "A☠️", inserts "B❤️" in front of "A☠️", then removes "A☠️", so only "B❤️" remains.
 * @remarks
 * Unlike {@link scenarioAReplacedByB}, "B❤️" is inserted ahead of "A☠️" rather than after it. This relocates "A☠️"
 * (it shifts from index 0 to index 1) before it is removed, exercising minimization's tracking of content that is
 * inserted and then removed after being moved within the same transaction.
 *
 * Steps (root state shown after each):
 * 1. insert "A☠️"          -\> `["A☠️"]`
 * 2. insert "B❤️" at start -\> `["B❤️", "A☠️"]`
 * 3. remove at 1           -\> `["B❤️"]`
 */
const scenarioBInsertedBeforeAThenARemoved = {
	initialContent: [],
	apply: (root) => {
		root.insertAtEnd("A☠️");
		root.insertAtStart("B❤️");
		root.removeAt(1);
	},
} as const satisfies StringArrayScenario;

/**
 * Inserts "A❤️", "B☠️", "C❤️" and then removes the middle node "B☠️", splitting the inserted run so "A❤️" and "C❤️" remain.
 * @remarks
 * "B☠️" is built and then removed in the same transaction, so its build is extraneous; only "A❤️" and "C❤️" survive.
 *
 * Steps (root state shown after each):
 * 1. insert "A❤️", "B☠️", "C❤️" -\> `["A❤️", "B☠️", "C❤️"]`
 * 2. remove at 1                 -\> `["A❤️", "C❤️"]`
 */
const scenarioAbcInsertedThenBRemoved = {
	initialContent: [],
	apply: (root) => {
		root.insertAtEnd("A❤️", "B☠️", "C❤️");
		root.removeAt(1);
	},
} as const satisfies StringArrayScenario;

/**
 * Inserts "A❤️", then "B❤️", "C❤️", and then rearranges them by moving "C❤️" to the start.
 * @remarks
 * All three nodes survive the transaction (only their order changes), so both builds are expected to remain.
 *
 * Steps (root state shown after each):
 * 1. insert "A❤️"         -\> `["A❤️"]`
 * 2. insert "B❤️", "C❤️"  -\> `["A❤️", "B❤️", "C❤️"]`
 * 3. move "C❤️" to start  -\> `["C❤️", "A❤️", "B❤️"]`
 */
const scenarioAThenBCInsertedThenRearranged = {
	initialContent: [],
	apply: (root) => {
		root.insertAtEnd("A❤️");
		root.insertAtEnd("B❤️", "C❤️");
		root.moveToStart(2);
	},
} as const satisfies StringArrayScenario;

/**
 * Inserts "A❤️", "B☠️", "C❤️", moves "B☠️" to the start, and then removes it.
 * @remarks
 * "B☠️" is built, relocated, and then removed all within the same transaction, so both its build and its move are
 * extraneous; only "A❤️" and "C❤️" survive.
 *
 * Steps (root state shown after each):
 * 1. insert "A❤️", "B☠️", "C❤️" -\> `["A❤️", "B☠️", "C❤️"]`
 * 2. move "B☠️" to start        -\> `["B☠️", "A❤️", "C❤️"]`
 * 3. remove at 0                -\> `["A❤️", "C❤️"]`
 */
const scenarioABCInsertedThenBMovedThenRemoved = {
	initialContent: [],
	apply: (root) => {
		root.insertAtEnd("A❤️", "B☠️", "C❤️");
		root.moveToStart(1);
		root.removeAt(0);
	},
} as const satisfies StringArrayScenario;

/**
 * Inserts "A☠️", "B☠️", "C❤️", moves "B☠️" to the start, and then removes both "B☠️" and "A☠️".
 * @remarks
 * "A☠️" and "B☠️" are built, "B☠️" is relocated, and then both are removed all within the same transaction, so both
 * their builds and moves are extraneous; only "C❤️" survives.
 *
 * Steps (root state shown after each):
 * 1. insert "A☠️", "B☠️", "C❤️" -\> `["A☠️", "B☠️", "C❤️"]`
 * 2. move "B☠️" to start        -\> `["B☠️", "A☠️", "C❤️"]`
 * 3. remove range [0, 2)        -\> `["C❤️"]`
 */
const scenarioABCInsertedThenBMovedThenBAndARemoved = {
	initialContent: [],
	apply: (root) => {
		root.insertAtEnd("A☠️", "B☠️", "C❤️");
		root.moveToStart(1);
		root.removeRange(0, 2);
	},
} as const satisfies StringArrayScenario;

/**
 * Inserts "A❤️", "B☠️", "C☠️", moves "B☠️" to the start, and then removes both "C☠️" and "B☠️".
 * @remarks
 * "B☠️" and "C☠️" are built, "B☠️" is relocated, and then both are removed all within the same transaction, so both
 * their builds and moves are extraneous; only "A❤️" survives.
 *
 * Steps (root state shown after each):
 * 1. insert "A❤️", "B☠️", "C☠️" -\> `["A❤️", "B☠️", "C☠️"]`
 * 2. move "B☠️" to start         -\> `["B☠️", "A❤️", "C☠️"]`
 * 3. remove at 2                 -\> `["B☠️", "A❤️"]`
 * 4. remove at 0                 -\> `["A❤️"]`
 */
const scenarioABCInsertedThenBMovedThenCAndBRemoved = {
	initialContent: [],
	apply: (root) => {
		root.insertAtEnd("A❤️", "B☠️", "C☠️");
		root.moveToStart(1);
		root.removeAt(2);
		root.removeAt(0);
	},
} as const satisfies StringArrayScenario;

/**
 * Starts from pre-existing content `["X", "Y"]` and inserts a transient "A☠️" that is removed before the
 * transaction closes, leaving the document unchanged.
 * @remarks
 * The pre-existing nodes "X" and "Y" are not created by this transaction, so they contribute no builds to its
 * change. "A☠️" is built and removed within the transaction, so its build is extraneous and should be dropped,
 * leaving zero builds.
 *
 * Steps (root state shown after each):
 * 0. initial      -\> `["X", "Y"]`
 * 1. insert "A☠️" -\> `["X", "A☠️", "Y"]`
 * 2. remove at 1  -\> `["X", "Y"]`
 */
const scenarioPreExistingContentAndTransientInsert = {
	initialContent: ["X", "Y"],
	apply: (root) => {
		root.insertAt(1, "A☠️");
		root.removeAt(1);
	},
} as const satisfies StringArrayScenario;

/**
 * Starts from pre-existing content `["X"]` and inserts a transient "A☠️" and a surviving "B❤️", removing "A☠️"
 * before the transaction closes.
 * @remarks
 * "X" is not created by this transaction. "A☠️" is built and removed within the transaction (extraneous), while
 * "B❤️" survives, so exactly one build should remain.
 *
 * Steps (root state shown after each):
 * 0. initial              -\> `["X"]`
 * 1. insert "A☠️", "B❤️" -\> `["X", "A☠️", "B❤️"]`
 * 2. remove at 1          -\> `["X", "B❤️"]`
 */
const scenarioPreExistingContentAndSurvivingInsert = {
	initialContent: ["X"],
	apply: (root) => {
		root.insertAtEnd("A☠️", "B❤️");
		root.removeAt(1);
	},
} as const satisfies StringArrayScenario;

/**
 * Starts from pre-existing content `["X", "Y", "Z"]` and rearranges it by moving "Z" to the start, without
 * creating or removing any nodes.
 * @remarks
 * No nodes are created by this transaction (only existing nodes are moved), so the change should carry no builds.
 *
 * Steps (root state shown after each):
 * 0. initial           -\> `["X", "Y", "Z"]`
 * 1. move "Z" to start -\> `["Z", "X", "Y"]`
 */
const scenarioPreExistingContentRearranged = {
	initialContent: ["X", "Y", "Z"],
	apply: (root) => {
		root.moveToStart(2);
	},
} as const satisfies StringArrayScenario;

/**
 * Starts from pre-existing content `["X", "Y", "Z"]` and removes "Y".
 * @remarks
 * No nodes are created by this transaction (only an existing node is removed), so the change should carry no builds.
 *
 * Steps (root state shown after each):
 * 0. initial    -\> `["X", "Y", "Z"]`
 * 1. remove "Y" -\> `["X", "Z"]`
 */
const scenarioPreExistingContentRemoved = {
	initialContent: ["X", "Y", "Z"],
	apply: (root) => {
		root.removeAt(1);
	},
} as const satisfies StringArrayScenario;

// #endregion

// #region Box Array scenarios

/**
 * Starts from a single {@link Box} with no value, then sets its `value` field twice.
 * @remarks
 * Steps:
 * 0. initial      -\> `[Box: undefined]`
 * 1. set to "x☠️" -\> `[Box: "x☠️"]`
 * 2. set to "y❤️" -\> `[Box: "y❤️"]`
 */
const scenarioBoxValueSetTwice = {
	initialContent: [{ value: undefined }],
	apply: (root) => {
		root[0].value = "x☠️";
		root[0].value = "y❤️";
	},
} as const satisfies BoxArrayScenario;

/**
 * Starts from a single {@link Box} with no value, sets its `value` field, then removes the box.
 * @remarks
 * Steps:
 * 0. initial      -\> `[Box: undefined]`
 * 1. set to "x☠️" -\> `[Box: "x☠️"]`
 * 2. remove box   -\> `[]`
 */
const scenarioBoxValueSetThenBoxRemoved = {
	initialContent: [{ value: undefined }],
	apply: (root) => {
		root[0].value = "x☠️";
		root.removeAt(0);
	},
} as const satisfies BoxArrayScenario;

// #region Schema upgrade scenarios

const scenarioEditBeforeSchemaChange = {
	initialContent: [],
	apply: (root, tree, view) => {
		root[0].value = "x☠️";
		view?.dispose();

		// Update schema which now allows Boxes in root array.
		const view2 = tree.viewWith(new TreeViewConfiguration(UpgradedBoxArraySchemaConfig));
		view2.upgradeSchema();
		return view2;
	},
} as const satisfies BoxArrayScenario;

const scenarioEditBeforeSchemaChange = {
	initialContent: [],
	apply: (root, tree) => {
		root.insertAtEnd("A☠️");
		root.insertAtEnd("B❤️");
		root.removeAt(0);

		// Update schema which now allows Boxes in root array.
		const view2 = tree.viewWith(new TreeViewConfiguration(StringOrBoxArraySchemaConfig));
		view2.upgradeSchema();
	},
} as const satisfies StringArrayScenario;

const scenarioEditAfterSchemaChange = {
	initialContent: ["A❤️"],
	apply: (_root, tree) => {
		// Update schema which now allows Boxes in root array.
		const view2 = tree.viewWith(new TreeViewConfiguration(StringOrBoxArraySchemaConfig));
		view2.upgradeSchema();
		// const box = new Box({ value: "C☠️" });
		// view2.root.insertAtEnd(box);
		// box.value = "D❤️";
	},
} as const satisfies StringArrayScenario;

const scenarioEditBeforeAndAfterSchemaChange = {
	initialContent: [],
	apply: (root, tree, view) => {
		root.insertAtEnd("A☠️");
		root.insertAtEnd("B❤️");
		root.removeAt(0);

		view?.dispose();

		// Update schema which now allows Boxes in root array.
		const view2 = tree.viewWith(new TreeViewConfiguration(StringOrBoxArraySchemaConfig));
		view2.upgradeSchema();

		// const box = new Box({ value: "C☠️" });
		// view2.root.insertAtEnd(box);
		// box.value = "D❤️";
	},
} as const satisfies StringArrayScenario;

// #endregion

// #endregion

// #endregion

const someSurvivingMarkerRegex = /❤️/;
const transientMarkerRegex = /☠️/;

describe.only("transaction minimize post-processor", () => {
	it("can be supplied as a transaction post-processor without error", () => {
		const { view } = runStringArrayScenario(scenarioAInserted);
		assert.deepEqual([...view.root], ["A❤️"]);
	});

	describe("self-tests - no minimization applicable", () => {
		it("embeds surviving markers but not transient marker for a purely additive scenario", () => {
			const { stringifiedChange } = runStringArrayScenario(scenarioAThenBInserted);
			// Sanity check for the serialization mechanism: content that survives the
			// transaction is present in the persisted change, so tests can meaningfully
			// assert on its absence for transient content.

			// Custom assertion for this self-test
			assert.match(stringifiedChange, /[AB]❤️.*[AB]❤️/);

			// Common assertions
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
		});

		it("result carries no build when pre-existing content is only rearranged", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioPreExistingContentRearranged,
			);
			assert.deepEqual([...view.root], ["Z", "X", "Y"]);
			// Nothing inserted; should always pass.
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			assert.doesNotMatch(stringifiedChange, someSurvivingMarkerRegex);
			const change = getHeadChange(view);
			// No nodes are created by the transaction (only moved), so the change should carry no builds.
			assert.equal(countBuilds(change), 0);
		});

		it("result carries no build when pre-existing content is only removed", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioPreExistingContentRemoved,
			);
			assert.deepEqual([...view.root], ["X", "Z"]);
			// Nothing inserted; should always pass.
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			assert.doesNotMatch(stringifiedChange, someSurvivingMarkerRegex);
			const change = getHeadChange(view);
			// No nodes are created by the transaction (only removed), so the change should carry no builds.
			assert.equal(countBuilds(change), 0);
		});

		it("reflects the order of only-rearranged inserted nodes and keeps every build", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioAThenBCInsertedThenRearranged,
			);
			assert.deepEqual([...view.root], ["C❤️", "A❤️", "B❤️"]);
			// None were inserted; should always pass.
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
			const change = getHeadChange(view);
			// "A❤️", "B❤️", and "C❤️" all survive (only reordered), so both builds (A and B-C) should remain.
			assert.equal(countBuilds(change), 2);
		});
	});

	// These tests only assert the observable end state of the document. Minimization must never change the
	// observable result of a transaction, so these are expected to PASS regardless of whether minimization is
	// actually implemented.
	describe("preserves the observable result", () => {
		it("keeps inserted nodes", () => {
			const { view, stringifiedChange } = runStringArrayScenario(scenarioAThenBInserted);
			assert.deepEqual([...view.root], ["A❤️", "B❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("nets a create-then-remove to no change", () => {
			const { view, stringifiedChange } = runStringArrayScenario(scenarioAAddedThenRemoved);
			assert.deepEqual([...view.root], []);
			assert.doesNotMatch(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("keeps only the persisted node when a transient node is also created", () => {
			const { view, stringifiedChange } = runStringArrayScenario(scenarioAKeptAndBTransient);
			assert.deepEqual([...view.root], ["A❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("reflects only the final value of a node replaced within the transaction", () => {
			const { view, stringifiedChange } = runStringArrayScenario(scenarioAReplacedByB);
			assert.deepEqual([...view.root], ["B❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("reflects only the surviving node when inserted content is relocated then removed", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioBInsertedBeforeAThenARemoved,
			);
			assert.deepEqual([...view.root], ["B❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("keeps the surrounding nodes when a node in the middle of an inserted run is removed", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioAbcInsertedThenBRemoved,
			);
			assert.deepEqual([...view.root], ["A❤️", "C❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("keeps the surrounding nodes when an inserted node is moved then removed", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioABCInsertedThenBMovedThenRemoved,
			);
			assert.deepEqual([...view.root], ["A❤️", "C❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("keeps only the trailing node when a moved node and its successor from leading node are removed", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioABCInsertedThenBMovedThenBAndARemoved,
			);
			assert.deepEqual([...view.root], ["C❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("keeps only the leading node when a moved node and its insertion companion are removed", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioABCInsertedThenBMovedThenCAndBRemoved,
			);
			assert.deepEqual([...view.root], ["A❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("leaves pre-existing content unchanged when a transient node is inserted then removed", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioPreExistingContentAndTransientInsert,
			);
			assert.deepEqual([...view.root], ["X", "Y"]);
			assert.doesNotMatch(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("keeps pre-existing content and the surviving inserted node", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioPreExistingContentAndSurvivingInsert,
			);
			assert.deepEqual([...view.root], ["X", "B❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("reflects only the final value of a field set multiple times", () => {
			const { view, stringifiedChange } = runBoxArrayScenario(scenarioBoxValueSetTwice);
			assert.equal(view.root[0].value, "y❤️");
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("reflects only the final empty array when only item's value of a field is set and then the item is removed", () => {
			const { view, stringifiedChange } = runBoxArrayScenario(
				scenarioBoxValueSetThenBoxRemoved,
			);
			assert.deepEqual(view.root, []);
			assert.doesNotMatch(stringifiedChange, someSurvivingMarkerRegex);
		});

		it.only("BOX - reflects edits made before a schema change", () => {
			// const { view, stringifiedChange } = runStringArrayScenario(
			// 	scenarioEditBeforeSchemaChange,
			// );
			const { tree, view } = getTreeAndView(new TreeViewConfiguration(BoxArraySchemaConfig));
			let changeJson: JsonCompatibleReadOnly | undefined;
			const unsubscribe = view.events.on("changed", (metadata) => {
				assert(metadata.isLocal, "expected a local change to be produced by the transaction");
				changeJson = metadata.getChange();
			});
			view.initialize(scenarioBoxEditBeforeSchemaChange.initialContent);
			const result = view.runTransaction(() => {
				return { value: scenarioBoxEditBeforeSchemaChange.apply(view.root, tree, view) };
			}, minimizeParams);
			unsubscribe();
			assert(
				changeJson !== undefined,
				"expected a local change to be produced by the transaction",
			);
			const stringifiedChange = JsonStringify<Readonly<unknown> | null>(changeJson);

			assert.deepEqual([...result.value.root], ["B❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("reflects edits made before a schema change", () => {
			// const { view, stringifiedChange } = runStringArrayScenario(
			// 	scenarioEditBeforeSchemaChange,
			// );
			const { tree, view } = getTreeAndView(
				new TreeViewConfiguration(StringArraySchemaConfig),
			);
			let changeJson: JsonCompatibleReadOnly | undefined;
			const unsubscribe = view.events.on("changed", (metadata) => {
				assert(metadata.isLocal, "expected a local change to be produced by the transaction");
				changeJson = metadata.getChange();
			});
			view.runTransaction(() => {
				view.initialize(scenarioEditBeforeSchemaChange.initialContent);
				scenarioEditBeforeAndAfterSchemaChange.apply(view.root, tree, view);
			}, minimizeParams);
			unsubscribe();
			assert(
				changeJson !== undefined,
				"expected a local change to be produced by the transaction",
			);
			const stringifiedChange = JsonStringify<Readonly<unknown> | null>(changeJson);

			assert.deepEqual([...view.root], ["B❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("reflects edits made after a schema change", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioEditAfterSchemaChange,
			);
			assert.deepEqual([...view.root], ["A❤️", "D❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});

		it("reflects edits made before and after a schema change", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioEditBeforeAndAfterSchemaChange,
			);
			assert.deepEqual([...view.root], ["B❤️", "D❤️"]);
			assert.match(stringifiedChange, someSurvivingMarkerRegex);
		});
	});

	// post-processor infrastructure is agnostic to the transation being async or sync, so this test is just for "good measure".
	it("preserves the observable result across an async transaction", async () => {
		const { view, stringifiedChange } =
			await runStringArrayScenarioAsync(scenarioAReplacedByB);
		assert.deepEqual([...view.root], ["B❤️"]);
		assert.match(stringifiedChange, someSurvivingMarkerRegex);
	});

	// These tests assert that the squashed change carries no extraneous information about nodes that are not
	// present in the final document. They are NOT EXPECTED TO PASS (though some may by accident) until the
	// minimization algorithm is implemented. (`minimize` is currently a no-op.)
	describe.skip("removes extraneous data from the squashed change (expected to fail until minimize is implemented)", () => {
		it("drops the build and destroy for a create-then-remove", () => {
			const { view, stringifiedChange } = runStringArrayScenario(scenarioAAddedThenRemoved);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The created node is not present in the final document, so its build/destroy should be removed.
			assert.equal(countBuilds(change), 0);
			assert.equal(countDestroys(change), 0);
		});

		it("keeps only the persisted node's build when a transient node is also created", () => {
			const { view, stringifiedChange } = runStringArrayScenario(scenarioAKeptAndBTransient);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only "A❤️" survives the transaction, so exactly one build should remain.
			assert.equal(countBuilds(change), 1);
		});

		it("keeps only the final node's build when a node is replaced", () => {
			const { view, stringifiedChange } = runStringArrayScenario(scenarioAReplacedByB);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only "B❤️" survives the transaction, so exactly one build should remain.
			assert.equal(countBuilds(change), 1);
		});

		it("keeps only the surviving node's build when inserted content is relocated then removed", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioBInsertedBeforeAThenARemoved,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only "B❤️" survives the transaction, so exactly one build should remain.
			assert.equal(countBuilds(change), 1);
		});

		it("keeps the surrounding builds when a node in the middle of an inserted run is removed", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioAbcInsertedThenBRemoved,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// "A❤️" and "C❤️" survive but "B☠️" is removed, so A-B-C build should be split, leaving two.
			assert.equal(countBuilds(change), 2);
		});

		it("drops the build for an inserted node that is moved then removed", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioABCInsertedThenBMovedThenRemoved,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// "B☠️" is removed despite being moved, so A-B-C build should be split, leaving two.
			assert.equal(countBuilds(change), 2);
		});

		it("keeps only the trailing node's [modified] build when a moved node and its successor from leading node build are removed", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioABCInsertedThenBMovedThenBAndARemoved,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// "A☠️" and the moved "B☠️" are removed, so only "C❤️"'s build should remain.
			assert.equal(countBuilds(change), 1);
		});

		it("keeps only the leading node's build when a moved node and its insertion companion are removed", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioABCInsertedThenBMovedThenCAndBRemoved,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The moved "B☠️" and "C☠️" are removed, so only "A❤️"'s build should remain.
			assert.equal(countBuilds(change), 1);
		});

		it("carries no build for a transient insert over pre-existing content", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioPreExistingContentAndTransientInsert,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Pre-existing nodes are not built by this transaction and "A☠️" is removed, so no builds should remain.
			assert.equal(countBuilds(change), 0);
		});

		it("keeps only the surviving inserted node's build over pre-existing content", () => {
			const { view, stringifiedChange } = runStringArrayScenario(
				scenarioPreExistingContentAndSurvivingInsert,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only "B❤️" is created and survives ("A☠️" is removed; "X" pre-exists), so exactly one build should remain.
			assert.equal(countBuilds(change), 1);
		});

		it("keeps only the final value's build when a field is set multiple times", () => {
			const { view, stringifiedChange } = runBoxArrayScenario(scenarioBoxValueSetTwice);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// Only the final value "y❤️" survives the transaction, so exactly one build should remain.
			assert.equal(countBuilds(change), 1);
		});

		it("carries no build when only item's value of a field is set and then the item is removed", () => {
			const { view, stringifiedChange } = runBoxArrayScenario(
				scenarioBoxValueSetThenBoxRemoved,
			);
			assert.doesNotMatch(stringifiedChange, transientMarkerRegex);
			const change = getHeadChange(view);
			// The created node is not present in the final document, so its build should be removed.
			assert.equal(countBuilds(change), 0);
		});
	});
});
