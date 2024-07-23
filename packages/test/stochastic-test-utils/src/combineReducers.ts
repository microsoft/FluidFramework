/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { AsyncReducer, BaseFuzzTestState, Reducer } from "./types.js";

/**
 * @internal
 */
export function combineReducers<
	TOperation extends { type: string | number },
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
	TOperation extends { type: string | number },
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
