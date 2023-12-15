/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { IGCTestProvider, runGCTests } from "@fluid-private/test-dds-utils";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils";
import { SharedTree, SharedTreeFactory } from "../../shared-tree";
import { typeboxValidator } from "../../external-utilities";
import { SchemaFactory, TreeConfiguration } from "../../class-tree";

const builder = new SchemaFactory("test");
class SomeType extends builder.object("foo", {
	handles: builder.array(builder.handle),
	nested: builder.optional(
		builder.object("bar", {
			nestedHandles: builder.array(builder.handle),
		}),
	),
	bump: builder.optional(builder.number),
}) {}

const config = new TreeConfiguration(SomeType, () => ({
	handles: [],
	nested: undefined,
	bump: undefined,
}));

function createConnectedTree(id: string, runtimeFactory: MockContainerRuntimeFactory) {
	const dataStoreRuntime = new MockFluidDataStoreRuntime();
	const tree = new SharedTree(
		id,
		dataStoreRuntime,
		new SharedTreeFactory().attributes,
		{},
		"SharedTree",
	);
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(undefined),
	};
	tree.connect(services);
	tree.initializeLocal();
	return tree;
}

function createLocalTree(id: string) {
	const factory = new SharedTreeFactory({ jsonValidator: typeboxValidator });
	return factory.create(new MockFluidDataStoreRuntime(), id);
}

describe("Garbage Collection", () => {
	class GCSequenceProvider implements IGCTestProvider {
		private treeCount = 0;
		private _expectedRoutes: string[] = [];
		private readonly containerRuntimeFactory: MockContainerRuntimeFactory;
		private readonly tree1: SharedTree;
		private readonly tree1View;
		private readonly tree2: SharedTree;

		public constructor() {
			this.containerRuntimeFactory = new MockContainerRuntimeFactory();
			this.tree1 = createConnectedTree("tree1", this.containerRuntimeFactory);
			this.tree2 = createConnectedTree("tree2", this.containerRuntimeFactory);

			this.tree1View = this.tree1.schematize(config).root;
		}

		public get sharedObject() {
			return this.tree2;
		}

		public get expectedOutboundRoutes() {
			return this._expectedRoutes;
		}

		public async addOutboundRoutes() {
			const subtree1 = createLocalTree(`tree-${++this.treeCount}`);
			const subtree2 = createLocalTree(`tree-${++this.treeCount}`);

			this.tree1View.handles.insertAtEnd(subtree1.handle, subtree2.handle);

			this._expectedRoutes.push(subtree1.handle.absolutePath, subtree2.handle.absolutePath);
			this.containerRuntimeFactory.processAllMessages();
		}

		public async deleteOutboundRoutes() {
			assert(this.tree1View.handles.length > 0, "Route must be added before deleting");
			const lastElementIndex = this.tree1View.handles.length - 1;
			// Get the handles that were last added.
			const deletedHandles = this.tree1View.handles;
			// Get the routes of the handles.
			const deletedHandleRoutes = Array.from(deletedHandles, (handle) => handle.absolutePath);

			// Remove the last added handles.
			this.tree1View.handles.removeRange(0, lastElementIndex + 1);

			// Remove the deleted routes from expected routes.
			const skip = true;

			// TODO: ADO#4700 Currently deleted handles will never leave
			// the summary of a tree because they will be persisted forever
			// in the repair data. Eventually, repair data should be
			// automatically cleaned up after some condition, and this test
			// should be updated to hit that condition.
			if (!skip) {
				this._expectedRoutes = this._expectedRoutes.filter(
					(route) => !deletedHandleRoutes.includes(route),
				);
			}
			this.containerRuntimeFactory.processAllMessages();

			// Send an op so the minimum sequence number moves past the segment which got removed.
			// This will ensure that the segment is not part of the summary anymore.
			this.tree1View.bump = 0;
			this.containerRuntimeFactory.processAllMessages();
		}

		public async addNestedHandles() {
			const subtree1 = createLocalTree(`tree-${++this.treeCount}`);
			const subtree2 = createLocalTree(`tree-${++this.treeCount}`);

			this.tree1View.nested = {
				nestedHandles: [subtree1.handle, subtree2.handle] as any,
			};

			this._expectedRoutes.push(subtree1.handle.absolutePath, subtree2.handle.absolutePath);
			this.containerRuntimeFactory.processAllMessages();
		}
	}

	runGCTests(GCSequenceProvider);
});
