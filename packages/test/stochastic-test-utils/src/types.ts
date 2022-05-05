/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type Random from "random-js";

export interface BaseFuzzTestState {
    random: Random;
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
