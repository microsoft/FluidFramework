/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
    AcceptanceCondition,
    AsyncGenerator,
    AsyncWeights,
    BaseFuzzTestState,
    done,
    Generator,
    Weights,
} from "./types";

/**
 * Returns a generator which produces a categorial distribution with the provided weights.
 * (see https://en.wikipedia.org/wiki/Categorical_distribution)
 *
 * @param weights - Object defining either values or generators to yield from with corresponding likelihoods.
 * Each potential category can also provide an acceptance function, which restricts whether that category can be
 * chosen for a particular input state.
 *
 * @example
 * ```typescript
 * const modifyGenerator = ({ random, list }) => {
 *     return { type: "modify", index: random.integer(0, list.length - 1) };
 * };
 * // Produces an infinite stochastic generator which:
 * // - If both "insert" and "delete" are valid, generates "insert" with 3 times the likelihood as it generates
 * //  "delete"
 * // - Produces values from `modifyGenerator` with the same likelihood it produces an "insert"
 * // - Only allows production of a "delete" operation if the underlying state list is non-empty
 * const generator = createWeightedGenerator([
 *     [{ type: "insert" }, 3],
 *     [modifyGenerator, 3]
 *     [{ type: "delete" }, 1, (state) => state.list.length > 0]
 * ]);
 * ```
 */
export function createWeightedGenerator<T, TState extends BaseFuzzTestState>(
    weights: Weights<T, TState>,
): Generator<T, TState> {
    const cumulativeSums: [T | Generator<T, TState>, number, AcceptanceCondition<TState>?][] = [];
    let totalWeight = 0;
    for (const [tOrGenerator, weight, shouldAccept] of weights) {
        const cumulativeWeight = totalWeight + weight;
        cumulativeSums.push([tOrGenerator, cumulativeWeight, shouldAccept]);
        totalWeight = cumulativeWeight;
    }

    // Note: if this is a perf bottleneck in usage, the cumulative weights array could be
    // binary searched, and for small likelihood of acceptance (i.e. disproportional weights)
    // we could pre-filter the acceptance conditions rather than rejection sample the outcome.
    return (state) => {
        const { random } = state;
        const sample = () => {
            const weightSelected = random.integer(1, totalWeight);

            let opIndex = 0;
            while (cumulativeSums[opIndex][1] < weightSelected) {
                opIndex++;
            }

            return opIndex;
        };

        let index;
        let shouldAccept: AcceptanceCondition<TState> | undefined;
        do {
            index = sample();
            shouldAccept = cumulativeSums[index][2];
        } while (!(shouldAccept?.(state) ?? true));

        const [tOrGenerator] = cumulativeSums[index];
        return typeof tOrGenerator === "function"
            ? (tOrGenerator as Generator<T, TState>)(state)
            : (tOrGenerator as unknown as T);
    };
}

/**
 * Higher-order generator operator which creates a new generator producing the first `n` elements of `generator`.
 */
export function take<T, TState>(n: number, generator: Generator<T, TState>): Generator<T, TState> {
    let count = 0;
    return (state) => {
        if (count < n) {
            count++;
            return generator(state);
        }
        return done;
    };
}

/**
 * @returns a deterministic generator that always returns the items of `contents` in order.
 */
export function generatorFromArray<T, TAdditionalState>(contents: T[]): Generator<T, TAdditionalState> {
    let index = -1;
    return () => {
        if (index < contents.length) {
            index++;
            return contents[index] ?? done;
        }
        return done;
    };
}

/**
 * Higher-order generator operator which exhausts each input generator sequentially before moving on to the next.
 */
export function chain<T, TState>(...generators: Generator<T, TState>[]): Generator<T, TState> {
    let currentIndex = 0;
    return (state) => {
        while (currentIndex < generators.length) {
            const generator = generators[currentIndex];
            const result = generator(state);
            if (result !== done) {
                return result;
            } else {
                currentIndex++;
            }
        }
        return done;
    };
}

/**
 * Higher-order generator operator which exhausts each input generator sequentially before moving on to the next.
 */
export function chainIterables<T, TState>(generators: Generator<Generator<T, TState>, void>): Generator<T, TState> {
    let currentGenerator = generators();
    return (state) => {
        while (currentGenerator !== done) {
            const result = currentGenerator(state);
            if (result !== done) {
                return result;
            }

            currentGenerator = generators();
        }

        return done;
    };
}

