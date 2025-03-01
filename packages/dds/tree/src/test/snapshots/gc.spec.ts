/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { type IGCTestProvider, runGCTests } from "@fluid-private/test-dds-utils";
import { toFluidHandleInternal } from "@fluidframework/runtime-utils/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { typeboxValidator } from "../../external-utilities/index.js";
import { type ISharedTree, SharedTree } from "../../shared-tree/index.js";
import {
	SchemaFactory,
	TreeViewConfiguration,
	type TreeView,
} from "../../simple-tree/index.js";
import { TreeFactory } from "../../treeFactory.js";

const builder = new SchemaFactory("test");
class Bar extends builder.object("bar", {
	nestedHandles: builder.array(builder.handle),
}) {}
class SomeType extends builder.object("foo", {
	handles: builder.array(builder.handle),
	nested: builder.optional(Bar),
	bump: builder.optional(builder.number),
}) {}

function createConnectedTree(
	id: string,
	runtimeFactory: MockContainerRuntimeFactory,
): ISharedTree {
	const dataStoreRuntime = new MockFluidDataStoreRuntime({
		idCompressor: createIdCompressor(),
	});
	const tree = new SharedTree(id, dataStoreRuntime, new TreeFactory({}).attributes, {});
	runtimeFactory.createContainerRuntime(dataStoreRuntime);
	const services = {
		deltaConnection: dataStoreRuntime.createDeltaConnection(),
		objectStorage: new MockStorage(undefined),
	};
	tree.connect(services);
	tree.initializeLocal();
	return tree;
}

function createLocalTree(id: string): ISharedTree {
	const factory = new TreeFactory({ jsonValidator: typeboxValidator });
	return factory.create(
		new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
		id,
	);
}

describe("Garbage Collection", () => {
	class GCSequenceProvider implements IGCTestProvider {
		private treeCount = 0;
		private _expectedRoutes: string[] = [];
		private readonly containerRuntimeFactory: MockContainerRuntimeFactory;
		private readonly tree1: ISharedTree;
		private readonly view1: TreeView<typeof SomeType>;
		private get root1(): SomeType {
			return this.view1.root;
		}
		private readonly tree2: ISharedTree;

		public constructor() {
			this.containerRuntimeFactory = new MockContainerRuntimeFactory({
				useProcessMessages: true,
			});
			this.tree1 = createConnectedTree("tree1", this.containerRuntimeFactory);
			this.tree2 = createConnectedTree("tree2", this.containerRuntimeFactory);
			this.view1 = this.tree1.viewWith(new TreeViewConfiguration({ schema: SomeType }));
			this.view1.initialize({
				handles: [],
				nested: undefined,
				bump: undefined,
			});
		}

		public get sharedObject(): ISharedTree {
			return this.tree2;
		}

		public get expectedOutboundRoutes(): string[] {
			return this._expectedRoutes;
		}

		public async addOutboundRoutes(): Promise<void> {
			const subtree1 = createLocalTree(`tree-${++this.treeCount}`);
			const subtree2 = createLocalTree(`tree-${++this.treeCount}`);

			this.root1.handles.insertAtEnd(subtree1.handle, subtree2.handle);

			this._expectedRoutes.push(
				toFluidHandleInternal(subtree1.handle).absolutePath,
				toFluidHandleInternal(subtree2.handle).absolutePath,
			);
			this.containerRuntimeFactory.processAllMessages();
		}

		public async deleteOutboundRoutes(): Promise<void> {
			const root = this.root1;
			assert(root.handles.length > 0, "Route must be added before deleting");
			const lastElementIndex = root.handles.length - 1;
			// Get the handles that were last added.
			const deletedHandles = root.handles;
			// Get the routes of the handles.
			const deletedHandleRoutes = Array.from(
				deletedHandles,
				(handle) => toFluidHandleInternal(handle).absolutePath,
			);

			// Remove the last added handles.
			root.handles.removeRange(0, lastElementIndex + 1);

			this._expectedRoutes = this._expectedRoutes.filter(
				(route) => !deletedHandleRoutes.includes(route),
			);
			this.containerRuntimeFactory.processAllMessages();

			// Send an op so the minimum sequence number moves past the segment which got removed.
			// This will ensure that the segment is not part of the summary anymore.
			root.bump = 0;
			this.containerRuntimeFactory.processAllMessages();
		}

		public async addNestedHandles(): Promise<void> {
			const subtree1 = createLocalTree(`tree-${++this.treeCount}`);
			const subtree2 = createLocalTree(`tree-${++this.treeCount}`);

			this.root1.nested = new Bar({
				nestedHandles: [subtree1.handle, subtree2.handle],
			});

			this._expectedRoutes.push(
				toFluidHandleInternal(subtree1.handle).absolutePath,
				toFluidHandleInternal(subtree2.handle).absolutePath,
			);
			this.containerRuntimeFactory.processAllMessages();
		}
	}

	runGCTests(GCSequenceProvider);
});
