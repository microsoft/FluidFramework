/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import {
	type DDSFuzzModel,
	type DDSFuzzTestState,
	createDDSFuzzSuite,
} from "@fluid-internal/test-dds-utils";
import {
	combineReducers,
	type AsyncGenerator,
	type Generator,
	takeAsync,
} from "@fluid-internal/stochastic-test-utils";
import {
	Change,
	SharedTree as LegacySharedTree,
	type NodeId,
	type TraitLabel,
} from "@fluid-experimental/tree";
import {
	AllowedUpdateType,
	type ISharedTree,
	SchemaBuilder,
	SharedTreeFactory,
	type ISharedTreeView2,
} from "@fluid-experimental/tree2";
// eslint-disable-next-line import/no-internal-modules
import { type EditLog } from "@fluid-experimental/tree/dist/EditLog.js";
import { MigrationShimFactory } from "../migrationShimFactory.js";
import { SharedTreeShimFactory } from "../sharedTreeShimFactory.js";
import { type MigrationShim } from "../migrationShim.js";
import { type SharedTreeShim } from "../sharedTreeShim.js";
import { attributesMatch } from "../utils.js";
import { MigrationRegistryFactory, someNodeId } from "./migrationRegistryFactory.js";

interface Migrate {
	type: "barrier";
}

interface V1Op {
	type: "v1";
	quantity: number;
}

interface V2Op {
	type: "v2";
	quantity: number;
}

type Operation = Migrate | V1Op | V2Op;

type State = DDSFuzzTestState<MigrationRegistryFactory>;

// LegacySharedTree Helper functions
function hasRoot(tree: LegacySharedTree): boolean {
	const rootNode = tree.currentView.getViewNode(tree.currentView.root);
	const nodeId = rootNode.traits.get(someNodeId)?.[0];
	return nodeId !== undefined;
}

function getQuantityNodeId(tree: LegacySharedTree): NodeId {
	const rootNode = tree.currentView.getViewNode(tree.currentView.root);
	const nodeId = rootNode.traits.get(someNodeId)?.[0];
	assert(nodeId !== undefined, "should have someNodeId trait");
	const someNode = tree.currentView.getViewNode(nodeId);
	const quantityNodeId = someNode.traits.get("quantity" as TraitLabel)?.[0];
	assert(quantityNodeId !== undefined, "should have quantityNodeId trait");
	return quantityNodeId;
}

// Useful for just getting the values from the legacy tree
function getQuantity(tree: LegacySharedTree): number {
	const nodeId = getQuantityNodeId(tree);
	const quantityNode = tree.currentView.getViewNode(nodeId);
	const quantity = quantityNode.payload as number | undefined;
	assert(quantity !== undefined, "should have retrieved quantity");
	return quantity;
}

// New Shared Tree Schema
const builder = new SchemaBuilder({ scope: "test" });
const rootType = builder.object("abc", {
	quantity: builder.number,
});
const schema = builder.intoSchema(rootType);
const rootFieldType = schema.rootFieldSchema;
function getView(tree: ISharedTree): ISharedTreeView2<typeof rootFieldType> {
	return tree.schematize({
		initialTree: {
			quantity: 0,
		},
		allowedSchemaModifications: AllowedUpdateType.None,
		schema,
	});
}

const migrate = (legacyTree: LegacySharedTree, newTree: ISharedTree): void => {
	// Revert local edits - otherwise we will be eventually inconsistent
	const edits = legacyTree.edits as EditLog;
	const localEdits = [...edits.getLocalEdits()].reverse();
	for (const edit of localEdits) {
		legacyTree.revert(edit.id);
	}
	const quantity = getQuantity(legacyTree);
	newTree.schematize({
		initialTree: {
			quantity,
		},
		allowedSchemaModifications: AllowedUpdateType.None,
		schema,
	});
};

const legacyTreeFactory = LegacySharedTree.getFactory();
const newTreeFactory = new SharedTreeFactory();
const sharedTreeShimFactory = new SharedTreeShimFactory(newTreeFactory);
const migrationShimFactory = new MigrationShimFactory(legacyTreeFactory, newTreeFactory, migrate);
const registryFactory = new MigrationRegistryFactory(migrationShimFactory, sharedTreeShimFactory);

function assertShimsAreEquivalent(
	a: MigrationShim | SharedTreeShim,
	b: MigrationShim | SharedTreeShim,
): void {
	assert.equal(a.attributes, b.attributes, `${a.id} and ${b.id} have different attributes.`);
	if (attributesMatch(a.attributes, newTreeFactory.attributes)) {
		const treeA = a.currentTree as ISharedTree;
		const treeB = b.currentTree as ISharedTree;
		const viewA = getView(treeA);
		const viewB = getView(treeB);
		const aVal = viewA.root.quantity;
		const bVal = viewB.root.quantity;
		assert.equal(aVal, bVal, `New: ${a.id} and ${b.id} differ: ${aVal} vs ${bVal}`);
	} else {
		assert(
			attributesMatch(a.attributes, legacyTreeFactory.attributes),
			"Attributes do not match either tree.",
		);
		const treeA = a.currentTree as LegacySharedTree;
		const treeB = b.currentTree as LegacySharedTree;

		const aVal = hasRoot(treeA) ? getQuantity(treeA) : undefined;
		const bVal = hasRoot(treeB) ? getQuantity(treeB) : undefined;
		assert.equal(aVal, bVal, `Legacy: ${a.id} and ${b.id} differ: ${aVal} vs ${bVal}`);
	}
}