/**
 * Interleaves outputs from `generator1` and `generator2`.
 * By default outputs are taken one at a time, but can be controlled with `numOps1` and `numOps2`.
 * This is useful in stochastic tests for producing a certain operation (e.g. "validate" or "synchronize") at a
 * defined interval.
 *
 * Exhausts both input generators before terminating.
 *
 * @example
 * ```typescript
 * // Assume gen1 produces 1, 2, 3, ... and gen2 produces "a", "b", "c", ...
 * interleave(gen1, gen2) // 1, a, 2, b, 3, c, ...
 * interleave(gen1, gen2, 2) // 1, 2, a, 3, 4, b, 5, 6, c, ...
 * interleave(gen1, gen2, 2, 3) // 1, 2, a, b, c, 3, 4, d, e, f, ...
 * ```
 */
export function interleave<T, TState>(
    generator1: Generator<T, TState>,
    generator2: Generator<T, TState>,
    numOps1 = 1,
    numOps2 = 1,
): Generator<T, TState> {
    // The implementation strategy here is to use `chainIterables` to alternate which of the two input generators
    // we feed to the output. This has one small problem: once both generators are exhausted, `chainIterables` needs
    // to know to stop as well. We accomplish this by spying on the output of both given generators.
    // Alternatively, it's possible to implement this correctly by wrapping the provided generators into one that
    // supports `peek()` like so:
    /*
     * const withPeek = (g: Generator<T, TState>): Generator<T, TState> & { peek(state: TState): T | typeof done } => {
     *     let currentGenerator: Generator<T, TState> = g;
     *     const derived = (state) => currentGenerator(state);
     *     derived.peek = (state: TState): T | typeof done => {
     *         const result = currentGenerator(state);
     *         currentGenerator = chain(take<T, TState>(1, () => result), g);
     *         return result;
     *     };
     *     return derived;
     * };
     */

    let generator1Exhausted = false;
    let generator2Exhausted = false;

    const spiedGenerator1: Generator<T, TState> = (state) => {
        const result = generator1Exhausted ? done : generator1(state);
        generator1Exhausted = result === done;
        return result;
    };

    const spiedGenerator2: Generator<T, TState> = (state) => {
        const result = generator2Exhausted ? done : generator2(state);
        generator2Exhausted = result === done;
        return result;
    };

    let generatorIndex = 0;
    return chainIterables(() => {
        if (generator1Exhausted && generator2Exhausted) {
            return done;
        }

        generatorIndex += 1;
        if (generatorIndex % 2 === 1) {
            return take(numOps1, spiedGenerator1);
        } else {
            return take(numOps2, spiedGenerator2);
        }
    });
}

/**
 * Creates a generator for an infinite stream of `t`s.
 * @param t - Output value to repeatedly generate.
 */
export function repeat<T, TState = void>(t: T): Generator<T, TState> {
    return () => t;
}

/**
 * Returns a generator which produces a categorical distribution with the provided weights.
 * (see https://en.wikipedia.org/wiki/Categorical_distribution)
 *
 * @param weights - Object defining either values or async generators to yield from with corresponding likelihoods.
 * Each potential category can also provide an acceptance function, which restricts whether that category can be
 * chosen for a particular input state.
 *
 * @example
 * ```typescript
 * const modifyGenerator = async ({ random, list }) => {
 *     return { type: "modify", index: random.integer(0, list.length - 1) };
 * };
 * // Produces an infinite generator which:
 * // - If both "insert" and "delete" are valid, generates "insert" with 3 times the likelihood as it generates
 * //  "delete"
 * // - Produces values from `modifyGenerator` with the same likelihood it produces an "insert"
 * // - Only allows production of a "delete" operation if the underlying state list is non-empty
 * const generator = createWeightedAsyncGenerator([
 *     [{ type: "insert" }, 3],
 *     [modifyGenerator, 3]
 *     [{ type: "delete" }, 1, (state) => state.list.length > 0]
 * ]);
 * ```
 */
export function createWeightedAsyncGenerator<T, TState extends BaseFuzzTestState>(
    weights: AsyncWeights<T, TState>,
): AsyncGenerator<T, TState> {
    const cumulativeSums: [T | AsyncGenerator<T, TState>, number, AcceptanceCondition<TState>?][] = [];
    let totalWeight = 0;
    for (const [tOrGenerator, weight, shouldAccept] of weights) {
        const cumulativeWeight = totalWeight + weight;
        cumulativeSums.push([tOrGenerator, cumulativeWeight, shouldAccept]);
        totalWeight = cumulativeWeight;
    }

    // Note: if this is a perf bottleneck in usage, the cumulative weights array could be
    // binary searched, and for small likelihood of acceptance (i.e. disproportional weights)
    // we could pre-filter the acceptance conditions rather than rejection sample the outcome.
    return async (state) => {
        const { random } = state;
        const sample = () => {
            const weightSelected = random.integer(1, totalWeight);

            let opIndex = 0;
            while (cumulativeSums[opIndex][1] < weightSelected) {
                opIndex++;
            }

            return opIndex;
        };

        let index;
        let shouldAccept: AcceptanceCondition<TState> | undefined;
        do {
            index = sample();
            shouldAccept = cumulativeSums[index][2];
        } while (!(shouldAccept?.(state) ?? true));

        const [tOrGenerator] = cumulativeSums[index];
        return typeof tOrGenerator === "function"
            ? (tOrGenerator as AsyncGenerator<T, TState>)(state)
            : (tOrGenerator as unknown as T);
    };
}

