/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { promises as fs, writeFileSync } from "fs";
import { assert } from "@fluidframework/common-utils";
import { AsyncGenerator, AsyncReducer, BaseFuzzTestState, done, Generator, Reducer, SaveInfo } from "./types";

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
    TOperation extends { type: string | number; },
    TState extends BaseFuzzTestState,
>(
    generator: AsyncGenerator<TOperation, TState>,
    reducer: AsyncReducer<TOperation, TState>,
    initialState: TState,
    saveInfo?: SaveInfo
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
    TOperation extends { type: string | number; },
    TState extends BaseFuzzTestState,
>(
    generator: AsyncGenerator<TOperation, TState>,
    reducerMap: { [K in TOperation["type"]]: AsyncReducer<Extract<TOperation, { type: K; }>, TState> },
    initialState: TState,
    saveInfo?: SaveInfo
): Promise<TState>;
export async function performFuzzActionsAsync<
    TOperation extends { type: string | number; },
    TState extends BaseFuzzTestState,
>(
    generator: AsyncGenerator<TOperation, TState>,
    reducerOrMap:
        | AsyncReducer<TOperation, TState>
        | { [K in TOperation["type"]]: AsyncReducer<Extract<TOperation, { type: K; }>, TState> },
    initialState: TState,
    saveInfo?: SaveInfo,
): Promise<TState> {
    const operations: TOperation[] = [];
    let state: TState = initialState;
    const applyOperation: (operation: TOperation) => Promise<TState> =
        typeof reducerOrMap === "function"
            ? async (op) => reducerOrMap(state, op)
            : async (op) => {
                const childReducer = reducerOrMap[op.type];
                assert(childReducer !== undefined, `Expected to find child reducer for operation type: ${op.type}`);
                const newState: TState = await childReducer(state, op);
                return newState;
            };

    for (let operation = await generator(state); operation !== done; operation = await generator(state)) {
        operations.push(operation);
        if (saveInfo !== undefined && operations.length === saveInfo.saveAt) {
            await fs.writeFile(saveInfo.filepath, JSON.stringify(operations));
        }

        try {
            state = await applyOperation(operation);
        } catch (err) {
            console.log(`Error encountered on operation number ${operations.length}`);
            if (saveInfo?.saveOnFailure === true) {
                await fs.writeFile(saveInfo.filepath, JSON.stringify(operations, undefined, 4));
            }
            throw err;
        }
    }

    return state;
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
export function performFuzzActions<TOperation extends { type: string | number; }, TState extends BaseFuzzTestState>(
    generator: Generator<TOperation, TState>,
    reducer: Reducer<TOperation, TState>,
    initialState: TState,
    saveInfo?: SaveInfo
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
export function performFuzzActions<TOperation extends { type: string | number; }, TState extends BaseFuzzTestState>(
    generator: Generator<TOperation, TState>,
    reducerMap: { [K in TOperation["type"]]: Reducer<Extract<TOperation, { type: K; }>, TState> },
    initialState: TState,
    saveInfo?: SaveInfo
): TState;
export function performFuzzActions<TOperation extends { type: string | number; }, TState extends BaseFuzzTestState>(
    generator: Generator<TOperation, TState>,
    reducerOrMap:
        | Reducer<TOperation, TState>
        | { [K in TOperation["type"]]: Reducer<Extract<TOperation, { type: K; }>, TState> },
    initialState: TState,
    saveInfo?: SaveInfo,
): TState {
    const operations: TOperation[] = [];
    let state: TState = initialState;
    const applyOperation: (operation: TOperation) => TState =
        typeof reducerOrMap === "function"
            ? (op) => reducerOrMap(state, op)
            : (op) => {
                const childReducer = reducerOrMap[op.type];
                assert(childReducer !== undefined, `Expected to find child reducer for operation type: ${op.type}`);
                const newState: TState = childReducer(state, op);
                return newState;
            };

    for (let operation = generator(state); operation !== done; operation = generator(state)) {
        operations.push(operation);
        if (saveInfo !== undefined && operations.length === saveInfo.saveAt) {
            writeFileSync(saveInfo.filepath, JSON.stringify(operations));
        }

        try {
            state = applyOperation(operation);
        } catch (err) {
            console.log(`Error encountered on operation number ${operations.length}`);
            if (saveInfo?.saveOnFailure === true) {
                writeFileSync(saveInfo.filepath, JSON.stringify(operations, undefined, 4));
            }
            throw err;
        }
    }

    return state;
}
