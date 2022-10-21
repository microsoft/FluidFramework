/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "fs";
import { strict as assert } from "assert";
import {
    AcceptanceCondition,
    BaseFuzzTestState,
    chain,
    createWeightedGenerator,
    done,
    Generator,
    generatorFromArray,
    interleave,
    IRandom,
    makeRandom,
    performFuzzActions,
    Reducer,
    take,
} from "@fluid-internal/stochastic-test-utils";
import {
    MockFluidDataStoreRuntime,
    MockStorage,
	MockContainerRuntimeFactoryForReconnection,
} from "@fluidframework/test-runtime-utils";
import { IAttributor, Attributor, gzipEncoder } from "@fluidframework/attributor';
import { IChannelServices, IFluidDataStoreRuntime, Jsonable } from "@fluidframework/datastore-definitions";
import { PropertySet } from "@fluidframework/merge-tree";
import { IClient } from "@fluidframework/protocol-definitions";
import { IAudience } from "@fluidframework/container-definitions";
import { ISequencedDocumentMessage, ISummaryTree } from "@fluidframework/protocol-definitions";
import { SharedString } from "../../sharedString";
import { SharedStringFactory } from "../../sequenceFactory";
import { assertConsistent, Client } from "../intervalUtils";


function makeMockAudience(clientIds: string[]): IAudience {
	const clients = new Map<string, IClient>();
	clientIds.forEach((clientId, index) => {
		const stringId = String.fromCharCode(index + 65);
		const name = stringId.repeat(10);
		const userId = `${name}@microsoft.com`;
		const email = userId;
		const user = {
			id: userId,
			name,
			email
		};
		clients.set(clientId, { 
			mode: "write",
			details: { capabilities: { interactive: true } },
			permission: [],
			user,
			scopes: []		
		});
	});
	return {
		getMember: (clientId: string): IClient | undefined => {
			return clients.get(clientId);
		}
	} as IAudience
}

interface FuzzTestState extends BaseFuzzTestState {
    containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
    clients: Client[];
	// Note: eventually each client will have an Attributor. While design/implementation is in flux, this test suite
	// just stores a singleton attributor for the purposes of assessing its size.
	attributor?: IAttributor;
}

interface ClientSpec {
    stringId: string;
}

interface RangeSpec {
    start: number;
    end: number;
}

interface AddText extends ClientSpec {
    type: "addText";
    index: number;
    content: string;
	props?: PropertySet;
}

interface RemoveRange extends ClientSpec, RangeSpec {
    type: "removeRange";
}

interface AnnotateRange extends ClientSpec, RangeSpec {
    type: "annotateRange";
    properties: PropertySet;
}

interface Synchronize {
    type: "synchronize";
}

type TextOperation = AddText | RemoveRange | AnnotateRange;

type Operation = TextOperation | Synchronize;

interface OperationGenerationConfig {
    /**
     * Maximum length of the SharedString (locally) before no further AddText operations are generated.
     * Note due to concurency, during test execution the actual length of the string may exceed this.
     */
    maxStringLength?: number;
    /**
     * Maximum number of intervals (locally) before no further AddInterval operations are generated.
     * Note due to concurency, during test execution the actual number of intervals may exceed this.
     */
    maxIntervals?: number;
    maxInsertLength?: number;
    propertyNamePool?: string[];
    validateInterval?: number;
}

const defaultOptions: Required<OperationGenerationConfig> = {
    maxStringLength: 1000,
    maxIntervals: 100,
    maxInsertLength: 10,
    propertyNamePool: ["prop1", "prop2", "prop3"],
    validateInterval: 100,
};

