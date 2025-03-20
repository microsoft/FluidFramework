/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unused-expressions */

import { strict as assert } from "assert";

import { DeterministicRandomGenerator } from "@fluid-experimental/property-common";
import {
	ArrayProperty,
	Float64Property,
	Int32Property,
	NamedProperty,
	PropertyFactory,
	StringArrayProperty,
	StringProperty,
} from "@fluid-experimental/property-properties";
import {
	IContainer,
	IFluidCodeDetails,
	ILoaderOptions,
} from "@fluidframework/container-definitions/internal";
import {
	loadExistingContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import { IUrlResolver } from "@fluidframework/driver-definitions/internal";
import {
	LocalDocumentServiceFactory,
	LocalResolver,
} from "@fluidframework/local-driver/internal";
import {
	ILocalDeltaConnectionServer,
	LocalDeltaConnectionServer,
} from "@fluidframework/server-local-server";
import {
	ITestFluidObject,
	LoaderContainerTracker,
	TestFluidObjectFactory,
	createAndAttachContainerUsingProps,
	createLoaderProps,
} from "@fluidframework/test-utils/internal";
import { expect } from "chai";
import lodash from "lodash";
import { v5 as uuidv5 } from "uuid";

// 'lodash' import workaround.
const { range, sortedIndex, isFunction } = lodash;

import { SharedPropertyTree } from "../propertyTree.js";

// a "namespace" uuid to generate uuidv5 in fuzz tests
const namespaceGuid: string = "b6abf2df-d86d-413b-8fd1-359d4aa341f2";

function createLocalLoaderProps(
	packageEntries: Iterable<[IFluidCodeDetails, TestFluidObjectFactory]>,
	deltaConnectionServer: ILocalDeltaConnectionServer,
	urlResolver: IUrlResolver,
	options?: ILoaderOptions,
): ILoaderProps {
	const documentServiceFactory = new LocalDocumentServiceFactory(deltaConnectionServer);

	return createLoaderProps(
		packageEntries,
		documentServiceFactory,
		urlResolver,
		undefined,
		options,
	);
}

console.assert = (condition: boolean, ...data: any[]) => {
	assert(!!condition, "Console Assert");
};

function getFunctionSource(fun: any): string {
	let source = fun.toString() as string;
	source = source.replace(/^.*=>\s*{?\n?\s*/m, "");
	source = source.replace(/}\s*$/m, "");
	source = source.replace(/^\s*/gm, "");

	return source;
}

describe("PropertyDDS", () => {
	const documentId = "localServerTest";
	const documentLoadUrl = `https://localhost/${documentId}`;
	const propertyDdsId = "PropertyTree";
	const codeDetails: IFluidCodeDetails = {
		package: "localServerTestPackage",
		config: {},
	};
	const factory = new TestFluidObjectFactory([
		[propertyDdsId, SharedPropertyTree.getFactory()],
	]);

	let deltaConnectionServer: ILocalDeltaConnectionServer;
	let urlResolver: LocalResolver;
	let opProcessingController: LoaderContainerTracker;
	let container1: IContainer;
	let container2: IContainer;
	let dataObject1: ITestFluidObject;
	let dataObject2: ITestFluidObject;
	let sharedPropertyTree1: SharedPropertyTree;
	let sharedPropertyTree2: SharedPropertyTree;

	let errorHandler: (Error) => void;

	async function createContainer(): Promise<IContainer> {
		const createDetachedContainerProps = createLocalLoaderProps(
			[[codeDetails, factory]],
			deltaConnectionServer,
			urlResolver,
		);
		const containerUsingPops = await createAndAttachContainerUsingProps(
			{ ...createDetachedContainerProps, codeDetails },
			urlResolver.createCreateNewRequest(documentId),
		);
		opProcessingController.addContainer(containerUsingPops);
		return containerUsingPops;
	}

	async function loadContainer(): Promise<IContainer> {
		const loaderProps = createLocalLoaderProps(
			[[codeDetails, factory]],
			deltaConnectionServer,
			urlResolver,
		);
		const containerUsingPops = await loadExistingContainer({
			...loaderProps,
			request: { url: documentLoadUrl },
		});
		opProcessingController.addContainer(containerUsingPops);
		return containerUsingPops;
	}

	function createRandomTests(
		operations: {
			getParameters: (
				random: DeterministicRandomGenerator,
			) => Record<string, number | (() => void)>;
			op: (parameters: Record<string, any>) => Promise<void>;
			probability: number;
		}[],
		final: () => Promise<void>,
		count = 100,
		startTest = 0,
		maxOperations = 30,
	) {
		for (let i = startTest; i < count; i++) {
			const seed = uuidv5(String(i), namespaceGuid);
			it(`Generated Test Case #${i} (seed: ${seed})`, async () => {
				let testString = "";

				errorHandler = (err) => {
					console.error(`Failed Test code: ${testString}`);
				};
				const random = new DeterministicRandomGenerator(seed);
				const operationCumSums = [] as number[];
				for (const operation of operations) {
					operationCumSums.push(
						(operationCumSums[operationCumSums.length - 1] ?? 0) + operation.probability,
					);
				}

				try {
					const numOperations = random.irandom(maxOperations);
					const maxCount = operationCumSums[operationCumSums.length - 1];
					for (const _j of range(numOperations)) {
						const operationId = 1 + random.irandom(maxCount);
						const selectedOperation = sortedIndex(operationCumSums, operationId);

						const parameters = operations[selectedOperation].getParameters(random);

						// Create the source code for the test
						let operationSource = getFunctionSource(
							operations[selectedOperation].op.toString(),
						);
						for (const [key, value] of Object.entries(parameters)) {
							const valueString = isFunction(value)
								? getFunctionSource(value)
								: value.toString();
							operationSource = operationSource.replace(
								new RegExp(`parameters.${key}\\(?\\)?`),
								valueString,
							);
						}
						testString += operationSource;

						await operations[selectedOperation].op(parameters);
					}

					testString += getFunctionSource(final);
					await final();
				} catch (e) {
					console.error(`Failed Test code: ${testString}`);
					throw e;
				}
			}).timeout(10000);
		}
	}

	async function setupContainers(mode = true) {
		opProcessingController = new LoaderContainerTracker();
		deltaConnectionServer = LocalDeltaConnectionServer.create();
		urlResolver = new LocalResolver();

		// Create a Container for the first client.
		container1 = await createContainer();
		dataObject1 = (await container1.getEntryPoint()) as ITestFluidObject;
		sharedPropertyTree1 = await dataObject1.getSharedObject<SharedPropertyTree>(propertyDdsId);
		(sharedPropertyTree1 as any).__id = 1; // Add an id to simplify debugging via conditional breakpoints

		// Load the Container that was created by the first client.
		container2 = await loadContainer();
		dataObject2 = (await container2.getEntryPoint()) as ITestFluidObject;
		sharedPropertyTree2 = await dataObject2.getSharedObject<SharedPropertyTree>(propertyDdsId);
		(sharedPropertyTree2 as any).__id = 2; // Add an id to simplify debugging via conditional breakpoints

		if (mode) {
			// Submitting empty changeset to make sure both trees are in "write" mode, so the tests could control
			// which commits are being synced at every point of time.
			sharedPropertyTree1.commit(true);
			sharedPropertyTree2.commit(true);
		}

		// Attach error handlers to make debugging easier and ensure that internal failures cause the test to fail
		errorHandler = (err) => {}; // This enables the create random tests function to register its own handler
		container1.on("closed", (err: any) => {
			if (err !== undefined) {
				errorHandler(err);
				throw err;
			}
		});
		container2.on("closed", (err: any) => {
			if (err !== undefined) {
				errorHandler(err);
				throw err;
			}
		});
	}

	function rebaseTests() {
		describe("with non overlapping inserts", () => {
			let ACount: number;
			let CCount: number;

			beforeEach(async function () {
				this.timeout(10000);

				// Insert and prepare an array within the container
				sharedPropertyTree1.root.insert("array", PropertyFactory.create("String", "array"));

				const array = sharedPropertyTree1.root.get("array") as StringArrayProperty;
				array.push("B1");
				array.push("B2");
				array.push("B3");
				sharedPropertyTree1.commit();

				ACount = 0;
				CCount = 0;

				// Make sure both shared trees are in sync
				await opProcessingController.ensureSynchronized();
				await opProcessingController.pauseProcessing();
			});

			afterEach(() => {
				const result = range(1, ACount + 1)
					.map((i) => `A${i}`)
					.concat(["B1", "B2", "B3"])
					.concat(range(1, CCount + 1).map((i) => `C${i}`));

				const array1 = sharedPropertyTree1.root.get("array") as StringArrayProperty;
				const array2 = sharedPropertyTree2.root.get("array") as StringArrayProperty;
				for (const array of [array1, array2]) {
					for (const [i, value] of result.entries()) {
						expect(array.get(i)).to.equal(value);
					}
				}
			});

			function insertInArray(tree: SharedPropertyTree, letter: string) {
				const array = tree.root.get("array") as StringArrayProperty;

				// Find the insert position
				let insertPosition: number;
				let insertString: string;
				if (letter === "A") {
					// We insert all As in front of B1
					const values: string[] = array.getValues();
					insertPosition = values.indexOf("B1");

					// For these letters we can just use the position to get the number for the inserted string
					insertString = `A${insertPosition + 1}`;

					ACount++;
				} else {
					// Alway insert B at the end
					insertPosition = array.getLength();

					// Get the number from the previous entry
					const previous = array.get(insertPosition - 1) as string;
					const entryNumber = previous.startsWith("B")
						? 1
						: Number.parseInt(previous[1], 10) + 1;
					insertString = `C${entryNumber}`;

					CCount++;
				}

				array.insert(insertPosition, insertString);
				tree.commit();
			}

			it("Should work when doing two batches with synchronization in between", async () => {
				insertInArray(sharedPropertyTree1, "A");
				insertInArray(sharedPropertyTree1, "A");
				insertInArray(sharedPropertyTree1, "A");

				await opProcessingController.ensureSynchronized();

				insertInArray(sharedPropertyTree2, "C");
				insertInArray(sharedPropertyTree2, "C");
				insertInArray(sharedPropertyTree2, "C");

				await opProcessingController.ensureSynchronized();
			});

			it("Should work when doing two batches without synchronization inbetween", async () => {
				insertInArray(sharedPropertyTree1, "A");
				insertInArray(sharedPropertyTree1, "A");
				insertInArray(sharedPropertyTree1, "A");

				insertInArray(sharedPropertyTree2, "C");
				insertInArray(sharedPropertyTree2, "C");
				insertInArray(sharedPropertyTree2, "C");

				await opProcessingController.ensureSynchronized();
			});

			it("Should work when creating local branches with different remote heads", async () => {
				insertInArray(sharedPropertyTree2, "C");
				insertInArray(sharedPropertyTree1, "A");
				await opProcessingController.ensureSynchronized();
				insertInArray(sharedPropertyTree2, "C");
				insertInArray(sharedPropertyTree1, "A");
				await opProcessingController.ensureSynchronized();
				insertInArray(sharedPropertyTree2, "C");
				insertInArray(sharedPropertyTree1, "A");

				await opProcessingController.ensureSynchronized();
			});

			it("Should work when synchronizing after each operation", async () => {
				insertInArray(sharedPropertyTree1, "A");
				await opProcessingController.ensureSynchronized();
				insertInArray(sharedPropertyTree1, "A");
				await opProcessingController.ensureSynchronized();
				insertInArray(sharedPropertyTree1, "A");
				await opProcessingController.ensureSynchronized();

				insertInArray(sharedPropertyTree2, "C");
				await opProcessingController.ensureSynchronized();
				insertInArray(sharedPropertyTree2, "C");
				await opProcessingController.ensureSynchronized();
				insertInArray(sharedPropertyTree2, "C");
				await opProcessingController.ensureSynchronized();
			});

			it("Should work when synchronizing after pairs of operations", async () => {
				insertInArray(sharedPropertyTree1, "A");
				insertInArray(sharedPropertyTree2, "C");
				await opProcessingController.ensureSynchronized();
				insertInArray(sharedPropertyTree1, "A");
				insertInArray(sharedPropertyTree2, "C");
				await opProcessingController.ensureSynchronized();
				insertInArray(sharedPropertyTree1, "A");
				insertInArray(sharedPropertyTree2, "C");
				await opProcessingController.ensureSynchronized();
			});

			it("Should work when intermediate changes cancel", async () => {
				sharedPropertyTree1.root.insert(
					"test",
					PropertyFactory.create("Float64", undefined, 0),
				);
				sharedPropertyTree1.commit();
				await opProcessingController.ensureSynchronized();

				// Remove the entry in tree 1
				sharedPropertyTree1.root.remove("test");
				sharedPropertyTree1.commit();

				// Remove and reinsert in two operations that cancel out in tree2
				sharedPropertyTree2.root.remove("test");
				sharedPropertyTree2.commit();
				await opProcessingController.processOutgoing(container2);
				await opProcessingController.processIncoming(container1);
				sharedPropertyTree2.root.insert(
					"test",
					PropertyFactory.create("Float64", undefined, 0),
				);
				sharedPropertyTree2.commit();
				await opProcessingController.processOutgoing(container2);
				await opProcessingController.processIncoming(container1);

				// Now make sure the trees are synchronized
				await opProcessingController.ensureSynchronized();

				expect(sharedPropertyTree1.root.serialize()).to.deep.equal(
					sharedPropertyTree2.root.serialize(),
				);
			});

			it("Should work when the type of a primitive variable changes", async () => {
				// First we insert a float
				sharedPropertyTree1.root.insert(
					"test",
					PropertyFactory.create("Float64", undefined, 0),
				);
				sharedPropertyTree1.commit();
				await opProcessingController.ensureSynchronized();

				// Modify the entry in tree 1
				sharedPropertyTree1.root.get<Float64Property>("test")?.setValue(10);
				sharedPropertyTree1.commit();

				// Remove and reinsert in two operations changing the type in tree2
				sharedPropertyTree2.root.remove("test");
				sharedPropertyTree2.commit();
				await opProcessingController.processOutgoing(container2);
				await opProcessingController.processIncoming(container1);
				sharedPropertyTree2.root.insert(
					"test",
					PropertyFactory.create("String", undefined, "Test"),
				);
				sharedPropertyTree2.commit();
				await opProcessingController.processOutgoing(container2);
				await opProcessingController.processIncoming(container1);

				// Now make sure the trees are synchronized
				await opProcessingController.ensureSynchronized();

				expect(sharedPropertyTree1.root.serialize()).to.deep.equal(
					sharedPropertyTree2.root.serialize(),
				);
				expect(sharedPropertyTree1.root.get<StringProperty>("test")).to.be.instanceof(
					StringProperty,
				);
				expect(sharedPropertyTree1.root.get<StringProperty>("test")?.getValue()).to.equal(
					"Test",
				);
			});

			it("works with overlapping sequences", async () => {
				insertInArray(sharedPropertyTree2, "C");
				await opProcessingController.processOutgoing(container2);

				// Insert five operations to make this overlap with the insert position of C
				insertInArray(sharedPropertyTree1, "A");
				insertInArray(sharedPropertyTree1, "A");
				insertInArray(sharedPropertyTree1, "A");
				insertInArray(sharedPropertyTree1, "A");
				insertInArray(sharedPropertyTree1, "A");
				await opProcessingController.processIncoming(container1);
				insertInArray(sharedPropertyTree1, "A");
				await opProcessingController.processIncoming(container2);

				await opProcessingController.ensureSynchronized();
			});

			it("Should work when the remote head points to a change that is not the reference change", async () => {
				insertInArray(sharedPropertyTree2, "C");
				await opProcessingController.processOutgoing(container2);
				insertInArray(sharedPropertyTree1, "A");
				await opProcessingController.processOutgoing(container1);
				insertInArray(sharedPropertyTree2, "C");
				await opProcessingController.processIncoming(container2);
				insertInArray(sharedPropertyTree2, "C");
				insertInArray(sharedPropertyTree2, "C");

				await opProcessingController.ensureSynchronized();
			});

			describe("Randomized Tests", () => {
				const count = 100;
				const startTest = 0;
				const logTest = true;

				for (let i = startTest; i < count; i++) {
					const seed = uuidv5(String(i), namespaceGuid);
					it(`Generated Test Case #${i} (seed: ${seed})`, async () => {
						const random = new DeterministicRandomGenerator(seed);
						let testString = "";

						const numOperations = random.irandom(30);
						for (const _j of range(numOperations)) {
							const operation = random.irandom(6);
							switch (operation) {
								case 0:
									insertInArray(sharedPropertyTree1, "A");
									if (logTest) {
										testString += 'insertInArray(sharedPropertyTree1, "A");\n';
									}
									break;
								case 1:
									insertInArray(sharedPropertyTree2, "C");
									if (logTest) {
										testString += 'insertInArray(sharedPropertyTree2, "C");\n';
									}
									break;
								case 2:
									await opProcessingController.processOutgoing(container1);
									if (logTest) {
										testString +=
											"await opProcessingController.processOutgoing(container1);\n";
									}
									break;
								case 3:
									await opProcessingController.processIncoming(container1);
									if (logTest) {
										testString +=
											"await opProcessingController.processIncoming(container1);\n";
									}
									break;
								case 4:
									await opProcessingController.processOutgoing(container2);
									if (logTest) {
										testString +=
											"await opProcessingController.processOutgoing(container2);\n";
									}
									break;
								case 5:
									await opProcessingController.processIncoming(container2);
									if (logTest) {
										testString +=
											"await opProcessingController.processIncoming(container2);\n";
									}
									break;
								default:
									throw new Error("Should never happen");
							}
						}

						await opProcessingController.ensureSynchronized();
						if (logTest) {
							testString += "await opProcessingController.ensureSynchronized();\n";
						}
					});
				}
			});
		});

		describe("with inserts and deletes at arbitrary positions", () => {
			let createdProperties: Set<string>;
			let deletedProperties: Set<string>;
			beforeEach(async () => {
				createdProperties = new Set();
				deletedProperties = new Set();
				(PropertyFactory as any)._reregister({
					typeid: "test:namedEntry-1.0.0",
					inherits: ["NamedProperty"],
					properties: [],
				});

				await opProcessingController.pauseProcessing();
				sharedPropertyTree1.root.insert(
					"array",
					PropertyFactory.create("test:namedEntry-1.0.0", "array"),
				);
				sharedPropertyTree1.commit();

				// // Making sure that both trees are in write mode.
				// sharedPropertyTree2.commit(true);
				// Make sure both shared trees are in sync
				await opProcessingController.ensureSynchronized();
			});
			afterEach(async () => {
				// We expect the internal representation to be the same between both properties
				expect((sharedPropertyTree1 as any).remoteTipView).to.deep.equal(
					(sharedPropertyTree2 as any).remoteTipView,
				);

				// We expect the property tree to be the same between both
				expect(sharedPropertyTree1.root.serialize()).to.deep.equal(
					sharedPropertyTree2.root.serialize(),
				);

				// We expect the property tree to correspond to the remote tip view
				expect((sharedPropertyTree1 as any).remoteTipView).to.deep.equal(
					sharedPropertyTree2.root.serialize(),
				);

				// We expect all properties from the set to be present
				const array = sharedPropertyTree1.root.get<ArrayProperty>("array");
				assert(array !== undefined, "property undefined");

				// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
				for (const property of array.getValues() as any[]) {
					expect(!deletedProperties.has(property.guid)).to.be.true;
					expect(createdProperties.has(property.guid)).to.be.true;
					createdProperties.delete(property.guid);
				}
				expect(createdProperties.size).to.equal(0);
			});
			function insertProperties(
				tree: SharedPropertyTree,
				index: number,
				count = 1,
				commit = true,
			) {
				for (let i = 0; i < count; i++) {
					const property = PropertyFactory.create<NamedProperty>("test:namedEntry-1.0.0");
					tree.root.get<ArrayProperty>("array")?.insert(index + i, property);
					createdProperties.add(property.getGuid());
				}

				if (commit) {
					tree.commit();
				}
			}
			function removeProperties(
				tree: SharedPropertyTree,
				index: number,
				count = 1,
				commit = true,
			) {
				const array = tree.root.get<ArrayProperty>("array");
				assert(array !== undefined, "property undefined");

				for (let i = 0; i < count; i++) {
					if (index >= array.getLength()) {
						break;
					}
					const property = array.get<NamedProperty>(index);
					assert(property !== undefined, "property undefined");
					array.remove(index);
					createdProperties.delete(property.getGuid());
					deletedProperties.add(property.getGuid());
				}
				if (commit) {
					tree.commit();
				}
			}

			it("inserting properties into both trees", async () => {
				insertProperties(sharedPropertyTree1, 0);
				insertProperties(sharedPropertyTree1, 1);
				insertProperties(sharedPropertyTree2, 0);
				insertProperties(sharedPropertyTree2, 1);
				await opProcessingController.ensureSynchronized();
			});

			it("inserting properties in one tree and deleting in the other", async () => {
				insertProperties(sharedPropertyTree1, 0);
				insertProperties(sharedPropertyTree1, 1);
				await opProcessingController.ensureSynchronized();
				removeProperties(sharedPropertyTree2, 0);
				removeProperties(sharedPropertyTree2, 0);
				await opProcessingController.ensureSynchronized();
			});

			it("inserting properties in one tree and deleting in both", async () => {
				insertProperties(sharedPropertyTree1, 0);
				insertProperties(sharedPropertyTree1, 1);
				await opProcessingController.ensureSynchronized();
				removeProperties(sharedPropertyTree1, 0);
				removeProperties(sharedPropertyTree2, 0);
				await opProcessingController.ensureSynchronized();
			});
			it("Multiple inserts in sequence in tree 1", async () => {
				insertProperties(sharedPropertyTree1, 0, 1, true);
				insertProperties(sharedPropertyTree1, 0, 1, true);
				insertProperties(sharedPropertyTree1, 1, 1, true);
				insertProperties(sharedPropertyTree2, 0, 1, true);

				await opProcessingController.ensureSynchronized();
			});

			describe("Random tests", () => {
				createRandomTests(
					[
						{
							getParameters: (random: DeterministicRandomGenerator) => {
								const tree =
									random.irandom(2) === 0
										? () => sharedPropertyTree1
										: () => sharedPropertyTree2;
								const array = tree().root.get<ArrayProperty>("array");
								return {
									position: random.irandom(array?.getLength()) || 0,
									count: random.irandom(3) + 1,
									tree,
								};
							},
							op: async (parameters) => {
								insertProperties(
									parameters.tree(),
									parameters.position,
									parameters.count,
									true,
								);
							},
							probability: 1,
						},
						{
							getParameters: (random: DeterministicRandomGenerator) => {
								const tree =
									random.irandom(2) === 0
										? () => sharedPropertyTree1
										: () => sharedPropertyTree2;
								const array = tree().root.get<ArrayProperty>("array");
								return {
									position: random.irandom(array?.getLength()) || 0,
									count: random.irandom(3) + 1,
									tree,
								};
							},
							op: async (parameters) => {
								removeProperties(
									parameters.tree(),
									parameters.position,
									parameters.count,
									true,
								);
							},
							probability: 1,
						},
						{
							getParameters: (random: DeterministicRandomGenerator) => {
								const container =
									random.irandom(2) === 0 ? () => container1 : () => container2;
								return {
									container,
								};
							},
							op: async (parameters) => {
								await opProcessingController.processOutgoing(parameters.container());
							},
							probability: 1,
						},
						{
							getParameters: (random: DeterministicRandomGenerator) => {
								const container =
									random.irandom(2) === 0 ? () => container1 : () => container2;
								return {
									container,
								};
							},
							op: async (parameters) => {
								await opProcessingController.processIncoming(parameters.container());
							},
							probability: 1,
						},
					],
					async () => {
						await opProcessingController.ensureSynchronized();
					},
					1000,
					0,
					25,
				);
			});
			describe("Failed Random Tests", () => {
				it("Test Failure 1", async () => {
					insertProperties(sharedPropertyTree1, 0, 1, true);
					insertProperties(sharedPropertyTree1, 0, 3, true);
					insertProperties(sharedPropertyTree1, 3, 3, true);
					insertProperties(sharedPropertyTree1, 6, 2, true);
					insertProperties(sharedPropertyTree1, 0, 3, true);
					insertProperties(sharedPropertyTree1, 0, 2, true);
					insertProperties(sharedPropertyTree1, 2, 2, true);
					insertProperties(sharedPropertyTree1, 8, 2, true);
					insertProperties(sharedPropertyTree1, 2, 2, true);
					insertProperties(sharedPropertyTree1, 16, 3, true);
					insertProperties(sharedPropertyTree1, 9, 1, true);
					insertProperties(sharedPropertyTree1, 4, 2, true);
					insertProperties(sharedPropertyTree1, 13, 3, true);
					insertProperties(sharedPropertyTree1, 9, 3, true);
					insertProperties(sharedPropertyTree1, 16, 2, true);
					insertProperties(sharedPropertyTree1, 12, 2, true);
					insertProperties(sharedPropertyTree2, 0, 2, true);
					insertProperties(sharedPropertyTree1, 12, 2, true);
					insertProperties(sharedPropertyTree1, 12, 3, true);
					insertProperties(sharedPropertyTree1, 25, 3, true);
					await opProcessingController.ensureSynchronized();
				});

				it("Test Failure 2", async () => {
					insertProperties(sharedPropertyTree1, 0, 1, true);
					insertProperties(sharedPropertyTree1, 0, 1, true);
					insertProperties(sharedPropertyTree1, 1, 1, true);
					insertProperties(sharedPropertyTree1, 1, 1, true);
					insertProperties(sharedPropertyTree1, 0, 1, true);
					insertProperties(sharedPropertyTree1, 2, 1, true);
					insertProperties(sharedPropertyTree1, 4, 1, true);
					insertProperties(sharedPropertyTree1, 2, 1, true);
					insertProperties(sharedPropertyTree1, 0, 1, true);
					insertProperties(sharedPropertyTree1, 6, 1, true);
					insertProperties(sharedPropertyTree1, 0, 1, true);
					insertProperties(sharedPropertyTree1, 6, 1, true);
					insertProperties(sharedPropertyTree1, 9, 1, true);
					insertProperties(sharedPropertyTree1, 0, 1, true);
					insertProperties(sharedPropertyTree1, 2, 1, true);
					insertProperties(sharedPropertyTree1, 9, 1, true);
					insertProperties(sharedPropertyTree2, 0, 1, true);
					insertProperties(sharedPropertyTree1, 4, 1, true);
					insertProperties(sharedPropertyTree1, 0, 1, true);
					insertProperties(sharedPropertyTree1, 3, 1, true);
					await opProcessingController.ensureSynchronized();
				});

				it("Test Failure 3", async () => {
					insertProperties(sharedPropertyTree1, 0, 1, true);
					insertProperties(sharedPropertyTree2, 0, 1, true);
					insertProperties(sharedPropertyTree2, 0, 1, true);

					await opProcessingController.ensureSynchronized();
				});

				it("Test Failure 4", async () => {
					insertProperties(sharedPropertyTree1, 0, 1, true);
					insertProperties(sharedPropertyTree2, 0, 1, true);
					insertProperties(sharedPropertyTree2, 0, 1, true);
					insertProperties(sharedPropertyTree2, 1, 1, true);

					await opProcessingController.ensureSynchronized();
				});

				it("Test Failure 5", async () => {
					insertProperties(sharedPropertyTree1, 0, 8, true);
					removeProperties(sharedPropertyTree1, 4, 3, true);

					await opProcessingController.ensureSynchronized();
				});

				it("Test Failure 6", async () => {
					insertProperties(sharedPropertyTree1, 0, 2, true);
					removeProperties(sharedPropertyTree1, 0, 2, true);
					insertProperties(sharedPropertyTree2, 0, 1, true);
					removeProperties(sharedPropertyTree2, 0, 1, true);

					await opProcessingController.ensureSynchronized();
				});

				it("Test Failure 7", async () => {
					insertProperties(sharedPropertyTree2, 0, 8, true);
					insertProperties(sharedPropertyTree1, 0, 2, true);
					await opProcessingController.processOutgoing(container1);
					await opProcessingController.processOutgoing(container2);
					insertProperties(sharedPropertyTree1, 1, 4, true);
					await opProcessingController.processOutgoing(container1);
					removeProperties(sharedPropertyTree1, 4, 3, true);
					removeProperties(sharedPropertyTree1, 0, 2, true);
					insertProperties(sharedPropertyTree1, 0, 4, true);

					await opProcessingController.ensureSynchronized();
				});

				it("Test Failure 8", async () => {
					insertProperties(sharedPropertyTree2, 0, 3, true);
					await opProcessingController.processOutgoing(container2);
					await opProcessingController.processIncoming(container1);
					removeProperties(sharedPropertyTree2, 0, 3, true);
					insertProperties(sharedPropertyTree2, 0, 3, true);
					await opProcessingController.processOutgoing(container2);
					insertProperties(sharedPropertyTree1, 0, 1, true);

					await opProcessingController.ensureSynchronized();
				});

				it("Test Failure 9", async () => {
					insertProperties(sharedPropertyTree2, 0, 9, true);
					insertProperties(sharedPropertyTree2, 4, 1, true);
					await opProcessingController.processOutgoing(container2);
					insertProperties(sharedPropertyTree2, 0, 1, true);
					await opProcessingController.processIncoming(container2);
					insertProperties(sharedPropertyTree2, 1, 2, true);

					await opProcessingController.ensureSynchronized();
				});

				it("Test Failure 10", async () => {
					insertProperties(sharedPropertyTree2, 0, 3, true);
					await opProcessingController.processOutgoing(container2);
					await opProcessingController.processIncoming(container1);
					removeProperties(sharedPropertyTree2, 0, 3, true);
					insertProperties(sharedPropertyTree2, 0, 3, true);
					await opProcessingController.processOutgoing(container2);
					insertProperties(sharedPropertyTree1, 0, 1, true);
					removeProperties(sharedPropertyTree1, 0, 1, true);
					await opProcessingController.ensureSynchronized();
				});
				it("Test Failure 11", async () => {
					insertProperties(sharedPropertyTree2, 0, 6, true);
					insertProperties(sharedPropertyTree1, 0, 1, true);
					await opProcessingController.processOutgoing(container1);
					await opProcessingController.processIncoming(container2);
					insertProperties(sharedPropertyTree2, 4, 2, true);
					await opProcessingController.ensureSynchronized();
				});
				it("Test Failure 12", async () => {
					insertProperties(sharedPropertyTree1, 0, 2, true);
					insertProperties(sharedPropertyTree2, 0, 3, true);
					await opProcessingController.processOutgoing(container1);
					await opProcessingController.processOutgoing(container2);
					removeProperties(sharedPropertyTree2, 2, 2, true);
					await opProcessingController.processIncoming(container2);
					insertProperties(sharedPropertyTree2, 1, 2, true);
					await opProcessingController.ensureSynchronized();
				});
				it("Test Failure 13", async () => {
					insertProperties(sharedPropertyTree1, 0, 2, true);
					await opProcessingController.processOutgoing(container1);
					await opProcessingController.processIncoming(container2);
					insertProperties(sharedPropertyTree2, 1, 3, true);
					removeProperties(sharedPropertyTree2, 4, 1, true);
					insertProperties(sharedPropertyTree2, 4, 3, true);
					insertProperties(sharedPropertyTree1, 1, 2, true);
					await opProcessingController.processOutgoing(container2);
					await opProcessingController.processOutgoing(container1);
					await opProcessingController.ensureSynchronized();
				});
				it("Test Failure 14", async () => {
					insertProperties(sharedPropertyTree1, 0, 1, true);
					await opProcessingController.processOutgoing(container1);
					insertProperties(sharedPropertyTree2, 0, 2, true);
					await opProcessingController.processIncoming(container2);
					removeProperties(sharedPropertyTree2, 0, 1, true);
					await opProcessingController.processOutgoing(container2);
					insertProperties(sharedPropertyTree1, 0, 1, true);
					await opProcessingController.ensureSynchronized();
				});
				it("Test Failure 15", async () => {
					insertProperties(sharedPropertyTree2, 0, 1, true);
					await opProcessingController.processOutgoing(container2);
					await opProcessingController.processIncoming(container1);
					insertProperties(sharedPropertyTree2, 0, 2, true);
					await opProcessingController.processOutgoing(container2);
					insertProperties(sharedPropertyTree1, 0, 2, true);
					removeProperties(sharedPropertyTree1, 1, 3, true);
					insertProperties(sharedPropertyTree1, 0, 1, true);
					await opProcessingController.ensureSynchronized();
				});
				it("Test Failure 16", async () => {
					insertProperties(sharedPropertyTree1, 0, 3, true);
					await opProcessingController.processOutgoing(container1);
					insertProperties(sharedPropertyTree2, 0, 1, true);
					removeProperties(sharedPropertyTree2, 0, 1, true);
					removeProperties(sharedPropertyTree1, 0, 3, true);
					insertProperties(sharedPropertyTree1, 0, 3, true);
					await opProcessingController.processIncoming(container2);
					insertProperties(sharedPropertyTree2, 2, 2, true);
					await opProcessingController.ensureSynchronized();
				});
				it("Test Failure 17", async () => {
					insertProperties(sharedPropertyTree1, 0, 3, true);
					await opProcessingController.processOutgoing(container1);
					insertProperties(sharedPropertyTree1, 2, 4, true);
					removeProperties(sharedPropertyTree1, 0, 3, true);
					removeProperties(sharedPropertyTree1, 1, 3, true);
					insertProperties(sharedPropertyTree1, 0, 2, true);

					await opProcessingController.processIncoming(container2);
					insertProperties(sharedPropertyTree2, 1, 1, true);

					await opProcessingController.ensureSynchronized();
				});
				it("Test Failure 18", async () => {
					insertProperties(sharedPropertyTree2, 0, 3, true);
					await opProcessingController.processOutgoing(container2);
					await opProcessingController.processIncoming(container1);
					removeProperties(sharedPropertyTree2, 0, 3, true);
					insertProperties(sharedPropertyTree2, 0, 3, true);
					await opProcessingController.processOutgoing(container2);
					removeProperties(sharedPropertyTree1, 1, 2, true);
					insertProperties(sharedPropertyTree1, 0, 1, true);

					await opProcessingController.ensureSynchronized();
				});
				it("Test Failure 19", async () => {
					insertProperties(sharedPropertyTree1, 0, 3, true);
					insertProperties(sharedPropertyTree2, 0, 1, true);
					await opProcessingController.processOutgoing(container2);
					await opProcessingController.processOutgoing(container1);
					await opProcessingController.processIncoming(container2);
					removeProperties(sharedPropertyTree2, 1, 3, true);
					await opProcessingController.processOutgoing(container1);
					removeProperties(sharedPropertyTree1, 0, 1, true);
					insertProperties(sharedPropertyTree1, 0, 3, true);
					removeProperties(sharedPropertyTree2, 0, 2, true);

					await opProcessingController.ensureSynchronized();
				});

				it("Test Failure 20", async () => {
					insertProperties(sharedPropertyTree1, 0, 2, true);
					await opProcessingController.processOutgoing(container2);
					insertProperties(sharedPropertyTree2, 0, 2, true);
					await opProcessingController.processOutgoing(container2);
					removeProperties(sharedPropertyTree2, 1, 3, true);
					await opProcessingController.processIncoming(container1);
					removeProperties(sharedPropertyTree1, 1, 3, true);
					insertProperties(sharedPropertyTree1, 1, 2, true);
					removeProperties(sharedPropertyTree2, 0, 1, true);

					await opProcessingController.ensureSynchronized();
				});

				it("Test Failure 21", async () => {
					insertProperties(sharedPropertyTree1, 0, 7, true);
					await opProcessingController.processOutgoing(container1);
					await opProcessingController.processIncoming(container2);
					insertProperties(sharedPropertyTree1, 4, 2, true);
					await opProcessingController.processOutgoing(container1);
					insertProperties(sharedPropertyTree2, 5, 1, true);
					removeProperties(sharedPropertyTree2, 6, 2, true);
					insertProperties(sharedPropertyTree1, 6, 1, true);
					removeProperties(sharedPropertyTree1, 8, 1, true);
					await opProcessingController.processOutgoing(container2);
					removeProperties(sharedPropertyTree1, 7, 2, true);

					await opProcessingController.ensureSynchronized();
				});

				it("Test Failure 22", async () => {
					insertProperties(sharedPropertyTree2, 0, 3, true);
					await opProcessingController.processIncoming(container2);
					insertProperties(sharedPropertyTree2, 1, 2, true);
					removeProperties(sharedPropertyTree1, 0, 2, true);
					await opProcessingController.processOutgoing(container1);
					insertProperties(sharedPropertyTree1, 0, 1, true);
					await opProcessingController.processOutgoing(container1);
					await opProcessingController.processOutgoing(container2);
					await opProcessingController.processIncoming(container1);
					await opProcessingController.ensureSynchronized();
					insertProperties(sharedPropertyTree1, 5, 2, true);
					await opProcessingController.processIncoming(container1);
					await opProcessingController.processOutgoing(container2);
					removeProperties(sharedPropertyTree2, 1, 1, true);
					removeProperties(sharedPropertyTree1, 6, 2, true);
					await opProcessingController.processIncoming(container2);
					insertProperties(sharedPropertyTree1, 3, 2, true);
					await opProcessingController.processOutgoing(container2);
					removeProperties(sharedPropertyTree2, 2, 3, true);
					removeProperties(sharedPropertyTree1, 3, 2, true);
					insertProperties(sharedPropertyTree2, 1, 3, true);
					await opProcessingController.ensureSynchronized();
				});

				it("Test failure 23", async () => {
					insertProperties(sharedPropertyTree2, 0, 4, true);
					insertProperties(sharedPropertyTree1, 0, 3, true);
					await opProcessingController.processOutgoing(container2);
					insertProperties(sharedPropertyTree2, 1, 3, true);
					removeProperties(sharedPropertyTree2, 0, 2, true);
					await opProcessingController.ensureSynchronized();
				});

				it("Test failure 24", async () => {
					insertProperties(sharedPropertyTree2, 0, 6, true);
					await opProcessingController.processOutgoing(container2);
					await opProcessingController.processIncoming(container1);
					removeProperties(sharedPropertyTree2, 4, 1, true);
					removeProperties(sharedPropertyTree1, 3, 3, true);
					await opProcessingController.processOutgoing(container2);
					await opProcessingController.processIncoming(container1);
					removeProperties(sharedPropertyTree1, 2, 3, true);

					await opProcessingController.ensureSynchronized();
				});

				it("Test failure 25", async () => {
					insertProperties(sharedPropertyTree1, 0, 3, true);
					await opProcessingController.processOutgoing(container2);
					await opProcessingController.processOutgoing(container1);
					insertProperties(sharedPropertyTree2, 0, 3, true);
					await opProcessingController.processIncoming(container2);
					insertProperties(sharedPropertyTree2, 2, 1, true);
					removeProperties(sharedPropertyTree2, 0, 1, true);
					await opProcessingController.processOutgoing(container1);
					await opProcessingController.processIncoming(container2);
					insertProperties(sharedPropertyTree1, 1, 2, true);
					removeProperties(sharedPropertyTree2, 1, 2, true);
					await opProcessingController.processIncoming(container1);
					await opProcessingController.ensureSynchronized();
				});
			});
		});

		describe("Rebase with pending changes.", () => {
			it("Int32", async () => {
				const val1 = 600;
				const val2 = 500;

				await opProcessingController.pauseProcessing();

				const prop = PropertyFactory.create<Int32Property>("Int32");
				sharedPropertyTree1.root.insert("int32Prop", prop);

				sharedPropertyTree1.commit();
				// Make sure both shared trees are in sync
				await opProcessingController.ensureSynchronized();
				await opProcessingController.pauseProcessing();

				// Make local changes for both collaborators
				prop.setValue(val1);
				sharedPropertyTree2.root.get<Int32Property>("int32Prop")?.setValue(val2);

				sharedPropertyTree1.commit();
				await opProcessingController.ensureSynchronized();
				await opProcessingController.pauseProcessing();

				// This collaborator should still have pending changes after rebase the incoming commits
				expect(
					Object.keys(sharedPropertyTree2.root.getPendingChanges().getSerializedChangeSet())
						.length,
				).to.not.equal(0);

				// Committing the new pending change
				sharedPropertyTree2.commit();
				await opProcessingController.ensureSynchronized();

				// The pending change val2 should be now the new value cross collaborators
				expect(prop.getValue()).to.equal(val2);
			});
		});
	}

	describe("Rebasing", () => {
		beforeEach(async () => {
			await setupContainers();
		});

		rebaseTests();
	});

	describe("Rebasing with reconnection", () => {
		beforeEach(async () => {
			await setupContainers(false);
		});

		rebaseTests();
	});
});
