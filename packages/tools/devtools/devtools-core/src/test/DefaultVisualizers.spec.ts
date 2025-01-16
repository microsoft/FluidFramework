/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Required for testing support of null values

/* eslint-disable unicorn/no-null */

import { SharedCell, type ISharedCell } from "@fluidframework/cell/internal";
import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter/internal";
import { createIdCompressor } from "@fluidframework/id-compressor/internal";
import { SharedDirectory, SharedMap } from "@fluidframework/map/internal";
import { SharedMatrix } from "@fluidframework/matrix/internal";
import { SharedString } from "@fluidframework/sequence/internal";
import type { ISharedObject } from "@fluidframework/shared-object-base/internal";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";
import { SharedTree } from "@fluidframework/tree/internal";
import { expect } from "chai";

import { EditType, type FluidObjectId } from "../CommonInterfaces.js";
import {
	type FluidObjectTreeNode,
	type FluidObjectValueNode,
	type FluidUnknownObjectNode,
	type VisualChildNode,
	VisualNodeKind,
	visualizeChildData as visualizeChildDataBase,
	visualizeSharedCell,
	visualizeSharedCounter,
	visualizeSharedDirectory,
	visualizeSharedMap,
	visualizeSharedMatrix,
	visualizeSharedString,
	visualizeSharedTree,
	visualizeUnknownSharedObject,
} from "../data-visualization/index.js";

/**
 * Mock {@link VisualizeChildData} for use in tests
 */
async function visualizeChildData(data: unknown): Promise<VisualChildNode> {
	async function resolveHandle(handle: IFluidHandle): Promise<FluidObjectId> {
		const resolvedObject = await handle.get();
		return (resolvedObject as ISharedObject)?.id;
	}

	return visualizeChildDataBase(data, resolveHandle);
}

