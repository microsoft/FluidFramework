/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { promises as fs, writeFileSync, mkdirSync } from "fs";
import path from "path";
import {
	AsyncGenerator,
	AsyncReducer,
	BaseFuzzTestState,
	done,
	Generator,
	Reducer,
	SaveInfo,
} from "./types";
import { combineReducers, combineReducersAsync } from "./combineReducers";

/**
 * Performs random actions on a set of clients.
 *
 * TOperation is expected to be a discriminated union of JSONable "operation" types, representing some operation to
 * perform on the current state.
 * TState can contain arbitrary data, but must provide a source of randomness (which should be deterministic) via
 * the `random` field.
 * @param generator - finite generator for a sequence of Operations to test. The test will run until this generator
 * is exhausted.
 * @param reducer - reducer function which is able to apply Operations to the current state and return the new state
 * @param initialState - Initial state for the test
 * @param saveInfo - optionally provide information about when a history of all operations will be saved to disk at
 * a given filepath.
 * This can be useful for debugging why a fuzz test may have failed.
 * Files can also be saved on failure.
 */
export async function performFuzzActionsAsync<
	TOperation extends { type: string | number },
	TState extends BaseFuzzTestState,
>(
	generator: AsyncGenerator<TOperation, TState>,
	reducer: AsyncReducer<TOperation, TState>,
	initialState: TState,
	saveInfo?: SaveInfo,
): Promise<TState>;
/**
 * Performs random actions on a set of clients.
 *
 * TOperation is expected to be a discriminated union of JSONable "operation" types, representing some operation to
 * perform on the current state.
 * TState can contain arbitrary data, but must provide a source of randomness (which should be deterministic) via
 * the `random` field.
 * @param generator - finite generator for a sequence of Operations to test. The test will run until this generator
 * is exhausted.
 * @param reducerMap - Object-map containing reducers at each key for the operation of that type.
 * For example, if there is an "add" and "delete" operation with schemas
 * ```typescript
 * interface AddOperation { type: "add", index: number }
 * interface DeleteOperation { type: "delete", index: number }
 * ```
 * this parameter might look like:
 * ```typescript
 * {
 *   add: (state, index) => { myList.insert(index); return state; },
 *   delete: (state, index) => { myList.delete(index); return state; }
 * }
 * ```
 * @param initialState - Initial state for the test
 * @param saveInfo - optionally provide information about when a history of all operations will be saved to disk at
 * a given filepath.
 * This can be useful for debugging why a fuzz test may have failed.
 * Files can also be saved on failure.
 */
export async function performFuzzActionsAsync<
	TOperation extends { type: string | number },
	TState extends BaseFuzzTestState,
>(
	generator: AsyncGenerator<TOperation, TState>,
	reducerMap: {
		[K in TOperation["type"]]: AsyncReducer<Extract<TOperation, { type: K }>, TState>;
	},
	initialState: TState,
	saveInfo?: SaveInfo,
): Promise<TState>;
export async function performFuzzActionsAsync<
	TOperation extends { type: string | number },
	TState extends BaseFuzzTestState,
>(
	generator: AsyncGenerator<TOperation, TState>,
	reducerOrMap:
		| AsyncReducer<TOperation, TState>
		| { [K in TOperation["type"]]: AsyncReducer<Extract<TOperation, { type: K }>, TState> },
	initialState: TState,
	saveInfo?: SaveInfo,
): Promise<TState> {
	const operations: TOperation[] = [];
	let state: TState = initialState;
	const reducer =
		typeof reducerOrMap === "function"
			? reducerOrMap
			: combineReducersAsync<TOperation, TState>(reducerOrMap);
	const applyOperation: (operation: TOperation) => Promise<TState> = async (op) =>
		(await reducer(state, op)) ?? state;

	for (
		let operation = await generator(state);
		operation !== done;
		operation = await generator(state)
	) {
		operations.push(operation);

		try {
			state = (await applyOperation(operation)) ?? state;
		} catch (err) {
			console.log(`Error encountered on operation number ${operations.length}`);
			if (saveInfo?.saveOnFailure === true) {
				await saveOpsToFile(saveInfo.filepath, operations);
			}
			throw err;
		}
	}

	if (saveInfo?.saveOnSuccess === true) {
		await saveOpsToFile(saveInfo.filepath, operations);
	}

	return state;
}

/**
 * Saves the operations in a file and creates the directory if it doesn't exist.
 *
 * @param filepath - path to the file
 * @param operations - operations to save in the file
 */
