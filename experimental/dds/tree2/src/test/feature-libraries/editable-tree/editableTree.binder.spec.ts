/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { AllowedUpdateType, FieldKey } from "../../../core";
import {
	ContextuallyTypedNodeData,
	getField,
	BindPath,
	BindingType,
	toBindPath,
	InsertBindingContext,
	DeleteBindingContext,
	BindingContext,
	FlushableDataBinder,
	BinderOptions,
	FlushableBinderOptions,
	createDataBinderBuffering,
	createFlushableBinderOptionsDefault,
	createFlushableBinderOptionsSubtree,
	createDataBinderInvalidate,
	createDataBinderDirect,
	InvalidStateBindingContext,
	DataBinder,
	InvalidationBinderEvents,
	OperationBinderEvents,
} from "../../../feature-libraries";
import { brand } from "../../../util";
import { ISharedTreeView, SharedTreeFactory, ViewEvents } from "../../../shared-tree";
import { fullSchemaData, personData } from "./mockData";

const fieldAddress: FieldKey = brand("address");
const fieldZip: FieldKey = brand("zip");
const fieldStreet: FieldKey = brand("street");
const fieldPhones: FieldKey = brand("phones");
const fieldSequencePhones: FieldKey = brand("sequencePhones");

describe("editable-tree: data binder", () => {
	describe("buffering data binder", () => {
		it("registers to root, enables autoFlush, matches paths incl. index", () => {
			const { tree, root, address } = retrieveNodes();
			const insertPaths: BindPath[] = [
				[
					{ field: fieldAddress, index: 0 },
					{ field: fieldZip, index: 1 },
				],
			];
			const deletePaths: BindPath[] = [
				[
					{ field: fieldAddress, index: 0 },
					{ field: fieldZip, index: 0 },
				],
			];
			const options: FlushableBinderOptions<ViewEvents> =
				createFlushableBinderOptionsDefault("afterBatch");
			const dataBinder: FlushableDataBinder<OperationBinderEvents> =
				createDataBinderBuffering(tree.events, options);
			const insertLog: BindPath[] = [];
			dataBinder.register(
				root,
				BindingType.Insert,
				insertPaths,
				({ path, content }: InsertBindingContext) => {
					const downPath: BindPath = toBindPath(path);
					insertLog.push(downPath);
				},
			);
			const deleteLog: BindPath[] = [];
			dataBinder.register(
				root,
				BindingType.Delete,
				deletePaths,
				({ path, count }: DeleteBindingContext) => {
					const downPath: BindPath = toBindPath(path);
					deleteLog.push(downPath);
				},
			);
			address.zip = "33428";
			assert.deepEqual(insertLog, [
				[
					{ field: fieldAddress, index: 0 },
					{ field: fieldZip, index: 1 },
				],
			]);
			assert.deepEqual(deleteLog, [
				[
					{ field: fieldAddress, index: 0 },
					{ field: fieldZip, index: 0 },
				],
			]);
			// unsubscribe all bindings
			insertLog.length = 0;
			deleteLog.length = 0;
			dataBinder.unregister();
			address.zip = "85521";
			assert.deepEqual(insertLog, []);
			assert.deepEqual(deleteLog, []);
		});

		it("registers to node other than root, enables autoFlush, matches paths incl. index", () => {
			const { tree, root, address } = retrieveNodes();
			const insertPaths: BindPath[] = [
				[
					{ field: fieldAddress, index: 0 },
					{ field: fieldZip, index: 1 },
				],
			];
			const options: FlushableBinderOptions<ViewEvents> =
				createFlushableBinderOptionsDefault("afterBatch");
			const dataBinder: FlushableDataBinder<OperationBinderEvents> =
				createDataBinderBuffering(tree.events, options);
			const insertLog: BindPath[] = [];
			dataBinder.register(
				address,
				BindingType.Insert,
				insertPaths,
				({ path, content }: InsertBindingContext) => {
					const downPath: BindPath = toBindPath(path);
					insertLog.push(downPath);
				},
			);
			address.zip = "33428";
			assert.deepEqual(insertLog, [
				[
					{ field: fieldAddress, index: 0 },
					{ field: fieldZip, index: 1 },
				],
			]);
			insertLog.length = 0;
			dataBinder.unregister();
			address.zip = "85521";
			assert.deepEqual(insertLog, []);
		});

		it("registers to root, enables autoFlush, matches paths with any index", () => {
			const { tree, root, address } = retrieveNodes();
			const insertPaths: BindPath[] = [[{ field: fieldAddress }, { field: fieldZip }]];
			const options: FlushableBinderOptions<ViewEvents> =
				createFlushableBinderOptionsDefault("afterBatch");
			const dataBinder: FlushableDataBinder<OperationBinderEvents> =
				createDataBinderBuffering(tree.events, options);
			const log: BindPath[] = [];
			dataBinder.register(
				root,
				BindingType.Insert,
				insertPaths,
				({ path, content }: InsertBindingContext) => {
					const downPath: BindPath = toBindPath(path);
					log.push(downPath);
				},
			);
			address.zip = "33428";
			assert.deepEqual(log, [
				[
					{ field: fieldAddress, index: 0 },
					{ field: fieldZip, index: 1 },
				],
			]);
			dataBinder.unregister();
			log.length = 0;
			address.zip = "92629";
			assert.deepEqual(log, []);
		});

		it("registers to root, matches paths with subtree policy and any index, sorts using a prescribed order. Flush method called directly.", () => {
			const { tree, root, address } = retrieveNodes();
			const insertPaths: BindPath[] = [[{ field: fieldAddress }]];
			const prescribeOrder = [fieldZip, fieldStreet, fieldPhones, fieldSequencePhones];
			const options: FlushableBinderOptions<ViewEvents> = {
				matchPolicy: "subtree",
				autoFlush: false,
				autoFlushPolicy: "afterBatch",
				sortFn: (a: BindingContext, b: BindingContext) => {
					const aIndex = prescribeOrder.indexOf(a.path.parentField);
					const bIndex = prescribeOrder.indexOf(b.path.parentField);
					return aIndex - bIndex;
				},
			};
			const dataBinder: FlushableDataBinder<OperationBinderEvents> =
				createDataBinderBuffering(tree.events, options);
			const log: BindPath[] = [];
			dataBinder.register(
				root,
				BindingType.Insert,
				insertPaths,
				(insertContext: InsertBindingContext) => {
					const downPath: BindPath = toBindPath(insertContext.path);
					log.push(downPath);
				},
			);
			address.phones = [111, 112];
			address.sequencePhones = ["111", "112"];
			address.zip = "33428";
			address.street = "street 1";
			// manual flush
			dataBinder.flush();
			const expectedLog = [
				[
					{
						field: fieldAddress,
						index: 0,
					},
					{ field: fieldZip, index: 1 },
				],
				[
					{
						field: fieldAddress,
						index: 0,
					},
					{ field: fieldStreet, index: 1 },
				],
				[
					{
						field: fieldAddress,
						index: 0,
					},
					{ field: fieldPhones, index: 1 },
				],
				[
					{
						field: fieldAddress,
						index: 0,
					},
					{ field: fieldSequencePhones, index: 0 },
				],
			];
			assert.deepEqual(log, expectedLog);
			dataBinder.unregister();
			log.length = 0;
			address.sequencePhones = ["114", "115"];
			assert.deepEqual(log, []);
		});
	});

	describe("invalidating state data binder", () => {
		it("registers to root, enables autoFlush, matches paths with subtree policy and any index.", () => {
			const { tree, root, address } = retrieveNodes();
			const insertPaths: BindPath[] = [[{ field: fieldAddress }]];
			const options: FlushableBinderOptions<ViewEvents> =
				createFlushableBinderOptionsSubtree("afterBatch");
			const dataBinder: FlushableDataBinder<InvalidationBinderEvents> =
				createDataBinderInvalidate(tree.events, options);
			let invalidationCount = 0;
			dataBinder.register(
				root,
				BindingType.InvalidState,
				insertPaths,
				(invalidStateContext: InvalidStateBindingContext) => {
					invalidationCount++;
				},
			);
			address.phones = [111, 112];
			assert.equal(invalidationCount, 1);
			dataBinder.unregister();
			invalidationCount = 0;
			address.phones = [113, 114];
			assert.equal(invalidationCount, 0);
		});
	});

	describe("direct data binder", () => {
		it("registers to root, enables autoFlush, matches paths with subtree policy and any index.", () => {
			const { tree, root, address } = retrieveNodes();
			const insertPaths: BindPath[] = [[{ field: fieldAddress }]];
			const options: BinderOptions = { matchPolicy: "subtree" };
			const dataBinder: DataBinder<OperationBinderEvents> = createDataBinderDirect(
				tree.events,
				options,
			);
			const log: BindPath[] = [];
			dataBinder.register(
				root,
				BindingType.Insert,
				insertPaths,
				(insertContext: InsertBindingContext) => {
					const downPath: BindPath = toBindPath(insertContext.path);
					log.push(downPath);
				},
			);
			address.phones = [111, 112];
			assert.deepEqual(log, [
				[
					{ field: fieldAddress, index: 0 },
					{ field: fieldPhones, index: 1 },
				],
			]);
			dataBinder.unregister();
			log.length = 0;
			address.zip = "92629";
			assert.deepEqual(log, []);
		});
	});
});

function retrieveNodes() {
	const tree = treeView(personData);
	const root = tree.context.root.getNode(0);
	const address = root[getField](fieldAddress).getNode(0);
	const phones = address[getField](fieldSequencePhones);
	return { tree, root, address, phones };
}

function treeView(initialData: ContextuallyTypedNodeData): ISharedTreeView {
	const factory = new SharedTreeFactory();
	const tree = factory.create(new MockFluidDataStoreRuntime(), "test");
	return tree.schematize({
		allowedSchemaModifications: AllowedUpdateType.None,
		initialTree: initialData,
		schema: fullSchemaData,
	});
}
