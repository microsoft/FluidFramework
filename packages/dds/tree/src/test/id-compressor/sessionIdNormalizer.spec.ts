/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { validateAssertionError } from "@fluidframework/test-runtime-utils";
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import {
    BaseFuzzTestState,
    chain,
    createWeightedGenerator,
    Generator,
    generatorFromArray,
    IRandom,
    performFuzzActions,
    take,
    makeRandom,
} from "@fluid-internal/stochastic-test-utils";
import {
    isFinalId,
    isLocalId,
    SessionIdNormalizer,
    FinalCompressedId,
    LocalCompressedId,
    SessionSpaceCompressedId,
} from "../../id-compressor";
import { fail } from "../../util";

describe("SessionIdNormalizer", () => {
    it("fails when adding finals with no corresponding locals", () => {
        const normalizer = makeTestNormalizer();
        assert.throws(
            () => normalizer.addFinalIds(final(0), final(1), undefined),
            (e) => validateAssertionError(e, "Final IDs must be added to an existing local range."),
        );
    });

    it("fails when adding finals out of order", () => {
        const normalizer = makeTestNormalizer();
        normalizer.addLocalId();
        assert.throws(
            () => normalizer.addFinalIds(final(1), final(0), undefined),
            (e) => validateAssertionError(e, "Malformed normalization range."),
        );
    });

    it("fails when gaps in finals do not align with a local", () => {
        /**
         * Locals: [-1, -2,  X,  -4]
         * Finals: [ 0,  1,  2,   5]
         * Calling `addFinalIds` with first === last === 9 results in the following:
         * Locals: [-1, -2,  X,  -4,  X]
         * Finals: [ 0,  1,  2,   5,  9]
         *
         * ^should fail
         */
        const normalizer = makeTestNormalizer();
        normalizer.addLocalId(); // -1
        normalizer.addLocalId(); // -2
        normalizer.addFinalIds(final(0), final(2), undefined);
        normalizer.addLocalId(); // -4
        normalizer.addFinalIds(final(5), final(5), undefined);
        assert.throws(
            () => normalizer.addFinalIds(final(9), final(9), undefined),
            (e) => validateAssertionError(e, "Gaps in final space must align to a local."),
        );
    });

    it("fails when attempting to normalize a local ID that was never registered", () => {
        const normalizer = makeTestNormalizer();
        assert.throws(
            () => normalizer.getFinalId(-1 as LocalCompressedId),
            (e) => validateAssertionError(e, "Local ID was never recorded with this normalizer."),
        );
        const local = normalizer.addLocalId();
        const secondLocal = (local - 1) as LocalCompressedId;
        assert.throws(
            () => normalizer.getFinalId(secondLocal),
            (e) => validateAssertionError(e, "Local ID was never recorded with this normalizer."),
        );
        normalizer.addFinalIds(final(0), final(5), undefined);
        assert.throws(
            () => normalizer.getFinalId(secondLocal),
            (e) => validateAssertionError(e, "Local ID was never recorded with this normalizer."),
        );
    });

    itWithNormalizer("can normalize IDs with only local forms", (normalizer) => {
        const local1 = normalizer.addLocalId();
        const local2 = normalizer.addLocalId();
        const local3 = normalizer.addLocalId();
        const local4 = normalizer.addLocalId();
        assert.equal(local1, -1);
        assert.equal(local2, -2);
        assert.equal(local3, -3);
        assert.equal(local4, -4);
    });

    itWithNormalizer("can normalize IDs with trailing finals", (normalizer) => {
        normalizer.addLocalId();
        normalizer.addFinalIds(final(0), final(1), undefined);
        normalizer.addFinalIds(final(2), final(3), undefined);
        normalizer.addFinalIds(final(4), final(10), undefined);
    });

    itWithNormalizer("can normalize IDs with trailing locals", (normalizer) => {
        normalizer.addLocalId();
        normalizer.addFinalIds(final(0), final(1), undefined);
        normalizer.addLocalId();
        normalizer.addLocalId();
    });

    itWithNormalizer("can normalize IDs with a gap in final space", (normalizer) => {
        normalizer.addLocalId();
        normalizer.addLocalId();
        normalizer.addLocalId();
        normalizer.addFinalIds(final(0), final(1), undefined);
        normalizer.addFinalIds(final(10), final(11), undefined);
    });

    itWithNormalizer(
        "can normalize IDs with and without corresponding local forms",
        (normalizer) => {
            normalizer.addLocalId(); // -1
            normalizer.addLocalId(); // -2
            normalizer.addLocalId(); // -3
            normalizer.addFinalIds(final(0), final(3), dummy);
            normalizer.addLocalId(); // -5
            normalizer.addLocalId(); // -6
            normalizer.addFinalIds(final(4), final(5), dummy);
            normalizer.addLocalId(); // -7
            normalizer.addFinalIds(final(8), final(9), dummy);
            normalizer.addLocalId(); // -9
            normalizer.addFinalIds(final(14), final(15), dummy);
            normalizer.addLocalId(); // -11
            normalizer.addLocalId(); // -12
        },
    );

    itWithNormalizer("can get the last final ID", (normalizer) => {
        normalizer.addLocalId(); // -1
        normalizer.addLocalId(); // -2
        normalizer.addLocalId(); // -3
        normalizer.addLocalId(); // -4
        assert.equal(normalizer.getLastFinalId(), undefined);
        normalizer.addFinalIds(final(0), final(1), undefined);
        assert.equal(normalizer.getLastFinalId(), 1);
        normalizer.addFinalIds(final(2), final(2), undefined);
        assert.equal(normalizer.getLastFinalId(), 2);
        normalizer.addFinalIds(final(10), final(15), undefined);
        assert.equal(normalizer.getLastFinalId(), 15);
    });

    itWithNormalizer("can normalize IDs after fuzzed inputs", (normalizer) => {
        fuzzNormalizer(normalizer, 1000, 42);
    });
});

