/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	type BuildNode,
	Change,
	SharedTree as LegacySharedTree,
	MigrationShimFactory,
	StablePlace,
	type TraitLabel,
} from "@fluid-experimental/tree";
import { CellFactory } from "@fluidframework/cell/internal";
import { detectOutboundReferences } from "@fluidframework/container-runtime/internal";
import { IChannelFactory } from "@fluidframework/datastore-definitions/internal";
import { SessionId } from "@fluidframework/id-compressor";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import {
	DirectoryFactory,
	type ISharedDirectory,
	MapFactory,
} from "@fluidframework/map/internal";
import { SharedMatrixFactory } from "@fluidframework/matrix/internal";
import { ConsensusQueueFactory } from "@fluidframework/ordered-collection/internal";
import { ConsensusRegisterCollectionFactory } from "@fluidframework/register-collection/internal";
import { ReferenceType, SharedString } from "@fluidframework/sequence/internal";
import {
	MockDeltaConnection,
	MockFluidDataStoreRuntime,
	MockHandle,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";
import { ITree, SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";

/**
 * The purpose of these tests is to demonstrate that DDSes do not do opaque encoding of handles
 * when preparing the op payload (e.g. prematurely serializing).
 * This is important because the runtime needs to inspect the full op payload for handles.
 */
describe("DDS Handle Encoding", () => {
	const handle = new MockHandle("whatever");
	const messages: any[] = [];

	beforeEach(() => {
		messages.length = 0;
	});

	/**
	 * This uses the same logic that the ContainerRuntime does when processing incoming messages
	 * to detect handles in the op's object graph, for notifying GC of new references between objects.
	 *
	 * @returns The list of handles found in the given contents object
	 */
	function findAllHandles(contents: unknown) {
		const handlesFound: string[] = [];
		detectOutboundReferences("envelope", contents, (from, to) => {
			handlesFound.push(to);
		});
		return handlesFound;
	}

	/** Each test case runs some code then declares the handles (if any) it expects to be included in the op payload */
	interface ITestCase {
		name: string;
		addHandleToDDS(): void;
		expectedHandles: string[];
	}

	/** This takes care of creating the DDS behind the scenes so the ITestCase's code is ready to invoke */
	function createTestCase<T>(
		factory: IChannelFactory<T>,
		addHandleToDDS: (dds: T) => void,
		expectedHandles: string[],
		nameOverride?: string,
	): ITestCase {
		// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
		const name = nameOverride ?? factory.type.split("/").pop()!;

		const dataStoreRuntime = new MockFluidDataStoreRuntime({
			idCompressor: createIdCompressor("173cb232-53a2-4327-b690-afa954397989" as SessionId),
		});
		const deltaConnection = new MockDeltaConnection(
			/* submitFn: */ (message) => {
				messages.push(message);
				return 0; // unused
			},
			/* dirtyFn: */ () => {},
		);
		const services = {
			deltaConnection,
			objectStorage: new MockStorage(),
		};
		const dds = factory.create(dataStoreRuntime, name);
		dds.connect(services);

		return {
			name,
			addHandleToDDS: () => addHandleToDDS(dds),
			expectedHandles,
		};
	}

	const testCases: ITestCase[] = [
		createTestCase(
			new MapFactory(),
			(dds) => {
				dds.set("whatever", handle);
			},
			[handle.absolutePath] /* expectedHandles */,
		),
		createTestCase(
			new DirectoryFactory(),
			(dds: ISharedDirectory) => {
				dds.set("whatever", handle);
			},
			[handle.absolutePath] /* expectedHandles */,
		),
		createTestCase(
			SharedString.getFactory(),
			(dds) => {
				dds.insertMarker(0, ReferenceType.Simple, { marker: handle });
			},
			[handle.absolutePath] /* expectedHandles */,
		),
		createTestCase(
			new SharedMatrixFactory(),
			(dds) => {
				dds.insertRows(0, 1);
				dds.insertCols(0, 1);

				dds.setCell(0, 0, handle);
			},
			[handle.absolutePath] /* expectedHandles */,
		),
		createTestCase(
			SharedTree.getFactory(),
			(dds: ITree) => {
				const builder = new SchemaFactory("test");
				class Bar extends builder.object("bar", {
					h: builder.optional(builder.handle),
				}) {}

				const config = new TreeViewConfiguration({ schema: Bar });

				const treeView = dds.viewWith(config);
				treeView.initialize({ h: undefined });

				treeView.root.h = handle;
			},
			[handle.absolutePath] /* expectedHandles */,
			"tree2",
		),
		createTestCase(
			LegacySharedTree.getFactory(),
			(tree) => {
				const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

				const handleNode: BuildNode = {
					definition: legacyNodeId,
					traits: {
						handle: {
							definition: "handle",
							payload: 0,
						},
					},
				};
				tree.applyEdit(
					Change.insertTree(
						handleNode,
						StablePlace.atStartOf({
							parent: tree.currentView.root,
							label: legacyNodeId,
						}),
					),
				);

				const rootNode = tree.currentView.getViewNode(tree.currentView.root);
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const nodeId = rootNode.traits.get(legacyNodeId)![0]!;
				const change: Change = Change.setPayload(nodeId, handle);
				tree.applyEdit(change);
			},
			[handle.absolutePath] /* expectedHandles */,
			"legacy-shared-tree",
		),
		createTestCase(
			new ConsensusRegisterCollectionFactory(),
			(dds) => {
				dds.write("whatever", handle).catch(() => {});
			},
			[handle.absolutePath] /* expectedHandles */,
		),
		createTestCase(
			new ConsensusQueueFactory(),
			(dds) => {
				dds.add(handle).catch(() => {});
			},
			[handle.absolutePath] /* expectedHandles */,
		),
		createTestCase(
			new CellFactory(),
			(dds) => {
				dds.set(handle);
			},
			[handle.absolutePath] /* expectedHandles */,
		),
		createTestCase(
			new MigrationShimFactory(
				LegacySharedTree.getFactory(),
				SharedTree.getFactory(),
				(legacyTree, newTree) => {
					throw new Error("unreachable");
				},
			),
			(shim) => {
				const tree = shim.currentTree as LegacySharedTree;
				const legacyNodeId: TraitLabel = "inventory" as TraitLabel;

				const handleNode: BuildNode = {
					definition: legacyNodeId,
					traits: {
						handle: {
							definition: "handle",
							payload: 0,
						},
					},
				};
				tree.applyEdit(
					Change.insertTree(
						handleNode,
						StablePlace.atStartOf({
							parent: tree.currentView.root,
							label: legacyNodeId,
						}),
					),
				);

				const rootNode = tree.currentView.getViewNode(tree.currentView.root);
				// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
				const nodeId = rootNode.traits.get(legacyNodeId)![0]!;
				const change: Change = Change.setPayload(nodeId, { handle });
				tree.applyEdit(change);
			},
			[handle.absolutePath] /* expectedHandles */,
			"migration-shim",
		),
	];

	testCases.forEach((testCase) => {
		const shouldOrShouldNot = testCase.expectedHandles.length > 0 ? "should not" : "should";
		it(`${shouldOrShouldNot} obscure handles in ${testCase.name} message contents`, async () => {
			testCase.addHandleToDDS();

			assert.deepEqual(
				messages.flatMap((m) => findAllHandles(m)),
				testCase.expectedHandles,
				`The handle ${shouldOrShouldNot} be detected`,
			);
		});
	});
});
