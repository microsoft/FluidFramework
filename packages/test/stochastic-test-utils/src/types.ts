/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @internal
 */
export interface BaseFuzzTestState {
	random: IRandom;
}

/**
 * @internal
 */
export const done = Symbol("GeneratorDone");

/**
 * Given some input state, synchronously generates outputs.
 * @internal
 */
export type Generator<TOut, TState> = (state: TState) => TOut | typeof done;

/**
 * Given some input state, asynchronously generates outputs.
 * @internal
 */
export type AsyncGenerator<TOut, TState> = (state: TState) => Promise<TOut | typeof done>;

/**
 * Given a starting state and an operation to apply to that state, returns a new state.
 * Reducers can also opt to mutate the input state, in which case they should have a void return.
 *
 * @remarks Opting to use impure reducers may be more ergonomic for workflows which are unlikely
 * to benefit from the advantages of pure ones (ex: state is not serializable or is deeply mutated,
 * which makes things like history tracking less practical)
 *
 * @internal
 */
export type Reducer<TOp, TState> = (state: TState, operation: TOp) => TState | void;

/**
 * Given a starting state and an operation to apply to that state, asynchronously returns a new state.
 * Reducers can also opt to mutate the input state, in which case they should have a void return.
 *
 * @remarks Opting to use impure reducers may be more ergonomic for workflows which are unlikely
 * to benefit from the advantages of pure ones (ex: state is not serializable or is deeply mutated,
 * which makes things like history tracking less practical)
 *
 * @internal
 */
export type AsyncReducer<TOp, TState> = (
	state: TState,
	operation: TOp,
) => Promise<TState | void>;

/**
 * @internal
 */
export type AcceptanceCondition<TState> = (state: TState) => boolean;

/**
 * Array of weighted generators to select from.
 *
 * A generator should only be invoked if the corresponding `AcceptanceCondition` evaluates to true.
 * This is useful in practice to avoid invoking generators for known-to-be invalid actions based on the current state:
 * for example, a "leave" op cannot be generated if there are no currently connected clients.
 *
 * @internal
 */
export type Weights<TOp, TState> = [
	TOp | Generator<TOp, TState>,
	number,
	AcceptanceCondition<TState>?,
][];

/**
 * Array of weighted generators to select from.
 *
 * A generator should only be invoked if the corresponding `AcceptanceCondition` evaluates to true.
 * This is useful in practice to avoid invoking generators for known-to-be invalid actions based on the current state:
 * for example, a "leave" op cannot be generated if there are no currently connected clients.
 *
 * @internal
 */
export type AsyncWeights<TOp, TState> = [
	TOp | AsyncGenerator<TOp, TState>,
	number,
	AcceptanceCondition<TState>?,
][];

/**
 * @internal
 */
export interface SaveDestination {
	/** Filepath to dump the history file. Containing folder is created if it doesn't exist. */
	readonly path: string;
}

/**
 * @internal
 */
export interface SaveInfo {
	saveOnFailure: false | SaveDestination;
	saveOnSuccess: false | SaveDestination;
}

/**
 * @internal
 */
export interface IRandom {
	clone(newSeed: number): IRandom;
	/**
	 * Return a pseudorandomly chosen boolean value that is true with the given probability.
	 * (A probability of 0 is always false, a probability of 1 is always true)
	 */
	bool(probability?: number): boolean;

	/**
	 * Return a pseudorandomly chosen int53 in the range [min..max] (both inclusive).
	 */
	integer(min: number, max: number): number;

	/**
	 * Returns a pseudorandomly chosen float64 from the normal distribution with the given
	 * 'mean' and 'standardDeviation'.
	 */
	normal(mean?: number, standardDeviation?: number): number;

	/**
	 * Returns a pseudorandomly chosen item from the set of provided 'items'.
	 */
	pick<T>(items: T[]): T;

	/**
	 * Return a pseudorandomly chosen float64 in the range [min..max) (inclusive min, exclusive max).
	 *
	 * If 'min' and 'max' are unspecified, defaults to [0..1).
	 */
	real(min?: number, max?: number): number;

	/**
	 * Pseudorandomly shuffles the order of the items in the given array (array is modified in place.)
	 */
	shuffle<T>(items: T[]);

	/**
	 * Returns a pseudorandomly generated string of the specified length.  The string is constructed
	 * of characters from the given alphabet.
	 *
	 * If unspecified, the base58 alphabet is used, which excludes non-alphanumeric characters as
	 * well as 0 – zero / O – capital o and I – capital i / l – lower-case L.
	 */
	string(length: number, alphabet?: string): string;

	/**
	 * Return a pseudorandomly generated UUID (version 4).
	 */
	uuid4(): string;
}
