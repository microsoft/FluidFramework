/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { promises as fs, mkdirSync, writeFileSync } from "fs";
import path from "path";

import {
	combineReducers,
	combineReducersAsync,
	type BaseOperation,
} from "./combineReducers.js";
import {
	AsyncGenerator,
	AsyncReducer,
	BaseFuzzTestState,
	Generator,
	Reducer,
	SaveInfo,
	done,
} from "./types.js";

type RealOperation<T extends BaseOperation> = T & { debug?: boolean; seed: number };

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
 *
 * @internal
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
 *
 * @internal
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
/**
 * @internal
 */
export async function performFuzzActionsAsync<
	TOperation extends BaseOperation,
	TState extends BaseFuzzTestState,
>(
	generator: AsyncGenerator<TOperation, TState>,
	reducerOrMap:
		| AsyncReducer<TOperation, TState>
		| { [K in TOperation["type"]]: AsyncReducer<Extract<TOperation, { type: K }>, TState> },
	initialState: TState,
	saveInfo: SaveInfo = { saveOnFailure: false, saveOnSuccess: false },
): Promise<TState> {
	const operations: TOperation[] = [];
	let state: TState = initialState;
	const reducer =
		typeof reducerOrMap === "function"
			? reducerOrMap
			: combineReducersAsync<TOperation, TState>(reducerOrMap);
	const applyOperation = async (reduceState: TState, op: RealOperation<TOperation>) => {
		const seededState: TState = { ...reduceState, random: initialState.random.clone(op.seed) };
		return (await reducer(seededState, op)) ?? seededState;
	};

	const runGenerator = async (
		genState: TState,
	): Promise<RealOperation<TOperation> | typeof done> => {
		const seed = initialState.random.real();
		const seededState: TState = {
			...genState,
			random: initialState.random.clone(seed),
		};
		const op = await generator(seededState);
		if (op === done) {
			return op;
		}
		return { seed, ...op };
	};

	try {
		for (
			let operation = await runGenerator(state);
			operation !== done;
			operation = await runGenerator(state)
		) {
			operations.push(operation);
			if (operation.debug === true) {
				debugger;
			}
			state = await applyOperation(state, operation);
		}
	} catch (err) {
		if (saveInfo.saveOnFailure !== false) {
			await saveOpsToFile(saveInfo.saveOnFailure.path, operations);
		}
		throw err;
	}

	if (saveInfo.saveOnSuccess !== false) {
		await saveOpsToFile(saveInfo.saveOnSuccess.path, operations);
	}

	return state;
}

/**
 * Saves the operations in a file and creates the directory if it doesn't exist.
 *
 * @param filepath - path to the file
 * @param operations - operations to save in the file
 *
 * @internal
 */
export async function saveOpsToFile(
	filepath: string,
	operations: { type: string | number }[],
) {
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
 *
 * @internal
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
 *
 * @internal
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
/**
 * @internal
 */
export function performFuzzActions<
	TOperation extends BaseOperation,
	TState extends BaseFuzzTestState,
>(
	generator: Generator<TOperation, TState>,
	reducerOrMap:
		| Reducer<TOperation, TState>
		| { [K in TOperation["type"]]: Reducer<Extract<TOperation, { type: K }>, TState> },
	initialState: TState,
	saveInfo: SaveInfo = { saveOnFailure: false, saveOnSuccess: false },
): TState {
	const operations: TOperation[] = [];
	let state: TState = initialState;
	const reducer =
		typeof reducerOrMap === "function"
			? reducerOrMap
			: combineReducers<TOperation, TState>(reducerOrMap);
	const applyOperation: (operation: TOperation) => TState = (op) =>
		reducer(state, op) ?? state;

	try {
		for (let operation = generator(state); operation !== done; operation = generator(state)) {
			operations.push(operation);
			state = applyOperation(operation);
		}
	} catch (err) {
		if (saveInfo.saveOnFailure !== false) {
			saveOpsToFileSync(saveInfo.saveOnFailure.path, operations);
		}
		throw err;
	}

	if (saveInfo.saveOnSuccess !== false) {
		saveOpsToFileSync(saveInfo.saveOnSuccess.path, operations);
	}

	return state;
}

/**
 * Saves the operations in a file and creates the directory if it doesn't exist.
 *
 * @param filepath - path to the file
 * @param operations - operations to save in the file
 *
 * @internal
 */
function saveOpsToFileSync(filepath: string, operations: { type: string | number }[]) {
	mkdirSync(path.dirname(filepath), { recursive: true });
	writeFileSync(filepath, JSON.stringify(operations, undefined, 4));
}
