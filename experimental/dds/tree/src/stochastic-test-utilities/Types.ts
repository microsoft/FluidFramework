/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type Random from 'random-js';

export interface BaseFuzzTestState {
	rand: Random;
}

export const done = Symbol('GeneratorDone');

/**
 * Given some input state, asynchronously generates outputs.
 */
export type AsyncGenerator<T, TState> = (state: TState) => Promise<T | typeof done>;

export type AcceptanceCondition<TState> = (state: TState) => boolean;

/**
 * Array of weighted generators to select from.
 *
 * A generator should only be invoked if the corresponding `AcceptanceCondition` evaluates to true.
 * This is useful in practice to avoid invoking generators for known-to-be invalid actions based on the current state:
 * for example, a "leave" op cannot be generated if there are no currently connected clients.
 */
export type Weights<T, TState> = [T | AsyncGenerator<T, TState>, number, AcceptanceCondition<TState>?][];