function makeOperationGenerator(optionsParam?: OperationGenerationConfig): Generator<Operation, FuzzTestState> {
    const options = { ...defaultOptions, ...(optionsParam ?? {}) };
    type ClientOpState = FuzzTestState & { sharedString: SharedString; };

    // All subsequent helper functions are generators; note that they don't actually apply any operations.
    function startPosition({ random, sharedString }: ClientOpState): number {
        return random.integer(0, Math.max(0, sharedString.getLength() - 1));
    }

    function exclusiveRange(state: ClientOpState): RangeSpec {
        const start = startPosition(state);
        const end = state.random.integer(start + 1, state.sharedString.getLength());
        return { start, end };
    }

    function propertySet(state: ClientOpState): PropertySet {
        const propNamesShuffled = [...options.propertyNamePool];
        state.random.shuffle(propNamesShuffled);
        const propsToChange = propNamesShuffled.slice(0, state.random.integer(1, propNamesShuffled.length));
        const propSet: PropertySet = {};
        for (const name of propsToChange) {
            propSet[name] = state.random.string(5);
        }
        return propSet;
    }

    function addText(state: ClientOpState): AddText {
        const { random, sharedString } = state;
        return {
            type: "addText",
            index: random.integer(0, sharedString.getLength()),
            content: random.string(random.integer(0, options.maxInsertLength)),
            stringId: sharedString.id,
			props: random.bool(0.1) ? propertySet(state) : undefined,
        };
    }

    function removeRange(state: ClientOpState): RemoveRange {
        return { type: "removeRange", ...exclusiveRange(state), stringId: state.sharedString.id };
    }

    function annotateRange(state: ClientOpState): AnnotateRange {
        return {
            type: "annotateRange",
			...exclusiveRange(state),
            properties: propertySet(state),
            stringId: state.sharedString.id,
        };
    }

    const lengthSatisfies = (criteria: (length: number) => boolean): AcceptanceCondition<ClientOpState> =>
        ({ sharedString }) => criteria(sharedString.getLength());
    const hasNonzeroLength = lengthSatisfies((length) => length > 0);
    const isShorterThanMaxLength = lengthSatisfies((length) => length < options.maxStringLength);

    const clientBaseOperationGenerator = createWeightedGenerator<Operation, ClientOpState>([
        [addText, 6, isShorterThanMaxLength],
        [removeRange, 2, hasNonzeroLength],
		[annotateRange, 1, hasNonzeroLength],
    ]);

    const clientOperationGenerator = (state: FuzzTestState) =>
        clientBaseOperationGenerator({ ...state, sharedString: state.random.pick(state.clients).sharedString });

    return interleave(
        clientOperationGenerator,
        () => ({ type: "synchronize" }),
        options.validateInterval,
    );
}

function createSharedString(
	random: IRandom,
	generator: Generator<Operation, FuzzTestState>,
	makeAttributor?: (runtime: IFluidDataStoreRuntime) => IAttributor
): FuzzTestState {
	const numClients = 3;
	const clientIds = Array.from({ length: numClients }, () => random.uuid4());
	const audience = makeMockAudience(clientIds);
	const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
	let attributor: IAttributor | undefined;
	const initialState: FuzzTestState = {
		clients: clientIds.map((clientId, index) => {
			const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId });
			const { deltaManager } = dataStoreRuntime;
			deltaManager.inbound.processCallback = (op) => { deltaManager.emit("op", op); }
			if (index === 0) {
				attributor = makeAttributor?.(dataStoreRuntime);
			}
			const sharedString = new SharedString(
				dataStoreRuntime,
				String.fromCharCode(index + 65),
				SharedStringFactory.Attributes,
			);
			// DeltaManager mock doesn't have high fidelity but attribution requires DataStoreRuntime implements
			// audience / op emission.
			sharedString.on("op", (message) => {
				if (message.timestamp === undefined) {
					// TODO: Make this apples-to-apples comparison of timestamps.
					message.timestamp = Date.now();
				}
				deltaManager.emit("op", message)
			});
			dataStoreRuntime.getAudience = () => audience;
			
			const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
			const services: IChannelServices = {
				deltaConnection: containerRuntime.createDeltaConnection(),
				objectStorage: new MockStorage(),
			};

			sharedString.initializeLocal();
			sharedString.connect(services);
			return { containerRuntime, sharedString };
		}),
		containerRuntimeFactory,
		random,
	};
	initialState.attributor = attributor;

    // Small wrapper to avoid having to return the same state repeatedly; all operations in this suite mutate.
    // Also a reasonable point to inject logging of incremental state.
    const statefully =
        <T>(statefulReducer: (state: FuzzTestState, operation: T) => void): Reducer<T, FuzzTestState> =>
            (state, operation) => {
                statefulReducer(state, operation);
                return state;
            };

    return performFuzzActions(
        generator,
        {
            addText: statefully(({ clients }, { stringId, index, content, props }) => {
                const { sharedString } = clients.find((c) => c.sharedString.id === stringId) ?? {};
                assert(sharedString);
                sharedString.insertText(index, content, props);
            }),
            removeRange: statefully(({ clients }, { stringId, start, end }) => {
                const { sharedString } = clients.find((c) => c.sharedString.id === stringId) ?? {};
                assert(sharedString);
                sharedString.removeRange(start, end);
            }),
            annotateRange: statefully(({ clients }, { stringId, properties, start, end }) => {
				const { sharedString } = clients.find((c) => c.sharedString.id === stringId) ?? {};
                assert(sharedString);
				sharedString.annotateRange(start, end, properties);
            }),
			synchronize: statefully((state) => {
				state.containerRuntimeFactory.processAllMessages();
				assertConsistent(state.clients);
			}),
        },
        initialState,
    );
}