const reducer = combineReducers<Operation, State>({
	barrier(state: State): void | State {
		const client = state.client;
		const dds = client.channel as MigrationShim;
		assert(attributesMatch(dds.attributes, legacyTreeFactory.attributes));
		const shim = dds;
		shim.submitMigrateOp();
	},
	v1(state: State, operation: V1Op): void | State {
		const client = state.client;
		const dds = client.channel;
		assert(attributesMatch(dds.attributes, legacyTreeFactory.attributes));
		const shim = dds;
		const tree = shim.currentTree as LegacySharedTree;

		const quantityNodeId = getQuantityNodeId(tree);
		tree.applyEdit(Change.setPayload(quantityNodeId, operation.quantity));
	},
	v2(state: State, operation: V2Op): void | State {
		const client = state.client;
		const dds = client.channel;
		assert(attributesMatch(dds.attributes, newTreeFactory.attributes));
		const shim = dds as SharedTreeShim;
		const tree = shim.currentTree;
		const rootNode = getView(tree).root;
		rootNode.quantity = operation.quantity;
	},
});

interface GeneratorOptions {
	migrateChance: number;
}

const defaultOptions: GeneratorOptions = {
	migrateChance: 20,
};

function makeGenerator(optionsParam?: Partial<GeneratorOptions>): AsyncGenerator<Operation, State> {
	const { migrateChance } = { ...defaultOptions, ...optionsParam };
	const v2Op: Generator<V2Op, State> = ({ random }) => ({
		type: "v2",
		quantity: random.integer(1, 50),
	});
	const v1Op: Generator<V1Op, State> = ({ random }) => ({
		type: "v1",
		quantity: random.integer(1, 50),
	});
	const migrateOp: Generator<Migrate, State> = ({ random }) => ({
		type: "barrier",
	});

	return async (state) => {
		const random = state.random;
		if (state.isDetached) {
			return v1Op(state);
		}
		const migrated = attributesMatch(
			state.client.channel.attributes,
			newTreeFactory.attributes,
		);
		if (migrated) {
			return v2Op(state);
		}
		const weightSelected = random.integer(0, migrateChance);
		if (weightSelected === 0) {
			return migrateOp(state);
		}
		return v1Op(state);
	};
}

describe("Shim fuzz tests", () => {
	const model: DDSFuzzModel<MigrationRegistryFactory, Operation> = {
		workloadName: "default",
		factory: registryFactory,
		generatorFactory: () => takeAsync(10, makeGenerator()),
		reducer: async (state, operation) => reducer(state, operation),
		validateConsistency: assertShimsAreEquivalent,
	};

	const filename = fileURLToPath(import.meta.url);
	const __dirname = path.dirname(filename);

	createDDSFuzzSuite(model, {
		defaultTestCount: 100,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 6,
			clientAddProbability: 0.1,
		},
		reconnectProbability: 0,
		validationStrategy: {
			type: "partialSynchronization",
			probability: 0.1,
			clientProbability: 0.25,
		},
		// Uncomment to replay a particular seed.
		// replay: 0,
		saveFailures: { directory: path.join(__dirname, "../../src/test/results/shim") },
	});

	// createDDSFuzzSuite(
	// 	{ ...model, workloadName: "with reconnect" },
	// 	{
	// 		defaultTestCount: 100,
	// 		numberOfClients: 3,
	// 		clientJoinOptions: {
	// 			maxNumberOfClients: 6,
	// 			clientAddProbability: 0.1,
	// 		},
	// 		reconnectProbability: 0.1,
	// 		// Uncomment to replay a particular seed.
	// 		// replay: 0,
	// 		saveFailures: {
	// 			directory: path.join(__dirname, "../../src/test/results/shim-reconnect"),
	// 		},
	// 	},
	// );

	// createDDSFuzzSuite(
	// 	{ ...model, workloadName: "with batches and rebasing" },
	// 	{
	// 		defaultTestCount: 100,
	// 		numberOfClients: 3,
	// 		clientJoinOptions: {
	// 			maxNumberOfClients: 6,
	// 			clientAddProbability: 0.1,
	// 		},
	// 		rebaseProbability: 0.2,
	// 		containerRuntimeOptions: {
	// 			flushMode: FlushMode.TurnBased,
	// 			enableGroupedBatching: true,
	// 		},
	// 		// Uncomment to replay a particular seed.
	// 		// replay: 0,
	// 		saveFailures: {
	// 			directory: path.join(__dirname, "../../src/test/results/shim-rebase"),
	// 		},
	// 	},
	// );
});
