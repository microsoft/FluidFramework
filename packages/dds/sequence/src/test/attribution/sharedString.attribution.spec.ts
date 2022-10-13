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
import { IChannelServices, Jsonable } from "@fluidframework/datastore-definitions";
import { PropertySet } from "@fluidframework/merge-tree";
import { ISummaryTree } from "@fluidframework/protocol-definitions";
import { SharedString } from "../../sharedString";
import { SharedStringFactory } from "../../sequenceFactory";
import { assertConsistent, Client } from "../intervalUtils";

interface FuzzTestState extends BaseFuzzTestState {
    containerRuntimeFactory: MockContainerRuntimeFactoryForReconnection;
    clients: Client[];
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
): FuzzTestState {
	const numClients = 3;

	const containerRuntimeFactory = new MockContainerRuntimeFactoryForReconnection();
	const initialState: FuzzTestState = {
		clients: Array.from({ length: numClients }, (_, index) => {
			const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: random.uuid4() });
			const sharedString = new SharedString(
				dataStoreRuntime,
				String.fromCharCode(index + 65),
				SharedStringFactory.Attributes,
			);
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
	operations: string;
	attributionlessSnapshot: string;
	propAttributionSnapshot: string;
}

function getDocumentPaths(docName: string): TestPaths {
	mkdirSync(path.join(directory, docName), { recursive: true });
	return {
		operations: path.join(directory, docName, "operations.json"),
		attributionlessSnapshot: path.join(directory, docName, "no-attribution-snap.json"),
		propAttributionSnapshot: path.join(directory, docName, "prop-attribution-snap.json"),
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
	return summary;
};

describe.only("SharedString Attribution", () => {
	/**
	 * This test suite is aimed at assessing the overhead of storing attribution information in a document.
	 * See 'documents/README.md' for more details.
	 *
	 * TODO: Convert test document into one that can be used here
	 */

	it.skip("Generate a new document", async () => {
		const paths = getDocumentPaths("basic");
		const attributionlessGenerator = chain(
			take(100, makeOperationGenerator({ validateInterval })),
			generatorFromArray<Operation, FuzzTestState>([{ type: "synchronize" }]),
		);

		const { generator, operations } = spyOnOperations(attributionlessGenerator);
		const finalState = createSharedString(makeRandom(0), generator);
		const attributionFinalState = createSharedString(
			makeRandom(0),
			generatorFromArray(embedAttributionInProps(operations)),
		);

		writeJson(paths.attributionlessSnapshot, await summaryFromState(finalState));
		writeJson(paths.propAttributionSnapshot, await summaryFromState(attributionFinalState));
		writeJson(paths.operations, operations);
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

			it("attributionless snapshot", async () => {
				const expected = readJson(paths.attributionlessSnapshot);
				const finalState = createSharedString(makeRandom(0), generatorFromArray(operations));
				const actual = await summaryFromState(finalState);
				assert.deepEqual(actual, expected);
			});

			it("prop-embedded attribution snapshot", async () => {
				const expected = readJson(paths.propAttributionSnapshot);
				const finalState = createSharedString(
					makeRandom(0),
					generatorFromArray(embedAttributionInProps(operations)),
				);
				const actual = await summaryFromState(finalState);
				assert.deepEqual(actual, expected);
			});
		});
	}

	// Note: to see output, FLUID_TEST_VERBOSE needs to be enabled. Using the `test:mocha:verbose` script is sufficient
	// to do so.
	it.skip("generate snapshot size impact report", async () => {
		const namePaddingLength = Math.max(...documents.map((docName) => docName.length)) + 1;
		const fieldPaddingLength = 12;
		console.log(`${
			"Name".padEnd(namePaddingLength)
		}|${
			"None ".padStart(fieldPaddingLength)
		}|${
			"Prop ".padStart(fieldPaddingLength)}`,
		);
		const logRow = ({
			docName,
			attributionlessSummary,
			propAttributionSummary,
		}: { docName: string; attributionlessSummary: ISummaryTree; propAttributionSummary: ISummaryTree; }) => {
			const getLength = (summary: ISummaryTree) => formatNumber(JSON.stringify(summary).length);
			console.log(`${
				docName.padEnd(namePaddingLength)
			}|${
				getLength(attributionlessSummary).padStart(fieldPaddingLength - 1)
			} |${
				getLength(propAttributionSummary).padStart(fieldPaddingLength - 1)
			}`);
		};
		for (const docName of documents) {
			const paths = getDocumentPaths(docName);
			const operations: Operation[] = readJson(paths.operations);
			const attributionlessSummary = await summaryFromState(
				createSharedString(makeRandom(0), generatorFromArray(operations)),
			);
			const propAttributionSummary = await summaryFromState(
				createSharedString(makeRandom(0), generatorFromArray(embedAttributionInProps(operations))),
			);
			logRow({ docName, attributionlessSummary, propAttributionSummary });
		}
	});
});