describe("SessionIdNormalizer Perf", () => {
    const choiceCount = 1000;
    const type = BenchmarkType.Measurement;
    let normalizer: SessionIdNormalizer<DummyRange>;
    let rand: IRandom;
    let ids: SessionSpaceCompressedId[];
    let finals: FinalCompressedId[];
    let locals: LocalCompressedId[];
    let localChoices: LocalCompressedId[];
    let finalChoices: FinalCompressedId[];
    const before = () => {
        normalizer = new SessionIdNormalizer();
        rand = fuzzNormalizer(normalizer, 10000, 3.14);
        ids = [...normalizer];
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

function itWithNormalizer(
    title: string,
    itFn: (normalizer: SessionIdNormalizer<DummyRange>) => void,
): void {
    it(title, () => {
        const locals: (LocalCompressedId | undefined)[] = [];
        const finals: (FinalCompressedId | undefined)[] = [];
        const normalizer: SessionIdNormalizer<DummyRange> = makeNormalizerProxy(
            makeTestNormalizer(),
            locals,
            finals,
        );

        itFn(normalizer);
        const allIds = [...normalizer];
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
                "Test error.",
            );
            if (prevFinal !== undefined && finalExpected !== undefined) {
                assert(finalExpected > prevFinal, "Test error.");
            }
            if (prevLocal !== undefined && localExpected !== undefined) {
                assert(localExpected < prevLocal, "Test error.");
            }
            prevLocal = localExpected;
            prevFinal = finalExpected;

            const sessionIdExpected = localExpected === undefined ? finalExpected : localExpected;
            const sessionIdActualAll = allIds[i];
            const sessionIdActualNormalized =
                finalExpected === undefined
                    ? localExpected
                    : normalizer.getSessionSpaceId(finalExpected);

            if (finalExpected !== undefined) {
                const creationIndex = normalizer.getCreationIndex(finalExpected);
                assert.equal(creationIndex, i);
            }

            const idByIndex = normalizer.getIdByCreationIndex(i);
            assert.equal(idByIndex, localExpected ?? finalExpected);

            if (localExpected !== undefined) {
                const normalized = normalizer.getFinalId(localExpected);
                if (normalized === undefined) {
                    assert.equal(finalExpected, undefined);
                } else {
                    const [opIdActualNormalized] = normalized;
                    assert.equal(opIdActualNormalized, finalExpected);
                }
            }
            assert.equal(sessionIdExpected, sessionIdActualAll);
            assert.equal(sessionIdActualAll, sessionIdActualNormalized);
        }
        assert.equal(normalizer.getLastFinalId(), finals[finals.length - 1]);
        const roundtripped = SessionIdNormalizer.deserialize(
            normalizer.serialize(),
            () => undefined,
        );
        assert(roundtripped.equals(normalizer));
    });
}

function makeNormalizerProxy(
    normalizer: SessionIdNormalizer<DummyRange>,
    locals: (LocalCompressedId | undefined)[],
    finals: (FinalCompressedId | undefined)[],
): SessionIdNormalizer<DummyRange> {
    return new Proxy<SessionIdNormalizer<DummyRange>>(normalizer, {
        get<P extends keyof SessionIdNormalizer<DummyRange>>(
            target: SessionIdNormalizer<DummyRange>,
            property: P,
        ): SessionIdNormalizer<DummyRange>[P] {
            if (typeof target[property] === "function") {
                if (property === "addLocalId") {
                    return new Proxy(target[property], {
                        apply: (func, thisArg, argumentsList) => {
                            const local = Reflect.apply(
                                func,
                                thisArg,
                                argumentsList,
                            ) as LocalCompressedId;
                            if (locals.length > 0) {
                                for (
                                    let i =
                                        (locals[locals.length - 1] ??
                                            fail("Inconsistent locals map")) - 1;
                                    i > local;
                                    i--
                                ) {
                                    locals.push(undefined);
                                }
                            }
                            locals.push(local);
                            return local;
                        },
                    });
                } else if (property === "addFinalIds") {
                    return new Proxy(target[property], {
                        apply: (func, thisArg, argumentsList) => {
                            const firstFinal: FinalCompressedId = argumentsList[0];
                            const lastFinal: FinalCompressedId = argumentsList[1];
                            for (let i = firstFinal; i <= lastFinal; i++) {
                                finals.push(i);
                            }
                            Reflect.apply(func, thisArg, argumentsList);
                        },
                    });
                }
            }
            return Reflect.get(target, property) as SessionIdNormalizer<DummyRange>[P];
        },
    });
}

type DummyRange = undefined;
const dummy: DummyRange = undefined;

function final(num: number): FinalCompressedId {
    assert(num >= 0, "FinalCompressedIds may not be negative");
    return num as FinalCompressedId;
}

function makeTestNormalizer(): SessionIdNormalizer<DummyRange> {
    return new SessionIdNormalizer<DummyRange>(true);
}

interface AddLocalId {
    type: "addLocalId";
}

interface AddFinalIds {
    type: "addFinalIds";
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
        state.currentLocal =
            locals.length < finals.length && random.bool()
                ? -locals.length - (finals.length - locals.length) - 1
                : -locals.length - 1;
        state.prevWasLocal = true;
        return { type: "addLocalId" };
    }

    function addFinalIdsGenerator(state: FuzzTestState): AddFinalIds {
        const { locals, finals, random } = state;
        if (state.prevWasLocal && locals.length > finals.length && random.integer(1, 3) === 3) {
            state.currentFinal += random.integer(1, 4);
        }
        const lastFinal = state.currentFinal + random.integer(0, 10);
        const addFinal: AddFinalIds = {
            type: "addFinalIds",
            first: final(state.currentFinal),
            last: final(lastFinal),
        };
        state.currentFinal = lastFinal + 1;
        state.prevWasLocal = false;
        return addFinal;
    }

    return chain(
        generatorFromArray([{ type: "addLocalId" }]),
        take(
            numOperations - 1,
            createWeightedGenerator<Operation, FuzzTestState>([
                [addLocalIdGenerator, 8],
                [addFinalIdsGenerator, 2],
            ]),
        ),
    );
}

function fuzzNormalizer(
    normalizerToFuzz: SessionIdNormalizer<DummyRange>,
    numOperations: number,
    seed: number,
): IRandom {
    const locals: (LocalCompressedId | undefined)[] = [];
    const finals: (FinalCompressedId | undefined)[] = [];
    const normalizer: SessionIdNormalizer<DummyRange> = makeNormalizerProxy(
        normalizerToFuzz,
        locals,
        finals,
    );

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
            addLocalId: (state) => {
                state.normalizer.addLocalId();
                return state;
            },
            addFinalIds: (state, { first, last }) => {
                state.normalizer.addFinalIds(first, last, undefined);
                return state;
            },
        },
        initialState,
    );
    return initialState.random;
}
