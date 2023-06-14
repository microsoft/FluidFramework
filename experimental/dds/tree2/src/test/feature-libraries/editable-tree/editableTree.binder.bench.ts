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
	FlushableBinderOptions,
	FlushableDataBinder,
	InsertBindingContext,
	InvalidationBinderEvents,
	InvalidationBindingContext,
	OperationBinderEvents,
} from "../../../feature-libraries";
import { ViewEvents } from "../../../shared-tree";
import { retrieveNodes } from "./editableTree.binder.spec";

describe("Data binder benchmarks", () => {
	describe("Direct data binder", () => {
		const { tree, root, address } = retrieveNodes();
		const bindTree: BindTree = compileSyntaxTree({ address: true });
		const options: BinderOptions = createBinderOptions({
			matchPolicy: "subtree",
		});
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
		benchmark({
			type: BenchmarkType.Measurement,
			title: `Direct data binder: single insert callback`,
			after: () => {
				dataBinder.unregisterAll();
			},
			benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
				let duration = 0;
				do {
					address.phones = [111, 112];
					const before = state.timer.now();
					await promise;
					const after = state.timer.now();
					duration = state.timer.toSeconds(before, after);
				} while (state.recordBatch(duration));
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
		benchmark({
			type: BenchmarkType.Measurement,
			title: `Invalidation data binder: single insert invalidation callback`,
			after: () => {
				dataBinder.unregisterAll();
			},
			benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
				let duration = 0;
				do {
					address.phones = [111, 112];
					const before = state.timer.now();
					await promise;
					const after = state.timer.now();
					duration = state.timer.toSeconds(before, after);
				} while (state.recordBatch(duration));
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
		const dataBinder: FlushableDataBinder<OperationBinderEvents> = createDataBinderBuffering(
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
		benchmark({
			type: BenchmarkType.Measurement,
			title: `Buffering data binder: single insert callback`,
			after: () => {
				dataBinder.unregisterAll();
			},
			benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
				let duration = 0;
				do {
					address.phones = [111, 112];
					const before = state.timer.now();
					await promise;
					const after = state.timer.now();
					duration = state.timer.toSeconds(before, after);
				} while (state.recordBatch(duration));
			},
			minBatchDurationSeconds: 0,
			maxBenchmarkDurationSeconds: 1,
		});
	});

	describe("Buffering data binder, batched notification", () => {
		const { tree, root, address } = retrieveNodes();
		const bindTree: BindTree = compileSyntaxTree({ address: true });
		const options: FlushableBinderOptions<ViewEvents> = createFlushableBinderOptions({
			autoFlushPolicy: "afterBatch",
			matchPolicy: "subtree",
		});
		const dataBinder: FlushableDataBinder<OperationBinderEvents> = createDataBinderBuffering(
			tree.events,
			options,
		);
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
		benchmark({
			type: BenchmarkType.Measurement,
			title: `Buffering data binder: batch callback`,
			after: () => {
				dataBinder.unregisterAll();
			},
			benchmarkFnCustom: async <T>(state: BenchmarkTimer<T>) => {
				let duration = 0;
				do {
					address.phones = [111, 112];
					const before = state.timer.now();
					await promise;
					const after = state.timer.now();
					duration = state.timer.toSeconds(before, after);
				} while (state.recordBatch(duration));
			},
			minBatchDurationSeconds: 0,
			maxBenchmarkDurationSeconds: 1,
		});
	});
});
