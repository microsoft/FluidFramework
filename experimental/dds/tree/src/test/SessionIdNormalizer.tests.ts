/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkType } from '@fluid-tools/benchmark';
import { expect } from 'chai';
import Random from 'random-js';
import { assert, fail } from '../Common';
import { isFinalId, isLocalId } from '../id-compressor';
import { SessionIdNormalizer } from '../id-compressor/SessionIdNormalizer';
import { FinalCompressedId, LocalCompressedId, SessionSpaceCompressedId } from '../Identifiers';
import {
	BaseFuzzTestState,
	chain,
	createWeightedGenerator,
	makeRandom,
	performFuzzActions,
	take,
	Generator,
	generatorFromArray,
} from './stochastic-test-utilities';

describe('SessionIdNormalizer', () => {
	it('fails when adding finals with no corresponding locals', () => {
		const normalizer = makeTestNormalizer();
		expect(() => normalizer.addFinalIds(final(0), final(1), undefined)).to.throw(
			'Final IDs must be added to an existing local range.'
		);
	});

	it('fails when adding locals out of order', () => {
		const normalizer = makeTestNormalizer();
		normalizer.addLocalId(local(-1));
		expect(() => normalizer.addLocalId(local(-1))).to.throw('Inserted key must be > all others in the map.');
	});

	it('fails when adding finals out of order', () => {
		const normalizer = makeTestNormalizer();
		normalizer.addLocalId(local(-1));
		expect(() => normalizer.addFinalIds(final(1), final(0), undefined)).to.throw('Malformed normalization range.');
	});

	it('fails when adding non-contiguous locals', () => {
		const normalizer = makeTestNormalizer();
		normalizer.addLocalId(local(-1));
		expect(() => normalizer.addLocalId(local(-3))).to.throw('Local ID space must be contiguous.');
	});

	it('fails when gaps in finals do not align with a local', () => {
		/**
		 * Locals: [-1, -2,  X,  -4]
		 * Finals: [ 0,  1,  2,   5]
		 * Calling `addFinalIds` with first === last === 9 results in the following:
		 * Locals: [-1, -2,  X,  -4,  X]
		 * Finals: [ 0,  1,  2,   5,  9]
		 *                            ^should fail
		 */
		const normalizer = makeTestNormalizer();
		normalizer.addLocalId(local(-1));
		normalizer.addLocalId(local(-2));
		normalizer.addFinalIds(final(0), final(2), undefined);
		normalizer.addLocalId(local(-4));
		normalizer.addFinalIds(final(5), final(5), undefined);
		expect(() => normalizer.addFinalIds(final(9), final(9), undefined)).to.throw(
			'Gaps in final space must align to a local.'
		);
	});

	itWithNormalizer('can normalize IDs with only local forms', (normalizer) => {
		normalizer.addLocalId(local(-1));
		normalizer.addLocalId(local(-2));
		normalizer.addLocalId(local(-3));
		normalizer.addLocalId(local(-4));
	});

	itWithNormalizer('can normalize IDs with trailing finals', (normalizer) => {
		normalizer.addLocalId(local(-1));
		normalizer.addFinalIds(final(0), final(1), undefined);
		normalizer.addFinalIds(final(2), final(3), undefined);
		normalizer.addFinalIds(final(4), final(10), undefined);
	});

	itWithNormalizer('can normalize IDs with trailing locals', (normalizer) => {
		normalizer.addLocalId(local(-1));
		normalizer.addFinalIds(final(0), final(1), undefined);
		normalizer.addLocalId(local(-2));
		normalizer.addLocalId(local(-3));
	});

	itWithNormalizer('can normalize IDs with a gap in final space', (normalizer) => {
		normalizer.addLocalId(local(-1));
		normalizer.addLocalId(local(-2));
		normalizer.addLocalId(local(-3));
		normalizer.addFinalIds(final(0), final(1), undefined);
		normalizer.addFinalIds(final(10), final(11), undefined);
	});

	itWithNormalizer('can normalize IDs with and without corresponding local forms', (normalizer) => {
		normalizer.addLocalId(local(-1));
		normalizer.addLocalId(local(-2));
		normalizer.addLocalId(local(-3));
		normalizer.addFinalIds(final(0), final(3), dummy);
		normalizer.addLocalId(local(-5));
		normalizer.addLocalId(local(-6));
		normalizer.addFinalIds(final(4), final(5), dummy);
		normalizer.addLocalId(local(-7));
		normalizer.addFinalIds(final(8), final(9), dummy);
		normalizer.addLocalId(local(-9));
		normalizer.addFinalIds(final(14), final(15), dummy);
		normalizer.addLocalId(local(-11));
		normalizer.addLocalId(local(-12));
	});

	itWithNormalizer('can get the last final ID', (normalizer) => {
		normalizer.addLocalId(local(-1));
		normalizer.addLocalId(local(-2));
		normalizer.addLocalId(local(-3));
		normalizer.addLocalId(local(-4));
		expect(normalizer.getLastFinalId()).to.be.undefined;
		normalizer.addFinalIds(final(0), final(1), undefined);
		expect(normalizer.getLastFinalId()).to.equal(1);
		normalizer.addFinalIds(final(2), final(2), undefined);
		expect(normalizer.getLastFinalId()).to.equal(2);
		normalizer.addFinalIds(final(10), final(15), undefined);
		expect(normalizer.getLastFinalId()).to.equal(15);
	});

	itWithNormalizer('can normalize IDs after fuzzed inputs', (normalizer) => {
		fuzzNormalizer(normalizer, 1000, 42);
	});
});

