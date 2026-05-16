/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
import * as path from "node:path";

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	type Generator,
	createWeightedAsyncGenerator,
	done,
	takeAsync,
} from "@fluid-private/stochastic-test-utils";
import {
	type DDSFuzzHarnessEvents,
	type SquashFuzzModel,
	type SquashFuzzTestState,
	createSquashFuzzSuite,
} from "@fluid-private/test-dds-utils";
import { isFluidHandle } from "@fluidframework/runtime-utils/internal";

import { DirectoryFactory, type IDirectory } from "../../index.js";

import { _dirname } from "./dirname.cjs";

interface DirSetPoisonedKey {
	type: "setPoisonedKey";
	path: string;
	key: string;
}

interface DirSetKey {
	type: "setKey";
	path: string;
	key: string;
	value: string | number;
}

interface DirDeleteKey {
	type: "deleteKey";
	path: string;
	key: string;
}

interface DirClear {
	type: "clear";
	path: string;
}

interface DirCreateSub {
	type: "createSub";
	parentPath: string;
	name: string;
}

interface DirDeleteSub {
	type: "deleteSub";
	parentPath: string;
	name: string;
}

type SquashOp =
	| DirSetPoisonedKey
	| DirSetKey
	| DirDeleteKey
	| DirClear
	| DirCreateSub
	| DirDeleteSub;

type SquashFactory = DirectoryFactory;
type FuzzState = SquashFuzzTestState<SquashFactory>;

const keyPool = ["k0", "k1", "k2"];
const subdirPool = ["s0", "s1", "s2"];

function isPoisonedHandle(value: unknown): boolean {
	return (
		isFluidHandle(value) &&
		(value as unknown as { poisoned?: unknown }).poisoned === true
	);
}

function pickExistingPath(state: FuzzState): string {
	const { random, client } = state;
	let cur: IDirectory = client.channel;
	for (;;) {
		const subs: IDirectory[] = [];
		for (const [, sub] of cur.subdirectories()) {
			subs.push(sub);
		}
		const choice = random.pick<IDirectory | undefined>([undefined, ...subs]);
		if (choice === undefined) {
			return cur.absolutePath;
		}
		cur = choice;
	}
}

function makeGenerator(): (state: FuzzState) => Promise<SquashOp | typeof done> {
	const isInStaging = (state: FuzzState): boolean =>
		state.client.stagingModeStatus === "staging";

	const setKey = async (state: FuzzState): Promise<DirSetKey> => ({
		type: "setKey",
		path: pickExistingPath(state),
		key: state.random.pick(keyPool),
		value: state.random.pick([
			(): string => state.random.string(state.random.integer(1, 4)),
			(): number => state.random.integer(0, 100),
		])(),
	});

	const setPoisoned = async (state: FuzzState): Promise<DirSetPoisonedKey> => ({
		type: "setPoisonedKey",
		path: pickExistingPath(state),
		key: state.random.pick(keyPool),
	});

	const deleteKey = async (state: FuzzState): Promise<DirDeleteKey> => ({
		type: "deleteKey",
		path: pickExistingPath(state),
		key: state.random.pick(keyPool),
	});

	const clear = async (state: FuzzState): Promise<DirClear> => ({
		type: "clear",
		path: pickExistingPath(state),
	});

	const createSub = async (state: FuzzState): Promise<DirCreateSub> => ({
		type: "createSub",
		parentPath: pickExistingPath(state),
		name: state.random.pick(subdirPool),
	});

	const deleteSub = async (state: FuzzState): Promise<DirDeleteSub> => ({
		type: "deleteSub",
		parentPath: pickExistingPath(state),
		name: state.random.pick(subdirPool),
	});

	return createWeightedAsyncGenerator<SquashOp, FuzzState>([
		[setKey, 6],
		[setPoisoned, 4, isInStaging],
		[deleteKey, 3],
		[clear, 1],
		[createSub, 3],
		[deleteSub, 2],
	]);
}

function findFirstPoisoned(
	dir: IDirectory,
): { path: string; key: string } | undefined {
	for (const [key, value] of dir.entries()) {
		if (isPoisonedHandle(value)) {
			return { path: dir.absolutePath, key };
		}
	}
	for (const [, sub] of dir.subdirectories()) {
		const found = findFirstPoisoned(sub);
		if (found !== undefined) {
			return found;
		}
	}
	return undefined;
}