describe("DefaultVisualizers unit tests", () => {
	it("SharedCell (Primitive data)", async () => {
		const runtime = new MockFluidDataStoreRuntime({ registry: [SharedCell.getFactory()] });
		const sharedCell = SharedCell.create(runtime, "test-cell") as ISharedCell<string>;

		const result = await visualizeSharedCell(sharedCell, visualizeChildData);

		const expected: FluidObjectValueNode = {
			fluidObjectId: sharedCell.id,
			value: undefined,
			typeMetadata: "SharedCell",
			nodeKind: VisualNodeKind.FluidValueNode,
			editProps: {
				editTypes: undefined,
			},
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedCell (JSON data)", async () => {
		const runtime = new MockFluidDataStoreRuntime({ registry: [SharedCell.getFactory()] });
		const sharedCell = SharedCell.create(runtime, "test-cell") as ISharedCell<object>;

		sharedCell.set({ test: undefined });

		const result = await visualizeSharedCell(sharedCell, visualizeChildData);

		const expected: FluidObjectTreeNode = {
			fluidObjectId: sharedCell.id,
			children: {
				test: {
					nodeKind: VisualNodeKind.ValueNode,
					typeMetadata: "undefined",
					value: undefined,
				},
			},
			nodeKind: VisualNodeKind.FluidTreeNode,
			typeMetadata: "SharedCell",
			editProps: {
				editTypes: undefined,
			},
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedCounter", async () => {
		const runtime = new MockFluidDataStoreRuntime({ registry: [SharedCounter.getFactory()] });
		const sharedCounter = SharedCounter.create(runtime, "test-counter");
		sharedCounter.increment(37);

		const result = await visualizeSharedCounter(sharedCounter, visualizeChildData);

		const expected: FluidObjectValueNode = {
			fluidObjectId: sharedCounter.id,
			value: 37,
			typeMetadata: "SharedCounter",
			nodeKind: VisualNodeKind.FluidValueNode,
			editProps: { editTypes: [EditType.Number] },
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedDirectory", async () => {
		const runtime = new MockFluidDataStoreRuntime({
			registry: [SharedDirectory.getFactory()],
		});
		const sharedDirectory = SharedDirectory.create(runtime, "test-directory");

		sharedDirectory.set("foo", 37);
		sharedDirectory.set("bar", false);
		sharedDirectory.set("baz", {
			a: "Hello",
			b: "World",
			c: undefined,
		});

		const subDirectoryA = sharedDirectory.createSubDirectory("a");
		subDirectoryA.set("1", null);
		const subDirectoryB = sharedDirectory.createSubDirectory("b");
		const subDirectoryBC = subDirectoryB.createSubDirectory("c");
		subDirectoryBC.set("Meaning of life", 42);

		const result = await visualizeSharedDirectory(sharedDirectory, visualizeChildData);

		const expected: FluidObjectTreeNode = {
			fluidObjectId: sharedDirectory.id,
			children: {
				a: {
					children: {
						"1": {
							value: null,
							typeMetadata: "null",
							nodeKind: VisualNodeKind.ValueNode,
						},
					},
					typeMetadata: "IDirectory",
					metadata: {
						"absolute-path": "/a",
						"sub-directories": 0,
						"values": 1,
					},
					nodeKind: VisualNodeKind.TreeNode,
				},
				b: {
					children: {
						c: {
							children: {
								"Meaning of life": {
									value: 42,
									typeMetadata: "number",
									nodeKind: VisualNodeKind.ValueNode,
								},
							},
							typeMetadata: "IDirectory",
							metadata: {
								"absolute-path": "/b/c",
								"sub-directories": 0,
								"values": 1,
							},
							nodeKind: VisualNodeKind.TreeNode,
						},
					},
					typeMetadata: "IDirectory",
					metadata: {
						"absolute-path": "/b",
						"sub-directories": 1,
						"values": 0,
					},
					nodeKind: VisualNodeKind.TreeNode,
				},
				foo: {
					value: 37,
					typeMetadata: "number",
					nodeKind: VisualNodeKind.ValueNode,
				},
				bar: {
					value: false,
					typeMetadata: "boolean",
					nodeKind: VisualNodeKind.ValueNode,
				},
				baz: {
					children: {
						a: {
							value: "Hello",
							typeMetadata: "string",
							nodeKind: VisualNodeKind.ValueNode,
						},
						b: {
							value: "World",
							typeMetadata: "string",
							nodeKind: VisualNodeKind.ValueNode,
						},
						c: {
							value: undefined,
							typeMetadata: "undefined",
							nodeKind: VisualNodeKind.ValueNode,
						},
					},
					typeMetadata: "object",
					nodeKind: VisualNodeKind.TreeNode,
				},
			},
			metadata: {
				"absolute-path": "/",
				"sub-directories": 2,
				"values": 3,
			},
			typeMetadata: "SharedDirectory",
			nodeKind: VisualNodeKind.FluidTreeNode,
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedMap", async () => {
		const runtime = new MockFluidDataStoreRuntime({ registry: [SharedMap.getFactory()] });
		const sharedMap = SharedMap.create(runtime, "test-map");
		sharedMap.set("foo", 42);
		sharedMap.set("bar", true);
		sharedMap.set("baz", {
			a: "Hello",
			b: "World",
			c: undefined,
		});

		const result = await visualizeSharedMap(sharedMap, visualizeChildData);

		const expected: FluidObjectTreeNode = {
			fluidObjectId: sharedMap.id,
			children: {
				foo: {
					value: 42,
					typeMetadata: "number",
					nodeKind: VisualNodeKind.ValueNode,
				},
				bar: {
					value: true,
					typeMetadata: "boolean",
					nodeKind: VisualNodeKind.ValueNode,
				},
				baz: {
					children: {
						a: {
							value: "Hello",
							typeMetadata: "string",
							nodeKind: VisualNodeKind.ValueNode,
						},
						b: {
							value: "World",
							typeMetadata: "string",
							nodeKind: VisualNodeKind.ValueNode,
						},
						c: {
							value: undefined,
							typeMetadata: "undefined",
							nodeKind: VisualNodeKind.ValueNode,
						},
					},
					typeMetadata: "object",
					nodeKind: VisualNodeKind.TreeNode,
				},
			},
			metadata: {
				size: 3,
			},
			typeMetadata: "SharedMap",
			nodeKind: VisualNodeKind.FluidTreeNode,
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedMatrix", async () => {
		const runtime = new MockFluidDataStoreRuntime({ registry: [SharedMatrix.getFactory()] });
		const sharedMatrix = SharedMatrix.create(runtime, "test-matrix");
		sharedMatrix.insertRows(0, 2);
		sharedMatrix.insertCols(0, 3);
		sharedMatrix.setCell(0, 0, "Hello");
		sharedMatrix.setCell(0, 1, "World");
		sharedMatrix.setCell(0, 2, undefined);
		sharedMatrix.setCell(1, 0, 1);
		sharedMatrix.setCell(1, 1, true);
		sharedMatrix.setCell(1, 2, {
			a: null,
			b: undefined,
			c: false,
		});

		const result = await visualizeSharedMatrix(
			sharedMatrix as unknown as ISharedObject,
			visualizeChildData,
		);

		const expected: FluidObjectTreeNode = {
			fluidObjectId: "test-matrix",
			children: {
				"[0,0]": {
					value: "Hello",
					nodeKind: VisualNodeKind.ValueNode,
					typeMetadata: "string",
				},
				"[0,1]": {
					value: "World",
					nodeKind: VisualNodeKind.ValueNode,
					typeMetadata: "string",
				},
				"[0,2]": {
					value: undefined,
					nodeKind: VisualNodeKind.ValueNode,
					typeMetadata: "undefined",
				},
				"[1,0]": {
					value: 1,
					nodeKind: VisualNodeKind.ValueNode,
					typeMetadata: "number",
				},
				"[1,1]": {
					value: true,
					nodeKind: VisualNodeKind.ValueNode,
					typeMetadata: "boolean",
				},
				"[1,2]": {
					children: {
						a: {
							value: null,
							nodeKind: VisualNodeKind.ValueNode,
							typeMetadata: "null",
						},
						b: {
							value: undefined,
							nodeKind: VisualNodeKind.ValueNode,
							typeMetadata: "undefined",
						},
						c: {
							value: false,
							nodeKind: VisualNodeKind.ValueNode,
							typeMetadata: "boolean",
						},
					},
					typeMetadata: "object",
					nodeKind: VisualNodeKind.TreeNode,
				},
			},
			metadata: {
				rows: 2,
				columns: 3,
			},
			typeMetadata: "SharedMatrix",
			nodeKind: VisualNodeKind.FluidTreeNode,
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedString", async () => {
		const runtime = new MockFluidDataStoreRuntime({ registry: [SharedString.getFactory()] });
		const sharedString = SharedString.create(runtime, "test-string");
		sharedString.insertText(0, "Hello World!");

		const result = await visualizeSharedString(sharedString, visualizeChildData);

		const expected: FluidObjectValueNode = {
			fluidObjectId: sharedString.id,
			value: "Hello World!",
			typeMetadata: "SharedString",
			nodeKind: VisualNodeKind.FluidValueNode,
			editProps: { editTypes: [EditType.String] },
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedTree: Single Leaf Value", async () => {
		const factory = SharedTree.getFactory();
		const builder = new SchemaFactory("shared-tree-test");

		const sharedTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"test",
		);

		const view = sharedTree.viewWith(new TreeViewConfiguration({ schema: builder.number }));
		view.initialize(0);

		const result = await visualizeSharedTree(
			sharedTree as unknown as ISharedObject,
			visualizeChildData,
		);

		const expected = {
			value: 0,
			nodeKind: "FluidValueNode",
			tooltipContents: {
				schema: {
					nodeKind: "TreeNode",
					children: {
						name: {
							nodeKind: "ValueNode",
							value: "com.fluidframework.leaf.number",
						},
					},
				},
			},
			fluidObjectId: "test",
			typeMetadata: "SharedTree",
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedTree: Array of Leaves", async () => {
		const factory = SharedTree.getFactory();
		const builder = new SchemaFactory("shared-tree-test");

		const sharedTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"test",
		);

		class RootNodeSchema extends builder.object("root-item", {
			foo: builder.array([builder.number, builder.string]),
		}) {}

		const view = sharedTree.viewWith(new TreeViewConfiguration({ schema: RootNodeSchema }));
		view.initialize(
			new RootNodeSchema({
				foo: [0, 1, 2, 3, "hello", "world"],
			}),
		);

		const result = await visualizeSharedTree(
			sharedTree as unknown as ISharedObject,
			visualizeChildData,
		);

		const expected = {
			children: {
				foo: {
					children: {
						"0": {
							value: 0,
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.number",
										},
									},
								},
							},
						},
						"1": {
							value: 1,
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.number",
										},
									},
								},
							},
						},
						"2": {
							value: 2,
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.number",
										},
									},
								},
							},
						},
						"3": {
							value: 3,
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.number",
										},
									},
								},
							},
						},
						"4": {
							value: "hello",
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.string",
										},
									},
								},
							},
						},
						"5": {
							value: "world",
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.string",
										},
									},
								},
							},
						},
					},
					nodeKind: "TreeNode",
					tooltipContents: {
						schema: {
							nodeKind: "TreeNode",
							children: {
								name: {
									nodeKind: "ValueNode",
									value:
										'shared-tree-test.Array<["com.fluidframework.leaf.number","com.fluidframework.leaf.string"]>',
								},
								allowedTypes: {
									value: "com.fluidframework.leaf.number | com.fluidframework.leaf.string",
									nodeKind: "ValueNode",
								},
							},
						},
					},
				},
			},
			nodeKind: "FluidTreeNode",
			tooltipContents: {
				schema: {
					nodeKind: "TreeNode",
					children: {
						name: {
							nodeKind: "ValueNode",
							value: "shared-tree-test.root-item",
						},
						allowedTypes: {
							value:
								'{ foo : shared-tree-test.Array<["com.fluidframework.leaf.number","com.fluidframework.leaf.string"]> }',
							nodeKind: "ValueNode",
						},
					},
				},
			},
			fluidObjectId: "test",
			typeMetadata: "SharedTree",
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedTree: Map", async () => {
		const factory = SharedTree.getFactory();
		const builder = new SchemaFactory("shared-tree-test");

		const sharedTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"test",
		);

		class RootNodeSchema extends builder.object("root-item", {
			foo: builder.map([builder.string, builder.number, builder.handle]),
		}) {}

		const view = sharedTree.viewWith(new TreeViewConfiguration({ schema: RootNodeSchema }));
		view.initialize(
			new RootNodeSchema({
				foo: new Map([
					["apple", 1],
					["banana", 2],
					["cherry", 3],
				]),
			}),
		);

		const result = await visualizeSharedTree(
			sharedTree as unknown as ISharedObject,
			visualizeChildData,
		);

		const expected = {
			children: {
				foo: {
					children: {
						apple: {
							value: 1,
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.number",
										},
									},
								},
							},
						},
						banana: {
							value: 2,
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.number",
										},
									},
								},
							},
						},
						cherry: {
							value: 3,
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.number",
										},
									},
								},
							},
						},
					},
					nodeKind: "TreeNode",
					tooltipContents: {
						schema: {
							nodeKind: "TreeNode",
							children: {
								name: {
									nodeKind: "ValueNode",
									value:
										'shared-tree-test.Map<["com.fluidframework.leaf.handle","com.fluidframework.leaf.number","com.fluidframework.leaf.string"]>',
								},
								allowedTypes: {
									value:
										"Record<string, com.fluidframework.leaf.string | com.fluidframework.leaf.number | com.fluidframework.leaf.handle>",
									nodeKind: "ValueNode",
								},
							},
						},
					},
				},
			},
			nodeKind: "FluidTreeNode",
			tooltipContents: {
				schema: {
					nodeKind: "TreeNode",
					children: {
						name: {
							nodeKind: "ValueNode",
							value: "shared-tree-test.root-item",
						},
						allowedTypes: {
							value:
								'{ foo : shared-tree-test.Map<["com.fluidframework.leaf.handle","com.fluidframework.leaf.number","com.fluidframework.leaf.string"]> }',
							nodeKind: "ValueNode",
						},
					},
				},
			},
			fluidObjectId: "test",
			typeMetadata: "SharedTree",
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedTree: Object", async () => {
		const factory = SharedTree.getFactory();
		const builder = new SchemaFactory("shared-tree-test");

		const sharedTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"test",
		);

		class RootNodeSchema extends builder.object("root-item", {
			foo: builder.object("bar-item", {
				apple: builder.boolean,
				banana: builder.string,
			}),
		}) {}

		const view = sharedTree.viewWith(new TreeViewConfiguration({ schema: RootNodeSchema }));
		view.initialize(
			new RootNodeSchema({
				foo: {
					apple: false,
					banana: "Taro Bubble Tea",
				},
			}),
		);

		const result = await visualizeSharedTree(
			sharedTree as unknown as ISharedObject,
			visualizeChildData,
		);

		const expected = {
			children: {
				foo: {
					children: {
						apple: {
							value: false,
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.boolean",
										},
									},
								},
							},
						},
						banana: {
							value: "Taro Bubble Tea",
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.string",
										},
									},
								},
							},
						},
					},
					nodeKind: "TreeNode",
					tooltipContents: {
						schema: {
							nodeKind: "TreeNode",
							children: {
								name: {
									nodeKind: "ValueNode",
									value: "shared-tree-test.bar-item",
								},
								allowedTypes: {
									value:
										"{ apple : com.fluidframework.leaf.boolean, banana : com.fluidframework.leaf.string }",
									nodeKind: "ValueNode",
								},
							},
						},
					},
				},
			},
			nodeKind: "FluidTreeNode",
			tooltipContents: {
				schema: {
					nodeKind: "TreeNode",
					children: {
						name: {
							nodeKind: "ValueNode",
							value: "shared-tree-test.root-item",
						},
						allowedTypes: {
							value: "{ foo : shared-tree-test.bar-item }",
							nodeKind: "ValueNode",
						},
					},
				},
			},
			fluidObjectId: "test",
			typeMetadata: "SharedTree",
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedTree: Handle at the root", async () => {
		const factory = SharedTree.getFactory();
		const builder = new SchemaFactory("shared-tree-test");
		const runtime = new MockFluidDataStoreRuntime({ registry: [SharedString.getFactory()] });

		const sharedTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"test",
		);

		const sharedString = SharedString.create(runtime, "test-string");
		sharedString.insertText(0, "Hello World!");

		const view = sharedTree.viewWith(new TreeViewConfiguration({ schema: builder.handle }));
		view.initialize(sharedString.handle);

		const result = await visualizeSharedTree(
			sharedTree as unknown as ISharedObject,
			visualizeChildData,
		);

		const expected = {
			fluidObjectId: "test",
			nodeKind: "FluidTreeNode",
			tooltipContents: {
				schema: {
					nodeKind: "TreeNode",
					children: {
						name: {
							nodeKind: "ValueNode",
							value: "com.fluidframework.leaf.handle",
						},
					},
				},
			},
			typeMetadata: "SharedTree",
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedTree: Handle", async () => {
		const factory = SharedTree.getFactory();
		const builder = new SchemaFactory("shared-tree-test");
		const runtime = new MockFluidDataStoreRuntime({ registry: [SharedString.getFactory()] });

		const sharedTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"test",
		);

		const sharedString = SharedString.create(runtime, "test-string");
		sharedString.insertText(0, "Hello World!");

		class RootNodeSchema extends builder.object("root-item", {
			foo: builder.object("bar-item", {
				apple: builder.handle,
			}),
		}) {}

		const view = sharedTree.viewWith(new TreeViewConfiguration({ schema: RootNodeSchema }));
		view.initialize(
			new RootNodeSchema({
				foo: {
					apple: sharedString.handle,
				},
			}),
		);

		const result = await visualizeSharedTree(
			sharedTree as unknown as ISharedObject,
			visualizeChildData,
		);

		const expected = {
			children: {
				foo: {
					children: {
						apple: {
							fluidObjectId: "test-string",
							nodeKind: "FluidHandleNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.handle",
										},
									},
								},
							},
						},
					},
					nodeKind: "TreeNode",
					tooltipContents: {
						schema: {
							nodeKind: "TreeNode",
							children: {
								name: {
									nodeKind: "ValueNode",
									value: "shared-tree-test.bar-item",
								},
								allowedTypes: {
									value: "{ apple : com.fluidframework.leaf.handle }",
									nodeKind: "ValueNode",
								},
							},
						},
					},
				},
			},
			nodeKind: "FluidTreeNode",
			tooltipContents: {
				schema: {
					nodeKind: "TreeNode",
					children: {
						name: {
							nodeKind: "ValueNode",
							value: "shared-tree-test.root-item",
						},
						allowedTypes: {
							value: "{ foo : shared-tree-test.bar-item }",
							nodeKind: "ValueNode",
						},
					},
				},
			},
			fluidObjectId: "test",
			typeMetadata: "SharedTree",
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedTree: Complex Nesting", async () => {
		const factory = SharedTree.getFactory();
		const builder = new SchemaFactory("shared-tree-test");

		const sharedTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"test",
		);

		class BroccoliSchema extends builder.object("broccoli-object-schema", {
			alpaca: builder.string,
		}) {}

		class AppleSchema extends builder.object("apple-object-schema", {
			avocado: [builder.number, builder.string],
			broccoli: builder.array(BroccoliSchema),
		}) {}

		class FooSchema extends builder.object("foo-item", {
			apple: builder.array(AppleSchema),
			banana: builder.object("banana-object", {
				miniBanana: [builder.boolean, builder.string, builder.number],
			}),
			cherry: builder.optional(builder.number),
		}) {}

		class RootNodeSchema extends builder.object("root-item", {
			foo: builder.array(FooSchema),
			bar: builder.object("bar-item", {
				americano: builder.boolean,
				bubbleTea: builder.string,
				chaiLatte: builder.object("chai-latte-object", {
					appleCider: [builder.boolean, builder.string, builder.handle],
				}),
				dalgona: builder.array(
					builder.object("dalgona-object", {
						avengers: builder.boolean,
					}),
				),
				espresso: builder.array([builder.number, builder.string]),
			}),
			baz: [builder.number, builder.string, builder.boolean],
			foobar: builder.map([
				builder.string,
				builder.number,
				builder.handle,
				builder.object("map-object", { acorn: builder.boolean }),
			]),
		}) {}

		const view = sharedTree.viewWith(new TreeViewConfiguration({ schema: RootNodeSchema }));
		view.initialize(
			new RootNodeSchema({
				foo: [
					{
						apple: [{ avocado: 16, broccoli: [{ alpaca: "Llama but cuter." }] }],
						banana: {
							miniBanana: true,
						},
						cherry: 32,
					},
					{
						apple: [
							{
								avocado: "Avacado Advocate.",
								broccoli: [{ alpaca: "Llama but not LLM." }],
							},
						],
						banana: {
							miniBanana: false,
						},
						cherry: undefined,
					},
				],
				bar: {
					americano: false,
					bubbleTea: "Taro Bubble Tea",
					chaiLatte: {
						appleCider: true,
					},
					dalgona: [
						{
							avengers: true,
						},
					],
					espresso: [256, "FiveHundredTwelve"],
				},
				baz: 128,
				foobar: new Map([
					["anthropology", 1],
					["biology", 2],
					["choreography", 3],
				]),
			}),
		);

		const result = await visualizeSharedTree(
			sharedTree as unknown as ISharedObject,
			visualizeChildData,
		);

		const expected = {
			children: {
				foo: {
					children: {
						"0": {
							children: {
								apple: {
									children: {
										"0": {
											children: {
												avocado: {
													value: 16,
													nodeKind: "ValueNode",
													tooltipContents: {
														schema: {
															nodeKind: "TreeNode",
															children: {
																name: {
																	nodeKind: "ValueNode",
																	value: "com.fluidframework.leaf.number",
																},
															},
														},
													},
												},
												broccoli: {
													children: {
														"0": {
															children: {
																alpaca: {
																	value: "Llama but cuter.",
																	nodeKind: "ValueNode",
																	tooltipContents: {
																		schema: {
																			nodeKind: "TreeNode",
																			children: {
																				name: {
																					nodeKind: "ValueNode",
																					value: "com.fluidframework.leaf.string",
																				},
																			},
																		},
																	},
																},
															},
															nodeKind: "TreeNode",
															tooltipContents: {
																schema: {
																	nodeKind: "TreeNode",
																	children: {
																		name: {
																			nodeKind: "ValueNode",
																			value: "shared-tree-test.broccoli-object-schema",
																		},
																		allowedTypes: {
																			value: "{ alpaca : com.fluidframework.leaf.string }",
																			nodeKind: "ValueNode",
																		},
																	},
																},
															},
														},
													},
													nodeKind: "TreeNode",
													tooltipContents: {
														schema: {
															nodeKind: "TreeNode",
															children: {
																name: {
																	nodeKind: "ValueNode",
																	value:
																		'shared-tree-test.Array<["shared-tree-test.broccoli-object-schema"]>',
																},
																allowedTypes: {
																	value: "shared-tree-test.broccoli-object-schema",
																	nodeKind: "ValueNode",
																},
															},
														},
													},
												},
											},
											nodeKind: "TreeNode",
											tooltipContents: {
												schema: {
													nodeKind: "TreeNode",
													children: {
														name: {
															nodeKind: "ValueNode",
															value: "shared-tree-test.apple-object-schema",
														},
														allowedTypes: {
															value:
																'{ avocado : com.fluidframework.leaf.number | com.fluidframework.leaf.string, broccoli : shared-tree-test.Array<["shared-tree-test.broccoli-object-schema"]> }',
															nodeKind: "ValueNode",
														},
													},
												},
											},
										},
									},
									nodeKind: "TreeNode",
									tooltipContents: {
										schema: {
											nodeKind: "TreeNode",
											children: {
												name: {
													nodeKind: "ValueNode",
													value:
														'shared-tree-test.Array<["shared-tree-test.apple-object-schema"]>',
												},
												allowedTypes: {
													value: "shared-tree-test.apple-object-schema",
													nodeKind: "ValueNode",
												},
											},
										},
									},
								},
								banana: {
									children: {
										miniBanana: {
											value: true,
											nodeKind: "ValueNode",
											tooltipContents: {
												schema: {
													nodeKind: "TreeNode",
													children: {
														name: {
															nodeKind: "ValueNode",
															value: "com.fluidframework.leaf.boolean",
														},
													},
												},
											},
										},
									},
									nodeKind: "TreeNode",
									tooltipContents: {
										schema: {
											nodeKind: "TreeNode",
											children: {
												name: {
													nodeKind: "ValueNode",
													value: "shared-tree-test.banana-object",
												},
												allowedTypes: {
													value:
														"{ miniBanana : com.fluidframework.leaf.boolean | com.fluidframework.leaf.string | com.fluidframework.leaf.number }",
													nodeKind: "ValueNode",
												},
											},
										},
									},
								},
								cherry: {
									value: 32,
									nodeKind: "ValueNode",
									tooltipContents: {
										schema: {
											nodeKind: "TreeNode",
											children: {
												name: {
													nodeKind: "ValueNode",
													value: "com.fluidframework.leaf.number",
												},
											},
										},
									},
								},
							},
							nodeKind: "TreeNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "shared-tree-test.foo-item",
										},
										allowedTypes: {
											value:
												'{ apple : shared-tree-test.Array<["shared-tree-test.apple-object-schema"]>, banana : shared-tree-test.banana-object, cherry : com.fluidframework.leaf.number }',
											nodeKind: "ValueNode",
										},
									},
								},
							},
						},
						"1": {
							children: {
								apple: {
									children: {
										"0": {
											children: {
												avocado: {
													value: "Avacado Advocate.",
													nodeKind: "ValueNode",
													tooltipContents: {
														schema: {
															nodeKind: "TreeNode",
															children: {
																name: {
																	nodeKind: "ValueNode",
																	value: "com.fluidframework.leaf.string",
																},
															},
														},
													},
												},
												broccoli: {
													children: {
														"0": {
															children: {
																alpaca: {
																	value: "Llama but not LLM.",
																	nodeKind: "ValueNode",
																	tooltipContents: {
																		schema: {
																			nodeKind: "TreeNode",
																			children: {
																				name: {
																					nodeKind: "ValueNode",
																					value: "com.fluidframework.leaf.string",
																				},
																			},
																		},
																	},
																},
															},
															nodeKind: "TreeNode",
															tooltipContents: {
																schema: {
																	nodeKind: "TreeNode",
																	children: {
																		name: {
																			nodeKind: "ValueNode",
																			value: "shared-tree-test.broccoli-object-schema",
																		},
																		allowedTypes: {
																			value: "{ alpaca : com.fluidframework.leaf.string }",
																			nodeKind: "ValueNode",
																		},
																	},
																},
															},
														},
													},
													nodeKind: "TreeNode",
													tooltipContents: {
														schema: {
															nodeKind: "TreeNode",
															children: {
																name: {
																	nodeKind: "ValueNode",
																	value:
																		'shared-tree-test.Array<["shared-tree-test.broccoli-object-schema"]>',
																},
																allowedTypes: {
																	value: "shared-tree-test.broccoli-object-schema",
																	nodeKind: "ValueNode",
																},
															},
														},
													},
												},
											},
											nodeKind: "TreeNode",
											tooltipContents: {
												schema: {
													nodeKind: "TreeNode",
													children: {
														name: {
															nodeKind: "ValueNode",
															value: "shared-tree-test.apple-object-schema",
														},
														allowedTypes: {
															value:
																'{ avocado : com.fluidframework.leaf.number | com.fluidframework.leaf.string, broccoli : shared-tree-test.Array<["shared-tree-test.broccoli-object-schema"]> }',
															nodeKind: "ValueNode",
														},
													},
												},
											},
										},
									},
									nodeKind: "TreeNode",
									tooltipContents: {
										schema: {
											nodeKind: "TreeNode",
											children: {
												name: {
													nodeKind: "ValueNode",
													value:
														'shared-tree-test.Array<["shared-tree-test.apple-object-schema"]>',
												},
												allowedTypes: {
													value: "shared-tree-test.apple-object-schema",
													nodeKind: "ValueNode",
												},
											},
										},
									},
								},
								banana: {
									children: {
										miniBanana: {
											value: false,
											nodeKind: "ValueNode",
											tooltipContents: {
												schema: {
													nodeKind: "TreeNode",
													children: {
														name: {
															nodeKind: "ValueNode",
															value: "com.fluidframework.leaf.boolean",
														},
													},
												},
											},
										},
									},
									nodeKind: "TreeNode",
									tooltipContents: {
										schema: {
											nodeKind: "TreeNode",
											children: {
												name: {
													nodeKind: "ValueNode",
													value: "shared-tree-test.banana-object",
												},
												allowedTypes: {
													value:
														"{ miniBanana : com.fluidframework.leaf.boolean | com.fluidframework.leaf.string | com.fluidframework.leaf.number }",
													nodeKind: "ValueNode",
												},
											},
										},
									},
								},
							},
							nodeKind: "TreeNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "shared-tree-test.foo-item",
										},
										allowedTypes: {
											value:
												'{ apple : shared-tree-test.Array<["shared-tree-test.apple-object-schema"]>, banana : shared-tree-test.banana-object, cherry : com.fluidframework.leaf.number }',
											nodeKind: "ValueNode",
										},
									},
								},
							},
						},
					},
					nodeKind: "TreeNode",
					tooltipContents: {
						schema: {
							nodeKind: "TreeNode",
							children: {
								name: {
									nodeKind: "ValueNode",
									value: 'shared-tree-test.Array<["shared-tree-test.foo-item"]>',
								},
								allowedTypes: {
									value: "shared-tree-test.foo-item",
									nodeKind: "ValueNode",
								},
							},
						},
					},
				},
				bar: {
					children: {
						americano: {
							value: false,
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.boolean",
										},
									},
								},
							},
						},
						bubbleTea: {
							value: "Taro Bubble Tea",
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.string",
										},
									},
								},
							},
						},
						chaiLatte: {
							children: {
								appleCider: {
									value: true,
									nodeKind: "ValueNode",
									tooltipContents: {
										schema: {
											nodeKind: "TreeNode",
											children: {
												name: {
													nodeKind: "ValueNode",
													value: "com.fluidframework.leaf.boolean",
												},
											},
										},
									},
								},
							},
							nodeKind: "TreeNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "shared-tree-test.chai-latte-object",
										},
										allowedTypes: {
											value:
												"{ appleCider : com.fluidframework.leaf.boolean | com.fluidframework.leaf.string | com.fluidframework.leaf.handle }",
											nodeKind: "ValueNode",
										},
									},
								},
							},
						},
						dalgona: {
							children: {
								"0": {
									children: {
										avengers: {
											value: true,
											nodeKind: "ValueNode",
											tooltipContents: {
												schema: {
													nodeKind: "TreeNode",
													children: {
														name: {
															nodeKind: "ValueNode",
															value: "com.fluidframework.leaf.boolean",
														},
													},
												},
											},
										},
									},
									nodeKind: "TreeNode",
									tooltipContents: {
										schema: {
											nodeKind: "TreeNode",
											children: {
												name: {
													nodeKind: "ValueNode",
													value: "shared-tree-test.dalgona-object",
												},
												allowedTypes: {
													value: "{ avengers : com.fluidframework.leaf.boolean }",
													nodeKind: "ValueNode",
												},
											},
										},
									},
								},
							},
							nodeKind: "TreeNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: 'shared-tree-test.Array<["shared-tree-test.dalgona-object"]>',
										},
										allowedTypes: {
											value: "shared-tree-test.dalgona-object",
											nodeKind: "ValueNode",
										},
									},
								},
							},
						},
						espresso: {
							children: {
								"0": {
									value: 256,
									nodeKind: "ValueNode",
									tooltipContents: {
										schema: {
											nodeKind: "TreeNode",
											children: {
												name: {
													nodeKind: "ValueNode",
													value: "com.fluidframework.leaf.number",
												},
											},
										},
									},
								},
								"1": {
									value: "FiveHundredTwelve",
									nodeKind: "ValueNode",
									tooltipContents: {
										schema: {
											nodeKind: "TreeNode",
											children: {
												name: {
													nodeKind: "ValueNode",
													value: "com.fluidframework.leaf.string",
												},
											},
										},
									},
								},
							},
							nodeKind: "TreeNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value:
												'shared-tree-test.Array<["com.fluidframework.leaf.number","com.fluidframework.leaf.string"]>',
										},
										allowedTypes: {
											value: "com.fluidframework.leaf.number | com.fluidframework.leaf.string",
											nodeKind: "ValueNode",
										},
									},
								},
							},
						},
					},
					nodeKind: "TreeNode",
					tooltipContents: {
						schema: {
							nodeKind: "TreeNode",
							children: {
								name: {
									nodeKind: "ValueNode",
									value: "shared-tree-test.bar-item",
								},
								allowedTypes: {
									value:
										'{ americano : com.fluidframework.leaf.boolean, bubbleTea : com.fluidframework.leaf.string, chaiLatte : shared-tree-test.chai-latte-object, dalgona : shared-tree-test.Array<["shared-tree-test.dalgona-object"]>, espresso : shared-tree-test.Array<["com.fluidframework.leaf.number","com.fluidframework.leaf.string"]> }',
									nodeKind: "ValueNode",
								},
							},
						},
					},
				},
				baz: {
					value: 128,
					nodeKind: "ValueNode",
					tooltipContents: {
						schema: {
							nodeKind: "TreeNode",
							children: {
								name: {
									nodeKind: "ValueNode",
									value: "com.fluidframework.leaf.number",
								},
							},
						},
					},
				},
				foobar: {
					children: {
						anthropology: {
							value: 1,
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.number",
										},
									},
								},
							},
						},
						biology: {
							value: 2,
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.number",
										},
									},
								},
							},
						},
						choreography: {
							value: 3,
							nodeKind: "ValueNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "com.fluidframework.leaf.number",
										},
									},
								},
							},
						},
					},
					nodeKind: "TreeNode",
					tooltipContents: {
						schema: {
							nodeKind: "TreeNode",
							children: {
								name: {
									nodeKind: "ValueNode",
									value:
										'shared-tree-test.Map<["com.fluidframework.leaf.handle","com.fluidframework.leaf.number","com.fluidframework.leaf.string","shared-tree-test.map-object"]>',
								},
								allowedTypes: {
									value:
										"Record<string, com.fluidframework.leaf.string | com.fluidframework.leaf.number | com.fluidframework.leaf.handle | shared-tree-test.map-object>",
									nodeKind: "ValueNode",
								},
							},
						},
					},
				},
			},
			nodeKind: "FluidTreeNode",
			tooltipContents: {
				schema: {
					nodeKind: "TreeNode",
					children: {
						name: {
							nodeKind: "ValueNode",
							value: "shared-tree-test.root-item",
						},
						allowedTypes: {
							value:
								'{ foo : shared-tree-test.Array<["shared-tree-test.foo-item"]>, bar : shared-tree-test.bar-item, baz : com.fluidframework.leaf.number | com.fluidframework.leaf.string | com.fluidframework.leaf.boolean, foobar : shared-tree-test.Map<["com.fluidframework.leaf.handle","com.fluidframework.leaf.number","com.fluidframework.leaf.string","shared-tree-test.map-object"]> }',
							nodeKind: "ValueNode",
						},
					},
				},
			},
			fluidObjectId: "test",
			typeMetadata: "SharedTree",
		};

		expect(result).to.deep.equal(expected);
	});

	it.only("SharedTree: Renders multiple allowed types in SharedTree's root field", async () => {
		const factory = SharedTree.getFactory();
		const builder = new SchemaFactory("shared-tree-test");

		const sharedTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"test",
		);

		const view = sharedTree.viewWith(
			new TreeViewConfiguration({ schema: [builder.string, builder.number] }),
		);
		view.initialize(23);

		const result = await visualizeSharedTree(
			sharedTree as unknown as ISharedObject,
			visualizeChildData,
		);

		const expected = {
			children: {
				root: {
					value: 23,
					nodeKind: "ValueNode",
					tooltipContents: {
						schema: {
							nodeKind: "TreeNode",
							children: {
								name: {
									nodeKind: "ValueNode",
									value: "com.fluidframework.leaf.number",
								},
							},
						},
					},
				},
			},
			nodeKind: "FluidTreeNode",
			tooltipContents: {
				schema: {
					nodeKind: "TreeNode",
					children: {
						name: {
							nodeKind: "ValueNode",
							value: "root",
						},
						allowedTypes: {
							value: "com.fluidframework.leaf.string | com.fluidframework.leaf.number",
							nodeKind: "ValueNode",
						},
					},
				},
			},
			fluidObjectId: "test",
			typeMetadata: "SharedTree",
		};

		expect(result).to.deep.equal(expected);
	});

	it.only("SharedTree: Renders multiple allowed types in SharedTree's root field", async () => {
		const factory = SharedTree.getFactory();
		const builder = new SchemaFactory("shared-tree-test");

		const sharedTree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: createIdCompressor() }),
			"test",
		);

		class LeafSchema extends builder.object("leaf-item", {
			leafField: [builder.boolean, builder.handle, builder.string],
		}) {}

		class ChildSchema extends builder.object("child-item", {
			childField: [builder.string, builder.boolean],
			childData: builder.optional(LeafSchema),
		}) {}

		class RootNodeTwoItemTwo extends builder.object("root-node-two-item-two", {
			childrenOne: builder.array(ChildSchema),
			childrenTwo: builder.number,
		}) {}

		class RootNodeTwoItem extends builder.object("root-node-item", {
			childrenOne: builder.number,
			childrenTwo: RootNodeTwoItemTwo,
		}) {}

		class RootNodeOne extends builder.object("root-node-one", {
			leafField: [builder.boolean, builder.handle, builder.string],
		}) {}

		class RootNodeTwo extends builder.object("root-node-two", {
			childField: RootNodeTwoItem,
		}) {}

		const view = sharedTree.viewWith(
			new TreeViewConfiguration({
				schema: [RootNodeOne, RootNodeTwo, builder.string, builder.number],
			}),
		);

		view.initialize({
			childField: {
				childrenOne: 42,
				childrenTwo: {
					childrenOne: [
						{
							childField: false,
							childData: {
								leafField: "leaf data",
							},
						},
						{
							childField: true,
						},
					],
					childrenTwo: 123,
				},
			},
		});

		const result = await visualizeSharedTree(
			sharedTree as unknown as ISharedObject,
			visualizeChildData,
		);

		const expected = {
			children: {
				root: {
					children: {
						childField: {
							children: {
								childrenOne: {
									value: 42,
									nodeKind: "ValueNode",
									tooltipContents: {
										schema: {
											nodeKind: "TreeNode",
											children: {
												name: {
													nodeKind: "ValueNode",
													value: "com.fluidframework.leaf.number",
												},
											},
										},
									},
								},
								childrenTwo: {
									children: {
										childrenOne: {
											children: {
												"0": {
													children: {
														childField: {
															value: false,
															nodeKind: "ValueNode",
															tooltipContents: {
																schema: {
																	nodeKind: "TreeNode",
																	children: {
																		name: {
																			nodeKind: "ValueNode",
																			value: "com.fluidframework.leaf.boolean",
																		},
																	},
																},
															},
														},
														childData: {
															children: {
																leafField: {
																	value: "leaf data",
																	nodeKind: "ValueNode",
																	tooltipContents: {
																		schema: {
																			nodeKind: "TreeNode",
																			children: {
																				name: {
																					nodeKind: "ValueNode",
																					value: "com.fluidframework.leaf.string",
																				},
																			},
																		},
																	},
																},
															},
															nodeKind: "TreeNode",
															tooltipContents: {
																schema: {
																	nodeKind: "TreeNode",
																	children: {
																		name: {
																			nodeKind: "ValueNode",
																			value: "shared-tree-test.leaf-item",
																		},
																		allowedTypes: {
																			value:
																				"{ leafField : com.fluidframework.leaf.boolean | com.fluidframework.leaf.handle | com.fluidframework.leaf.string }",
																			nodeKind: "ValueNode",
																		},
																	},
																},
															},
														},
													},
													nodeKind: "TreeNode",
													tooltipContents: {
														schema: {
															nodeKind: "TreeNode",
															children: {
																name: {
																	nodeKind: "ValueNode",
																	value: "shared-tree-test.child-item",
																},
																allowedTypes: {
																	value:
																		"{ childField : com.fluidframework.leaf.string | com.fluidframework.leaf.boolean, childData : shared-tree-test.leaf-item }",
																	nodeKind: "ValueNode",
																},
															},
														},
													},
												},
												"1": {
													children: {
														childField: {
															value: true,
															nodeKind: "ValueNode",
															tooltipContents: {
																schema: {
																	nodeKind: "TreeNode",
																	children: {
																		name: {
																			nodeKind: "ValueNode",
																			value: "com.fluidframework.leaf.boolean",
																		},
																	},
																},
															},
														},
													},
													nodeKind: "TreeNode",
													tooltipContents: {
														schema: {
															nodeKind: "TreeNode",
															children: {
																name: {
																	nodeKind: "ValueNode",
																	value: "shared-tree-test.child-item",
																},
																allowedTypes: {
																	value:
																		"{ childField : com.fluidframework.leaf.string | com.fluidframework.leaf.boolean, childData : shared-tree-test.leaf-item }",
																	nodeKind: "ValueNode",
																},
															},
														},
													},
												},
											},
											nodeKind: "TreeNode",
											tooltipContents: {
												schema: {
													nodeKind: "TreeNode",
													children: {
														name: {
															nodeKind: "ValueNode",
															value: 'shared-tree-test.Array<["shared-tree-test.child-item"]>',
														},
														allowedTypes: {
															value: "shared-tree-test.child-item",
															nodeKind: "ValueNode",
														},
													},
												},
											},
										},
										childrenTwo: {
											value: 123,
											nodeKind: "ValueNode",
											tooltipContents: {
												schema: {
													nodeKind: "TreeNode",
													children: {
														name: {
															nodeKind: "ValueNode",
															value: "com.fluidframework.leaf.number",
														},
													},
												},
											},
										},
									},
									nodeKind: "TreeNode",
									tooltipContents: {
										schema: {
											nodeKind: "TreeNode",
											children: {
												name: {
													nodeKind: "ValueNode",
													value: "shared-tree-test.root-node-two-item-two",
												},
												allowedTypes: {
													value:
														'{ childrenOne : shared-tree-test.Array<["shared-tree-test.child-item"]>, childrenTwo : com.fluidframework.leaf.number }',
													nodeKind: "ValueNode",
												},
											},
										},
									},
								},
							},
							nodeKind: "TreeNode",
							tooltipContents: {
								schema: {
									nodeKind: "TreeNode",
									children: {
										name: {
											nodeKind: "ValueNode",
											value: "shared-tree-test.root-node-item",
										},
										allowedTypes: {
											value:
												"{ childrenOne : com.fluidframework.leaf.number, childrenTwo : shared-tree-test.root-node-two-item-two }",
											nodeKind: "ValueNode",
										},
									},
								},
							},
						},
					},
					nodeKind: "TreeNode",
					tooltipContents: {
						schema: {
							nodeKind: "TreeNode",
							children: {
								name: {
									nodeKind: "ValueNode",
									value: "shared-tree-test.root-node-two",
								},
								allowedTypes: {
									value: "{ childField : shared-tree-test.root-node-item }",
									nodeKind: "ValueNode",
								},
							},
						},
					},
				},
			},
			nodeKind: "FluidTreeNode",
			tooltipContents: {
				schema: {
					nodeKind: "TreeNode",
					children: {
						name: {
							nodeKind: "ValueNode",
							value: "shared-tree-test.root-node-two",
						},
						allowedTypes: {
							value:
								"shared-tree-test.root-node-one | shared-tree-test.root-node-two | com.fluidframework.leaf.string | com.fluidframework.leaf.number",
							nodeKind: "ValueNode",
						},
					},
				},
			},
			fluidObjectId: "test",
			typeMetadata: "SharedTree",
		};

		expect(result).to.deep.equal(expected);
	});

	it("Unknown SharedObject", async () => {
		// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
		const unknownObject = {
			id: "test-object-id",
			attributes: {
				type: "UnknownSharedObjectType",
			},
		} as ISharedObject;

		const result = await visualizeUnknownSharedObject(unknownObject, visualizeChildData);

		const expected: FluidUnknownObjectNode = {
			fluidObjectId: "test-object-id",
			typeMetadata: "UnknownSharedObjectType",
			nodeKind: VisualNodeKind.FluidUnknownObjectNode,
		};

		expect(result).to.deep.equal(expected);
	});
});