describe('SessionIdNormalizer Perf', () => {
	const choiceCount = 1000;
	const type = BenchmarkType.Measurement;
	let normalizer: SessionIdNormalizer<DummyRange>;
	let rand: Random;
	let ids: SessionSpaceCompressedId[];
	let finals: FinalCompressedId[];
	let locals: LocalCompressedId[];
	let localChoices: LocalCompressedId[];
	let finalChoices: FinalCompressedId[];
	const before = () => {
		normalizer = new SessionIdNormalizer();
		rand = fuzzNormalizer(normalizer, 10000, 3.14);
		ids = [...normalizer.getAllIds()];
		locals = ids.filter<LocalCompressedId>((id): id is LocalCompressedId => isLocalId(id));
		finals = ids.filter((id) => isFinalId(id)) as FinalCompressedId[];
		localChoices = [];
		finalChoices = [];
		for (let i = 0; i < choiceCount; i++) {
			localChoices.push(rand.pick(locals));
			finalChoices.push(rand.pick(finals));
		}
	};

	let localChoice = 0;
	benchmark({
		type,
		title: `normalize a local ID to a final ID`,
		before,
		benchmarkFn: () => {
			normalizer.getFinalId(localChoices[localChoice++ % localChoices.length]);
		},
	});

	let finalChoice = 0;
	benchmark({
		type,
		title: `normalize a final ID to session space`,
		before,
		benchmarkFn: () => {
			normalizer.getSessionSpaceId(finalChoices[finalChoice++ % finalChoices.length]);
		},
	});
});

function itWithNormalizer(title: string, itFn: (normalizer: SessionIdNormalizer<DummyRange>) => void): void {
	it(title, () => {
		const locals: (LocalCompressedId | undefined)[] = [];
		const finals: (FinalCompressedId | undefined)[] = [];
		const normalizer: SessionIdNormalizer<DummyRange> = makeNormalizerProxy(makeTestNormalizer(), locals, finals);

		itFn(normalizer);
		const allIds = [...normalizer.getAllIds()];
		let prevLocal: LocalCompressedId | undefined;
		let prevFinal: FinalCompressedId | undefined;
		for (let i = 0; i < locals.length && i < finals.length; i++) {
			const localExpected = locals[i];
			const finalExpected = finals[i];
			// local can be undefined in the case of eager final
			// final can be undefined in the case of trailing locals with no cluster
			// both should never occur
			assert(
				(localExpected !== undefined && isLocalId(localExpected)) ||
					(finalExpected !== undefined && isFinalId(finalExpected)),
				'Test error.'
			);
			if (prevFinal !== undefined && finalExpected !== undefined) {
				assert(finalExpected > prevFinal, 'Test error.');
			}
			if (prevLocal !== undefined && localExpected !== undefined) {
				assert(localExpected < prevLocal, 'Test error.');
			}
			prevLocal = localExpected;
			prevFinal = finalExpected;

			const sessionIdExpected = localExpected === undefined ? finalExpected : localExpected;
			const sessionIdActualAll = allIds[i];
			const sessionIdActualNormalized =
				finalExpected === undefined ? localExpected : normalizer.getSessionSpaceId(finalExpected);

			if (finalExpected !== undefined) {
				const creationIndex = normalizer.getCreationIndex(finalExpected);
				expect(creationIndex).to.equal(i);
			}

			const idByIndex = normalizer.getIdByCreationIndex(i);
			expect(idByIndex).to.equal(localExpected ?? finalExpected);

			if (localExpected !== undefined) {
				const normalized = normalizer.getFinalId(localExpected);
				if (normalized === undefined) {
					expect(finalExpected).to.be.undefined;
				} else {
					const [opIdActualNormalized] = normalized;
					expect(opIdActualNormalized).to.equal(finalExpected);
				}
			}
			expect(sessionIdExpected).to.equal(sessionIdActualAll);
			expect(sessionIdActualAll).to.equal(sessionIdActualNormalized);
		}
		expect(normalizer.getLastFinalId()).to.equal(finals[finals.length - 1]);
		const roundtripped = SessionIdNormalizer.deserialize(normalizer.serialize(), () => undefined);
		expect(roundtripped.equals(normalizer)).to.be.true;
	});
}