const directory = path.join(__dirname, "../../../src/test/attribution/documents");

interface TestPaths {
	directory: string;
	operations: string;
}

function getDocumentPaths(docName: string): TestPaths {
	mkdirSync(path.join(directory, docName), { recursive: true });
	return {
		directory: path.join(directory, docName),
		operations: path.join(directory, docName, "operations.json"),
	};
}

function getDocuments(): string[] {
	return readdirSync(directory).filter((name) => name !== "README.md");
}

// Format a number separating 3 digits by comma
// eslint-disable-next-line unicorn/no-unsafe-regex
const formatNumber = (num: number): string => num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

function spyOnOperations(
	baseGenerator: Generator<Operation, FuzzTestState>,
): { generator: Generator<Operation, FuzzTestState>; operations: Operation[]; } {
	const operations: Operation[] = [];
	const generator = (state: FuzzTestState) => {
		const operation = baseGenerator(state);
		if (operation !== done) {
			operations.push(operation);
		}
		return operation;
	};
	return { operations, generator };
}

function readJson(filepath: string): Jsonable {
	return JSON.parse(readFileSync(filepath, { encoding: "utf-8" }));
}

function writeJson(filepath: string, content: Jsonable) {
	writeFileSync(filepath, JSON.stringify(content, undefined, 4), { encoding: "utf-8" });
}

const validateInterval = 10;

function embedAttributionInProps(operations: Operation[]): Operation[] {
	// This is an arbitrary start point of the same magnitude as current data.
	// Wed Oct 12 2022 11:40:00 GMT-0700
	const baseDate = 1665600000000;
	return operations.map((operation, index) => {
		if (operation.type !== "addText") {
			return operation;
		} else {
			const timestamp = baseDate + Math.floor(index / validateInterval) * 5000;
			const name = operation.stringId.repeat(10);
			const id = `${name}@microsoft.com`;
			const email = id;
			const props = {
				attribution: {
					id,
					name,
					email,
					timestamp,
				},
			};
			return {
				...operation,
				props,
			};
		}
	});
}

const summaryFromState = async (state: FuzzTestState): Promise<ISummaryTree> => {
	const { sharedString } = state.clients[0];
	const { summary } = await sharedString.summarize();
	// KLUDGE: For now, since attribution info isn't embedded at a proper location in the summary tree, just add a property
	// to the root so that its size is reported
	if (state.attributor) {
		(summary as any).attribution = state.attributor.serialize();
	}
	return summary;
};

const noopEncoder = {
	encode: x => x,
	decode: x => x
};