async function saveOpsToFile(filepath: string, operations: { type: string | number }[]) {
	await fs.mkdir(path.dirname(filepath), { recursive: true });
	await fs.writeFile(filepath, JSON.stringify(operations, undefined, 4));
}

/**
 * Performs random actions on a set of clients.
 *
 * TOperation is expected to be a discriminated union of JSONable "operation" types, representing some operation to
 * perform on the current state.
 * TState can contain arbitrary data, but must provide a source of randomness (which should be deterministic) via
 * the `random` field.
 * @param generator - finite generator for a sequence of Operations to test. The test will run until this generator
 * is exhausted.
 * @param reducer - reducer function which is able to apply Operations to the current state and return the new state
 * @param initialState - Initial state for the test
 * @param saveInfo - optionally provide information about when a history of all operations will be saved to disk at
 * a given filepath.
 * This can be useful for debugging why a fuzz test may have failed.
 * Files can also be saved on failure.
 */
export function performFuzzActions<
	TOperation extends { type: string | number },
	TState extends BaseFuzzTestState,
>(
	generator: Generator<TOperation, TState>,
	reducer: Reducer<TOperation, TState>,
	initialState: TState,
	saveInfo?: SaveInfo,
): TState;
/**
 * Performs random actions on a set of clients.
 *
 * TOperation is expected to be a discriminated union of JSONable "operation" types, representing some operation to
 * perform on the current state.
 * TState can contain arbitrary data, but must provide a source of randomness (which should be deterministic) via
 * the `random` field.
 * @param generator - finite generator for a sequence of Operations to test. The test will run until this generator
 * is exhausted.
 * @param reducerMap - Object-map containing reducers at each key for the operation of that type.
 * For example, if there is an "add" and "delete" operation with schemas
 * ```typescript
 * interface AddOperation { type: "add", index: number }
 * interface DeleteOperation { type: "delete", index: number }
 * ```
 * this parameter might look like:
 * ```typescript
 * {
 *   add: (state, index) => { myList.insert(index); return state; },
 *   delete: (state, index) => { myList.delete(index); return state; }
 * }
 * ```
 * @param initialState - Initial state for the test
 * @param saveInfo - optionally provide information about when a history of all operations will be saved to disk at
 * a given filepath.
 * This can be useful for debugging why a fuzz test may have failed.
 * Files can also be saved on failure.
 */
export function performFuzzActions<
	TOperation extends { type: string | number },
	TState extends BaseFuzzTestState,
>(
	generator: Generator<TOperation, TState>,
	reducerMap: { [K in TOperation["type"]]: Reducer<Extract<TOperation, { type: K }>, TState> },
	initialState: TState,
	saveInfo?: SaveInfo,
): TState;
export function performFuzzActions<
	TOperation extends { type: string | number },
	TState extends BaseFuzzTestState,
>(
	generator: Generator<TOperation, TState>,
	reducerOrMap:
		| Reducer<TOperation, TState>
		| { [K in TOperation["type"]]: Reducer<Extract<TOperation, { type: K }>, TState> },
	initialState: TState,
	saveInfo?: SaveInfo,
): TState {
	const operations: TOperation[] = [];
	let state: TState = initialState;
	const reducer =
		typeof reducerOrMap === "function"
			? reducerOrMap
			: combineReducers<TOperation, TState>(reducerOrMap);
	const applyOperation: (operation: TOperation) => TState = (op) => reducer(state, op) ?? state;

	for (let operation = generator(state); operation !== done; operation = generator(state)) {
		operations.push(operation);

		try {
			state = applyOperation(operation);
		} catch (err) {
			console.log(`Error encountered on operation number ${operations.length}`);
			if (saveInfo?.saveOnFailure === true) {
				saveOpsToFileSync(saveInfo.filepath, operations);
			}
			throw err;
		}
	}

	if (saveInfo?.saveOnSuccess === true) {
		saveOpsToFileSync(saveInfo.filepath, operations);
	}

	return state;
}

/**
 * Saves the operations in a file and creates the directory if it doesn't exist.
 *
 * @param filepath - path to the file
 * @param operations - operations to save in the file
 */
function saveOpsToFileSync(filepath: string, operations: { type: string | number }[]) {
	mkdirSync(path.dirname(filepath), { recursive: true });
	writeFileSync(filepath, JSON.stringify(operations, undefined, 4));
}
