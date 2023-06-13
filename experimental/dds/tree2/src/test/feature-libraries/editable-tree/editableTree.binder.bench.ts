/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { benchmark, BenchmarkType } from "@fluid-tools/benchmark";
import {
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
	describe("Edit: baseline", () => {
		const { address } = retrieveNodes();
		benchmark({
			type: BenchmarkType.Measurement,
			title: `Edit baseline performance: no data binder`,
			benchmarkFn: () => {
				address.phones = [111, 112];
			},
		});
	});

	describe("Direct data binder, incl. edit", () => {
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
			title: `Direct data binder: insert callback`,
			after: () => {
				dataBinder.unregisterAll();
			},
			benchmarkFnAsync: async () => {
				address.phones = [111, 112];
				await promise;
			},
		});
	});

	describe("Invalidation data binder, incl. edit", () => {
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
			title: `Invalidation data binder: invalidation callback`,
			after: () => {
				dataBinder.unregisterAll();
			},
			benchmarkFnAsync: async () => {
				address.phones = [111, 112];
				await promise;
			},
		});
	});

	describe("Buffering data binder, incl edit", () => {
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
			title: `Buffering data binder: insert callback`,
			after: () => {
				dataBinder.unregisterAll();
			},
			benchmarkFnAsync: async () => {
				address.phones = [111, 112];
				await promise;
			},
		});
	});
});
