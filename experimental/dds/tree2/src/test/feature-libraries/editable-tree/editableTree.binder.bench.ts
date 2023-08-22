/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmark, BenchmarkTimer, BenchmarkType } from "@fluid-tools/benchmark";
import {
	BatchBindingContext,
	BinderOptions,
	BindingType,
	BindTree,
	compileSyntaxTree,
	createBinderOptions,
	createDataBinderBuffering,
	createDataBinderDirect,
	createDataBinderInvalidating,
	createFlushableBinderOptions,
	DataBinder,
	EditableTree,
	FlushableBinderOptions,
	FlushableDataBinder,
	InsertBindingContext,
	InvalidationBinderEvents,
	InvalidationBindingContext,
	OperationBinderEvents,
	setField,
} from "../../../feature-libraries";
import { ViewEvents } from "../../../shared-tree";
import { fieldPhones, retrieveNodes } from "./editableTree.binder.spec";

describe("Data binder benchmarks", () => {
	describe("Direct data binder", () => {
		// TODO: Do not create shared trees during test enumeration.
		const { tree, root, address } = retrieveNodes();
		const bindTree: BindTree = compileSyntaxTree({ address: true });
		const options: BinderOptions = createBinderOptions({
			matchPolicy: "subtree",
		});
		benchmark({
			type: BenchmarkType.Measurement,
			title: `Direct data binder: single insert callback`,
			benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
				let time = 0;
				do {
					const dataBinder: DataBinder<OperationBinderEvents> = createDataBinderDirect(
						tree.events,
						options,
					);
					const promise = new Promise<void>((resolve) => {
						dataBinder.register(
							root,
							BindingType.Insert,
							[bindTree],
							(insertContext: InsertBindingContext) => {
								resolve();
							},
						);
					});
					time = await computeTime<T>(state, address, promise, dataBinder);
				} while (state.recordBatch(time));
			},
			minBatchDurationSeconds: 0,
			maxBenchmarkDurationSeconds: 1,
		});
	});

	describe("Invalidation data binder", () => {
		const { tree, root, address } = retrieveNodes();
		const bindTree: BindTree = compileSyntaxTree({ address: true });
		const options: FlushableBinderOptions<ViewEvents> = createFlushableBinderOptions({
			autoFlushPolicy: "afterBatch",
			matchPolicy: "subtree",
		});
		benchmark({
			type: BenchmarkType.Measurement,
			title: `Invalidation data binder: single insert invalidation callback`,
			benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
				let time = 0;
				do {
					const dataBinder: FlushableDataBinder<InvalidationBinderEvents> =
						createDataBinderInvalidating(tree.events, options);
					const promise = new Promise<void>((resolve) => {
						dataBinder.register(
							root,
							BindingType.Invalidation,
							[bindTree],
							(insertContext: InvalidationBindingContext) => {
								resolve();
							},
						);
					});
					time = await computeTime<T>(state, address, promise, dataBinder);
				} while (state.recordBatch(time));
			},
			minBatchDurationSeconds: 0,
			maxBenchmarkDurationSeconds: 1,
		});
	});

	describe("Buffering data binder", () => {
		const { tree, root, address } = retrieveNodes();
		const bindTree: BindTree = compileSyntaxTree({ address: true });
		const options: FlushableBinderOptions<ViewEvents> = createFlushableBinderOptions({
			autoFlushPolicy: "afterBatch",
			matchPolicy: "subtree",
		});
		benchmark({
			type: BenchmarkType.Measurement,
			title: `Buffering data binder: single insert callback`,
			benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
				let time = 0;
				do {
					const dataBinder: FlushableDataBinder<OperationBinderEvents> =
						createDataBinderBuffering(tree.events, options);
					const promise = new Promise<void>((resolve) => {
						dataBinder.register(
							root,
							BindingType.Insert,
							[bindTree],
							(insertContext: InsertBindingContext) => {
								resolve();
							},
						);
					});
					time = await computeTime<T>(state, address, promise, dataBinder);
				} while (state.recordBatch(time));
			},
			minBatchDurationSeconds: 0,
			maxBenchmarkDurationSeconds: 1,
		});
	});

	for (const listeners of [10, 50, 100, 500, 1000]) {
		describe(`Buffering data binder, invoke ${listeners} listener of ${2 * listeners}`, () => {
			const { tree, root, address } = retrieveNodes();
			const bindTree: BindTree = compileSyntaxTree({ address: true });
			const options: FlushableBinderOptions<ViewEvents> = createFlushableBinderOptions({
				autoFlushPolicy: "afterBatch",
				matchPolicy: "subtree",
			});
			benchmark({
				type: BenchmarkType.Measurement,
				title: `Buffering data binder: single insert callback, invoke  ${listeners} listener of ${
					2 * listeners
				}`,
				benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
					let time = 0;
					do {
						const dataBinder: FlushableDataBinder<OperationBinderEvents> =
							createDataBinderBuffering(tree.events, options);
						registerLoop(listeners, dataBinder, root, bindTree);
						const promise = new Promise<void>((resolve) => {
							dataBinder.register(
								root,
								BindingType.Insert,
								[bindTree],
								(insertContext: InsertBindingContext) => {
									resolve();
								},
							);
						});
						registerLoop(listeners, dataBinder, root, bindTree);
						time = await computeTime<T>(state, address, promise, dataBinder);
					} while (state.recordBatch(time));
				},
				minBatchDurationSeconds: 0,
				maxBenchmarkDurationSeconds: 2,
			});
		});
	}
	describe("Buffering data binder, batched notification", () => {
		// TODO: Do not create shared trees during test enumeration.
		const { tree, root, address } = retrieveNodes();
		const bindTree: BindTree = compileSyntaxTree({ address: true });
		const options: FlushableBinderOptions<ViewEvents> = createFlushableBinderOptions({
			autoFlushPolicy: "afterBatch",
			matchPolicy: "subtree",
		});
		benchmark({
			type: BenchmarkType.Measurement,
			title: `Buffering data binder: batch callback`,
			benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
				let time = 0;
				do {
					const dataBinder: FlushableDataBinder<OperationBinderEvents> =
						createDataBinderBuffering(tree.events, options);
					dataBinder.register(root, BindingType.Insert, [bindTree]);
					const promise = new Promise<void>((resolve) => {
						dataBinder.register(
							root,
							BindingType.Batch,
							[bindTree],
							(batchContext: BatchBindingContext) => {
								resolve();
							},
						);
					});
					time = await computeTime<T>(state, address, promise, dataBinder);
				} while (state.recordBatch(time));
			},
			minBatchDurationSeconds: 0,
			maxBenchmarkDurationSeconds: 1,
		});
	});
});
function registerLoop(
	listeners: number,
	dataBinder: FlushableDataBinder<OperationBinderEvents>,
	root: EditableTree,
	bindTree: BindTree,
) {
	for (let i = 0; i < listeners; i++) {
		dataBinder.register(
			root,
			BindingType.Insert,
			[bindTree],
			(insertContext: InsertBindingContext) => {},
		);
	}
}

async function computeTime<T>(
	state: BenchmarkTimer<T>,
	address: EditableTree,
	promise: Promise<void>,
	dataBinder: DataBinder<OperationBinderEvents>,
) {
	const before1 = state.timer.now();
	address[setField](fieldPhones, [111, 112]);
	await promise;
	const after1 = state.timer.now();
	const duration1 = state.timer.toSeconds(before1, after1);
	dataBinder.unregisterAll();
	const before2 = state.timer.now();
	address[setField](fieldPhones, [111, 112]);
	const after2 = state.timer.now();
	const duration2 = state.timer.toSeconds(before2, after2);
	return duration1 - duration2;
}
