/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export interface BaseFuzzTestState {
    random: IRandom;
}

export const done = Symbol("GeneratorDone");

/**
 * Given some input state, synchronously generates outputs.
 */
export type Generator<TOut, TState> = (state: TState) => TOut | typeof done;

/**
 * Given some input state, asynchronously generates outputs.
 */
export type AsyncGenerator<TOut, TState> = (state: TState) => Promise<TOut | typeof done>;

/**
 * Given a starting state and an operation to apply to that state, returns a new state.
 */
export type Reducer<TOp, TState> = (state: TState, operation: TOp) => TState;

/**
 * Given a starting state and an operation to apply to that state, asynchronously returns a new state.
 */
export type AsyncReducer<TOp, TState> = (state: TState, operation: TOp) => Promise<TState>;

export type AcceptanceCondition<TState> = (state: TState) => boolean;

/**
 * Array of weighted generators to select from.
 *
 * A generator should only be invoked if the corresponding `AcceptanceCondition` evaluates to true.
 * This is useful in practice to avoid invoking generators for known-to-be invalid actions based on the current state:
 * for example, a "leave" op cannot be generated if there are no currently connected clients.
 */
export type Weights<TOp, TState> = [TOp | Generator<TOp, TState>, number, AcceptanceCondition<TState>?][];

/**
 * Array of weighted generators to select from.
 *
 * A generator should only be invoked if the corresponding `AcceptanceCondition` evaluates to true.
 * This is useful in practice to avoid invoking generators for known-to-be invalid actions based on the current state:
 * for example, a "leave" op cannot be generated if there are no currently connected clients.
 */
export type AsyncWeights<TOp, TState> = [TOp | AsyncGenerator<TOp, TState>, number, AcceptanceCondition<TState>?][];

export interface SaveInfo {
    saveAt?: number;
    saveOnFailure: boolean;
    /** Filepath to dump the history file. Containing folder must already be created. */
    filepath: string;
}

export interface IRandom {
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
