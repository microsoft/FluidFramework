/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { AsyncReducer, BaseFuzzTestState, Reducer } from "./types.js";

/**
 * @internal
 */
export interface BaseOperation {
	type: number | string;
}

/**
 * @internal
 */
export const isOperationType = <O extends BaseOperation>(
	type: O["type"],
	op: BaseOperation,
): op is O => op.type === type;

/**
 * @internal
 */
export function combineReducers<
	TOperation extends BaseOperation,
	TState extends BaseFuzzTestState,
>(
	reducerMap: {
		[K in TOperation["type"]]: Reducer<Extract<TOperation, { type: K }>, TState>;
	},
): Reducer<TOperation, TState> {
	return (state, op) => {
		const childReducer = reducerMap[op.type];
		assert(
			childReducer !== undefined,
			`Expected to find child reducer for operation type: ${op.type}`,
		);
		const newState: TState = childReducer(state, op) ?? state;
		return newState;
	};
}

/**
 * @internal
 */
export function combineReducersAsync<
	TOperation extends BaseOperation,
	TState extends BaseFuzzTestState,
>(
	reducerMap: {
		[K in TOperation["type"]]: AsyncReducer<Extract<TOperation, { type: K }>, TState>;
	},
): AsyncReducer<TOperation, TState> {
	return async (state, op) => {
		const childReducer = reducerMap[op.type];
		assert(
			childReducer !== undefined,
			`Expected to find child reducer for operation type: ${op.type}`,
		);
		const newState: TState = (await childReducer(state, op)) ?? state;
		return newState;
	};
}

/**
 * Some reducers require preconditions be met which are validated by their generator.
 * The validation can be lost if the generator is not run.
 * The primary case where this happens is during minimization. If a reducer detects this
 * problem, they can throw this error type, and minimization will consider the current
 * test invalid, rather than continuing to test invalid scenarios.
 * @internal
 */
export class ReducerPreconditionError extends Error {}