describe("SharedString Attribution", () => {
	// Entries of this list produce documents which should contain the same attribution information but
	// stored in different formats. The "None" factory is an exception in that it contains no attribution
	// information, and is useful as a baseline for comparison.
	const dataGenerators: {
		name: string;
		factory: (operations: Operation[]) => FuzzTestState;
		filename: string;
	}[] = [
		{ 
			name: "None",
			factory: (operations: Operation[]) => createSharedString(
				makeRandom(0),
				generatorFromArray(operations),
			),
			filename: "no-attribution-snap.json"
		},
		{ 
			name: "Prop",
			factory: (operations: Operation[]) => createSharedString(
				makeRandom(0),
				generatorFromArray(embedAttributionInProps(operations)),
			),
			filename: "prop-attribution-snap.json"
		},
		{ 
			name: "Attributor without any compression",
			factory: (operations: Operation[]) => createSharedString(
				makeRandom(0),
				generatorFromArray(operations), (runtime) => new Attributor(runtime, undefined, { summary: noopEncoder, timestamps: noopEncoder }),
			),
			filename: "compressed-attribution-snap.json"
		},
		{ 
			name: "Attributor without delta encoding",
			factory: (operations: Operation[]) => createSharedString(
				makeRandom(0),
				generatorFromArray(operations), (runtime) => new Attributor(runtime, undefined, { summary: gzipEncoder, timestamps: noopEncoder }),
			),
			filename: "compressed-attribution-snap.json"
		},
		{ 
			name: "Attributor",
			factory: (operations: Operation[]) => createSharedString(
				makeRandom(0),
				generatorFromArray(operations), (runtime) => new Attributor(runtime),
			),
			filename: "compressed-attribution-snap.json"
		},
	]

	/**
	 * This test suite is aimed at assessing the overhead of storing attribution information in a document.
	 * See 'documents/README.md' for more details.
	 *
	 * TODO: Convert test document into one that can be used here
	 */

	describe("using randomly generated documents", () => {

		it.skip("Generate a new document", async () => {
			const paths = getDocumentPaths("basic");
			const attributionlessGenerator = chain(
				take(100, makeOperationGenerator({ validateInterval })),
				generatorFromArray<Operation, FuzzTestState>([{ type: "synchronize" }]),
			);
	
			const { generator, operations } = spyOnOperations(attributionlessGenerator);
			createSharedString(makeRandom(0), generator);
			writeJson(paths.operations, operations);
	
			await Promise.all(
				dataGenerators.map(async ({ filename, factory }) => {
					const summary = await summaryFromState(factory(operations));
					writeJson(path.join(paths.directory, filename), summary);
				})
			)
		});
	
		const documents = getDocuments();
		for (const document of documents) {
			describe(`document name: ${document} has up-to-date`, () => {
				let paths: TestPaths;
				let operations: Operation[];
				before(() => {
					paths = getDocumentPaths(document);
					operations = readJson(paths.operations);
				});
	
				for (const { filename, factory } of dataGenerators) {
					it(`Snapshot at ${filename}`, async () => {
						const expected = readJson(path.join(paths.directory, filename));
						const actual = await summaryFromState(factory(operations));
						assert.deepEqual(actual, expected);
					});
				}
			});
		}
	
		// Note: to see output, FLUID_TEST_VERBOSE needs to be enabled. Using the `test:mocha:verbose` script is sufficient
		// to do so.
		it("generate snapshot size impact report", async () => {
			const namePaddingLength = Math.max(...documents.map((docName) => docName.length)) + 1;
			const fieldPaddingLength = 12;
			console.log(
				[
					`${"Name".padEnd(namePaddingLength)}`,
					...dataGenerators.map(({ name }) => `${name} `.padStart(fieldPaddingLength))
				].join("|")
			);
	
			const logRow = ({
				docName,
				data
			}: { docName: string; data: ISummaryTree[] }) => {
				const getLength = (summary: ISummaryTree) => formatNumber(JSON.stringify(summary).length);
				console.log(`${
					docName.padEnd(namePaddingLength)
				}|${
					data
						.map((summary, i) => getLength(summary).padStart(
							Math.max(fieldPaddingLength - 1, dataGenerators[i].name.length)
						))
						.join(' |')
				}`);
			};
	
			for (const docName of documents) {
				const paths = getDocumentPaths(docName);
				const operations: Operation[] = readJson(paths.operations);
				const data = await Promise.all(
					dataGenerators.map(({ factory }) => summaryFromState(factory(operations)))
				);
				logRow({ docName, data });
			}
		});
	});

	describe("using sample real documents", () => {
		class MockContainerRuntimeFactoryForReplay extends MockContainerRuntimeFactoryForReconnection {
			public processOneMessage() {
				if (this.messages.length === 0) {
					throw new Error("Tried to process a message that did not exist");
				}
		
				let msg = this.messages.shift();
				// Explicitly JSON clone the value to match the behavior of going thru the wire.
				msg = JSON.parse(JSON.stringify(msg)) as ISequencedDocumentMessage;
		
				for (const runtime of this.runtimes) {
					runtime.process(msg);
				}
			}			
		}

		const messages: any[] = readJson(path.join(__dirname, "../../../src/test/attribution/messages.json"));
		const documents = ["fhl-demos"];
		const dataGenerators: {
			name: string;
			factory: (messages: ISequencedDocumentMessage[]) => FuzzTestState;
			filename: string;
		}[] = [
			{ 
				name: "None",
				factory: (messages: ISequencedDocumentMessage[]) => {
					const random = makeRandom(0);
					const clientId = random.uuid4();
					const containerRuntimeFactory = new MockContainerRuntimeFactoryForReplay();
					const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId });
					// const { deltaManager } = dataStoreRuntime;
					// deltaManager.inbound.processCallback = (op) => { deltaManager.emit("op", op); }
					// if (index === 0) {
					// 	attributor = makeAttributor?.(dataStoreRuntime);
					// }
					const sharedString = new SharedString(
						dataStoreRuntime,
						"mock observer client",
						SharedStringFactory.Attributes,
					);
					// // DeltaManager mock doesn't have high fidelity but attribution requires DataStoreRuntime implements
					// // audience / op emission.
					// sharedString.on("op", (message) => {
					// 	if (message.timestamp === undefined) {
					// 		// TODO: Make this apples-to-apples comparison of timestamps.
					// 		message.timestamp = Date.now();
					// 	}
					// 	deltaManager.emit("op", message)
					// });
					// dataStoreRuntime.getAudience = () => audience;
					
					const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
					const services: IChannelServices = {
						deltaConnection: containerRuntime.createDeltaConnection(),
						objectStorage: new MockStorage(),
					};
		
					sharedString.initializeLocal();
					sharedString.connect(services);

					for (const message of messages) {
						const mergeTreeMessage = extractMergeTreeOp(message);
						if (mergeTreeMessage) {
							containerRuntimeFactory.pushMessage(stripAttributionInfo(message));
							containerRuntimeFactory.processOneMessage();
						}
					}

					return { containerRuntimeFactory, clients: [{ sharedString, containerRuntime }], random };
				},
				filename: "no-attribution-snap.json"
			},
			{ 
				name: "Prop",
				factory: (messages: ISequencedDocumentMessage[]) => {
					const random = makeRandom(0);
					const clientId = random.uuid4();
					const containerRuntimeFactory = new MockContainerRuntimeFactoryForReplay();
					const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId });
					// const { deltaManager } = dataStoreRuntime;
					// deltaManager.inbound.processCallback = (op) => { deltaManager.emit("op", op); }
					// if (index === 0) {
					// 	attributor = makeAttributor?.(dataStoreRuntime);
					// }
					const sharedString = new SharedString(
						dataStoreRuntime,
						"mock observer client",
						SharedStringFactory.Attributes,
					);
					// // DeltaManager mock doesn't have high fidelity but attribution requires DataStoreRuntime implements
					// // audience / op emission.
					// sharedString.on("op", (message) => {
					// 	if (message.timestamp === undefined) {
					// 		// TODO: Make this apples-to-apples comparison of timestamps.
					// 		message.timestamp = Date.now();
					// 	}
					// 	deltaManager.emit("op", message)
					// });
					// dataStoreRuntime.getAudience = () => audience;
					
					const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
					const services: IChannelServices = {
						deltaConnection: containerRuntime.createDeltaConnection(),
						objectStorage: new MockStorage(),
					};
		
					sharedString.initializeLocal();
					sharedString.connect(services);

					for (const message of messages) {
						const mergeTreeMessage = extractMergeTreeOp(message);
						if (mergeTreeMessage) {
							containerRuntimeFactory.pushMessage(message);
							containerRuntimeFactory.processOneMessage();
						}
					}
	
					// const initialState: FuzzTestState = {
					// 	clients: clientIds.map((clientId, index) => {
					// 		const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId });
					// 		const { deltaManager } = dataStoreRuntime;
					// 		deltaManager.inbound.processCallback = (op) => { deltaManager.emit("op", op); }
					// 		// if (index === 0) {
					// 		// 	attributor = makeAttributor?.(dataStoreRuntime);
					// 		// }
					// 		const sharedString = new SharedString(
					// 			dataStoreRuntime,
					// 			String.fromCharCode(index + 65),
					// 			SharedStringFactory.Attributes,
					// 		);
					// 		// DeltaManager mock doesn't have high fidelity but attribution requires DataStoreRuntime implements
					// 		// audience / op emission.
					// 		sharedString.on("op", (message) => {
					// 			if (message.timestamp === undefined) {
					// 				// TODO: Make this apples-to-apples comparison of timestamps.
					// 				message.timestamp = Date.now();
					// 			}
					// 			deltaManager.emit("op", message)
					// 		});
					// 		dataStoreRuntime.getAudience = () => audience;
							
					// 		const containerRuntime = containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
					// 		const services: IChannelServices = {
					// 			deltaConnection: containerRuntime.createDeltaConnection(),
					// 			objectStorage: new MockStorage(),
					// 		};
				
					// 		sharedString.initializeLocal();
					// 		sharedString.connect(services);
					// 		return { containerRuntime, sharedString };
					// 	}),
					// 	containerRuntimeFactory,
					// 	random,
					// };
					// initialState.attributor = attributor;
					return { containerRuntimeFactory, clients: [{ sharedString, containerRuntime }], random };
				},
				filename: "prop-attribution-snap.json"
			}
		]

		// Note: to see output, FLUID_TEST_VERBOSE needs to be enabled. Using the `test:mocha:verbose` script is sufficient
		// to do so.
		it("generate snapshot size impact report", async () => {
			const namePaddingLength = Math.max(...documents.map((docName) => docName.length)) + 1;
			const fieldPaddingLength = 12;
			console.log(
				[
					`${"Name".padEnd(namePaddingLength)}`,
					...dataGenerators.map(({ name }) => `${name} `.padStart(fieldPaddingLength))
				].join("|")
			);
	
			const logRow = ({
				docName,
				data
			}: { docName: string; data: ISummaryTree[] }) => {
				const getLength = (summary: ISummaryTree) => formatNumber(JSON.stringify(summary).length);
				console.log(`${
					docName.padEnd(namePaddingLength)
				}|${
					data
						.map((summary, i) => getLength(summary).padStart(
							Math.max(fieldPaddingLength - 1, dataGenerators[i].name.length)
						))
						.join(' |')
				}`);
			};
	
			// TODO: This should look more like operations above. should be able to unify.
			for (const docName of documents) {
				const data = await Promise.all(
					dataGenerators.map(({ factory }) => summaryFromState(factory(messages)))
				);
				logRow({ docName, data });
			}
		});
	});
});

function extractMergeTreeOp(originalMessage: ISequencedDocumentMessage): ISequencedDocumentMessage | undefined {
	const messageClone = JSON.parse(JSON.stringify(originalMessage));
	let mergeTreeOpContents = messageClone;
	while (mergeTreeOpContents && typeof mergeTreeOpContents.type !== 'number') {
		mergeTreeOpContents = mergeTreeOpContents.contents ?? mergeTreeOpContents.content;
	}

	if (mergeTreeOpContents && typeof mergeTreeOpContents.type === 'number') {
		messageClone.contents = mergeTreeOpContents;
		return messageClone;
	}

	return undefined;
}

function stripAttributionInfo(originalMessage: any) {
	const messageClone = JSON.parse(JSON.stringify(originalMessage));
	let mergeTreeOpContents = messageClone;
	while (mergeTreeOpContents && mergeTreeOpContents.seg === undefined) {
		mergeTreeOpContents = mergeTreeOpContents.contents ?? mergeTreeOpContents.content;
	}

	const props = mergeTreeOpContents?.seg?.props;
	if (props) {
		delete props.attribution;
		if (Object.keys(props).length === 0) {
			delete mergeTreeOpContents.seg.props;
		}
	}

	return messageClone;
}