function makeNormalizerProxy(
	normalizer: SessionIdNormalizer<DummyRange>,
	locals: (LocalCompressedId | undefined)[],
	finals: (FinalCompressedId | undefined)[]
): SessionIdNormalizer<DummyRange> {
	return new Proxy<SessionIdNormalizer<DummyRange>>(normalizer, {
		get(target, property: keyof SessionIdNormalizer<DummyRange>) {
			if (typeof target[property] === 'function') {
				if (property === 'addLocalId') {
					return new Proxy(target[property], {
						apply: (func, thisArg, argumentsList) => {
							const local: LocalCompressedId = argumentsList[0];
							if (locals.length > 0) {
								for (let i = (locals[locals.length - 1] ?? fail()) - 1; i > local; i--) {
									locals.push(undefined);
								}
							}
							locals.push(local);
							return Reflect.apply(func, thisArg, argumentsList);
						},
					});
				} else if (property === 'addFinalIds') {
					return new Proxy(target[property], {
						apply: (func, thisArg, argumentsList) => {
							const firstFinal: FinalCompressedId = argumentsList[0];
							const lastFinal: FinalCompressedId = argumentsList[1];
							for (let i = firstFinal; i <= lastFinal; i++) {
								finals.push(i);
							}
							return Reflect.apply(func, thisArg, argumentsList);
						},
					});
				}
			}
			return Reflect.get(target, property);
		},
	});
}

type DummyRange = undefined;
const dummy: DummyRange = undefined;

function local(num: number): LocalCompressedId {
	assert(num < 0);
	return num as LocalCompressedId;
}

function final(num: number): FinalCompressedId {
	assert(num >= 0);
	return num as FinalCompressedId;
}

function makeTestNormalizer(): SessionIdNormalizer<DummyRange> {
	return new SessionIdNormalizer<DummyRange>(true);
}

interface AddLocalId {
	type: 'addLocalId';
	id: LocalCompressedId;
}

interface AddFinalIds {
	type: 'addFinalIds';
	first: FinalCompressedId;
	last: FinalCompressedId;
}

type Operation = AddLocalId | AddFinalIds;

interface FuzzTestState extends BaseFuzzTestState {
	normalizer: SessionIdNormalizer<DummyRange>;
	prevWasLocal: boolean;
	currentLocal: number;
	currentFinal: number;
	locals: (LocalCompressedId | undefined)[];
	finals: (FinalCompressedId | undefined)[];
}

function makeOpGenerator(numOperations: number): Generator<Operation, FuzzTestState> {
	function addLocalIdGenerator(state: FuzzTestState): AddLocalId {
		const { locals, finals, random } = state;
		if (locals.length < finals.length && random.bool()) {
			state.currentLocal = -locals.length - (finals.length - locals.length) - 1;
		} else {
			state.currentLocal = -locals.length - 1;
		}
		state.prevWasLocal = true;
		return { type: 'addLocalId', id: local(state.currentLocal) };
	}

	function addFinalIdsGenerator(state: FuzzTestState): AddFinalIds {
		const { locals, finals, random } = state;
		if (state.prevWasLocal && locals.length > finals.length && random.integer(1, 3) === 3) {
			state.currentFinal += random.integer(1, 4);
		}
		const lastFinal = state.currentFinal + random.integer(0, 10);
		const addFinal: AddFinalIds = { type: 'addFinalIds', first: final(state.currentFinal), last: final(lastFinal) };
		state.currentFinal = lastFinal + 1;
		state.prevWasLocal = false;
		return addFinal;
	}

	return chain(
		generatorFromArray([{ type: 'addLocalId', id: local(-1) }]),
		take(
			numOperations - 1,
			createWeightedGenerator<Operation, FuzzTestState>([
				[addLocalIdGenerator, 8],
				[addFinalIdsGenerator, 2],
			])
		)
	);
}

function fuzzNormalizer(
	normalizerToFuzz: SessionIdNormalizer<DummyRange>,
	numOperations: number,
	seed: number
): Random {
	const locals: (LocalCompressedId | undefined)[] = [];
	const finals: (FinalCompressedId | undefined)[] = [];
	const normalizer: SessionIdNormalizer<DummyRange> = makeNormalizerProxy(normalizerToFuzz, locals, finals);

	const initialState: FuzzTestState = {
		random: makeRandom(seed),
		currentLocal: -1,
		currentFinal: 0,
		prevWasLocal: false,
		normalizer,
		locals,
		finals,
	};

	performFuzzActions(
		makeOpGenerator(numOperations),
		{
			addLocalId: (state, { id }) => {
				state.normalizer.addLocalId(id);
				return state;
			},
			addFinalIds: (state, { first, last }) => {
				state.normalizer.addFinalIds(first, last, undefined);
				return state;
			},
		},
		initialState
	);
	return initialState.random;
}