function makeExitingGenerator(): Generator<SquashOp, FuzzState> {
	return (state): SquashOp | typeof done => {
		const found = findFirstPoisoned(state.client.channel);
		if (found === undefined) {
			return done;
		}
		return { type: "deleteKey", path: found.path, key: found.key };
	};
}

function reducer(state: FuzzState, op: SquashOp): void {
	const { client } = state;
	const root = client.channel;
	switch (op.type) {
		case "setKey": {
			const dir = root.getWorkingDirectory(op.path);
			if (dir !== undefined) {
				dir.set(op.key, op.value);
			}
			break;
		}
		case "setPoisonedKey": {
			const dir = root.getWorkingDirectory(op.path);
			if (dir !== undefined) {
				dir.set(op.key, state.random.poisonedHandle());
			}
			break;
		}
		case "deleteKey": {
			const dir = root.getWorkingDirectory(op.path);
			if (dir !== undefined) {
				dir.delete(op.key);
			}
			break;
		}
		case "clear": {
			const dir = root.getWorkingDirectory(op.path);
			if (dir !== undefined) {
				dir.clear();
			}
			break;
		}
		case "createSub": {
			const parent = root.getWorkingDirectory(op.parentPath);
			if (parent !== undefined) {
				parent.createSubDirectory(op.name);
			}
			break;
		}
		case "deleteSub": {
			const parent = root.getWorkingDirectory(op.parentPath);
			if (parent?.hasSubDirectory(op.name) === true) {
				parent.deleteSubDirectory(op.name);
			}
			break;
		}
		default: {
			break;
		}
	}
}

function assertNoPoisonContent(dir: IDirectory): void {
	for (const [key, value] of dir.entries()) {
		assert(
			!isPoisonedHandle(value),
			`Poisoned handle at ${dir.absolutePath}/${key} not removed before exiting staging`,
		);
	}
	for (const [, sub] of dir.subdirectories()) {
		assertNoPoisonContent(sub);
	}
}

const squashModel: SquashFuzzModel<SquashFactory, SquashOp> = {
	workloadName: "directory squashing",
	generatorFactory: () => takeAsync(60, makeGenerator()),
	reducer,
	validateConsistency: async (a, b) => {
		const compare = (da: IDirectory, db: IDirectory): void => {
			assert.equal(da.size, db.size);
			for (const [key, vA] of da.entries()) {
				const vB: unknown = db.get(key);
				if (isFluidHandle(vA)) {
					assert(isFluidHandle(vB));
				} else {
					assert.equal(vA, vB);
				}
			}
			const subsA: string[] = [];
			const subsB: string[] = [];
			for (const [n] of da.subdirectories()) subsA.push(n);
			for (const [n] of db.subdirectories()) subsB.push(n);
			subsA.sort();
			subsB.sort();
			assert.deepEqual(subsA, subsB);
			for (const name of subsA) {
				const subA = da.getSubDirectory(name);
				const subB = db.getSubDirectory(name);
				assert(subA !== undefined && subB !== undefined);
				compare(subA, subB);
			}
		};
		compare(a.channel, b.channel);
	},
	factory: new DirectoryFactory(),
	exitingStagingModeGeneratorFactory: makeExitingGenerator,
	validatePoisonedContentRemoved: (client) => assertNoPoisonContent(client.channel),
};

const emitter = new TypedEventEmitter<DDSFuzzHarnessEvents>();

describe("SharedDirectory squash fuzz", () => {
	createSquashFuzzSuite(squashModel, {
		validationStrategy: { type: "fixedInterval", interval: 10 },
		reconnectProbability: 0.1,
		numberOfClients: 3,
		clientJoinOptions: {
			maxNumberOfClients: 4,
			clientAddProbability: 0.05,
		},
		detachedStartOptions: { numOpsBeforeAttach: 0 },
		defaultTestCount: 50,
		saveFailures: { directory: path.join(_dirname, "../../src/test/results-squash-dir") },
		emitter,
		stagingMode: { changeStagingModeProbability: 0.15 },
	});
});