/**
 * Higher-order generator operator which creates a new generator producing the first `n` elements of `generator`.
 */
export function takeAsync<T, TState>(n: number, generator: AsyncGenerator<T, TState>): AsyncGenerator<T, TState> {
    let count = 0;
    return async (state) => {
        if (count < n) {
            count++;
            return generator(state);
        }
        return done;
    };
}

/**
 * @returns a deterministic generator that always returns the items of `contents` in order.
 */
export function asyncGeneratorFromArray<T, TAdditionalState>(contents: T[]): AsyncGenerator<T, TAdditionalState> {
    const generator = generatorFromArray(contents);
    return async (state) => generator(state);
}

/**
 * Higher-order generator operator which exhausts each input generator sequentially before moving on to the next.
 */
export function chainAsync<T, TState>(...generators: AsyncGenerator<T, TState>[]): AsyncGenerator<T, TState> {
    let currentIndex = 0;
    return async (state) => {
        while (currentIndex < generators.length) {
            const generator = generators[currentIndex];
            const result = await generator(state);
            if (result !== done) {
                return result;
            } else {
                currentIndex++;
            }
        }
        return done;
    };
}

/**
 * Higher-order generator operator which exhausts each input generator sequentially before moving on to the next.
 */
export function chainAsyncIterables<T, TState>(
    generators: AsyncGenerator<AsyncGenerator<T, TState>, void>,
): AsyncGenerator<T, TState> {
    let currentGeneratorP = generators();
    return async (state) => {
        let currentGenerator = await currentGeneratorP;
        while (currentGenerator !== done) {
            const result = await currentGenerator(state);
            if (result !== done) {
                return result;
            }

            currentGeneratorP = generators();
            currentGenerator = await currentGeneratorP;
        }

        return done;
    };
}

/**
 * Interleaves outputs from `generator1` and `generator2`.
 * By default outputs are taken one at a time, but can be controlled with `numOps1` and `numOps2`.
 * This is useful in stochastic tests for producing a certain operation (e.g. "validate" or "synchronize") at a
 * defined interval.
 *
 * Exhausts both input generators before terminating.
 *
 * @example
 * ```typescript
 * // Assume gen1 produces 1, 2, 3, ... and gen2 produces "a", "b", "c", ...
 * interleave(gen1, gen2) // 1, a, 2, b, 3, c, ...
 * interleave(gen1, gen2, 2) // 1, 2, a, 3, 4, b, 5, 6, c, ...
 * interleave(gen1, gen2, 2, 3) // 1, 2, a, b, c, 3, 4, d, e, f, ...
 * ```
 */
export function interleaveAsync<T, TState>(
    generator1: AsyncGenerator<T, TState>,
    generator2: AsyncGenerator<T, TState>,
    numOps1 = 1,
    numOps2 = 1,
): AsyncGenerator<T, TState> {
    let generator1Exhausted = false;
    let generator2Exhausted = false;

    const spiedGenerator1: AsyncGenerator<T, TState> = async (state) => {
        const result = generator1Exhausted ? done : await generator1(state);
        generator1Exhausted = result === done;
        return result;
    };

    const spiedGenerator2: AsyncGenerator<T, TState> = async (state) => {
        const result = generator2Exhausted ? done : await generator2(state);
        generator2Exhausted = result === done;
        return result;
    };

    let generatorIndex = 0;
    return chainAsyncIterables(async () => {
        if (generator1Exhausted && generator2Exhausted) {
            return done;
        }

        generatorIndex += 1;
        if (generatorIndex % 2 === 1) {
            return takeAsync(numOps1, spiedGenerator1);
        } else {
            return takeAsync(numOps2, spiedGenerator2);
        }
    });
}

/**
 * Creates a generator for an infinite stream of `t`s.
 * @param t - Output value to repeatedly generate.
 */
export function repeatAsync<T, TState = void>(t: T): AsyncGenerator<T, TState> {
    return async () => t;
}
