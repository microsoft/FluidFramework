/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Required for testing support of null values
/* eslint-disable unicorn/no-null */

import { expect } from "chai";

import { SharedCell } from "@fluidframework/cell";
import { IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { SharedString } from "@fluidframework/sequence";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";

import { FluidObjectId } from "../CommonInterfaces";
import {
	FluidObjectTreeNode,
	FluidObjectValueNode,
	FluidUnknownObjectNode,
	VisualChildNode,
	visualizeChildData as visualizeChildDataBase,
	visualizeSharedCell,
	visualizeSharedCounter,
	visualizeSharedDirectory,
	visualizeSharedMap,
	visualizeSharedMatrix,
	visualizeSharedString,
	visualizeUnknownSharedObject,
	VisualNodeKind,
} from "../data-visualization";

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
	it("SharedCell", async () => {
		const runtime = new MockFluidDataStoreRuntime();
		const sharedCell = new SharedCell("test-cell", runtime, SharedCell.getFactory().attributes);

		const result = await visualizeSharedCell(sharedCell, visualizeChildData);

		const expected: FluidObjectTreeNode = {
			fluidObjectId: sharedCell.id,
			children: {
				data: {
					value: undefined,
					typeMetadata: "undefined",
					nodeKind: VisualNodeKind.ValueNode,
				},
			},
			typeMetadata: "SharedCell",
			nodeKind: VisualNodeKind.FluidTreeNode,
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedCounter", async () => {
		const runtime = new MockFluidDataStoreRuntime();
		const sharedCounter = new SharedCounter(
			"test-counter",
			runtime,
			SharedCounter.getFactory().attributes,
		);
		sharedCounter.increment(37);

		const result = await visualizeSharedCounter(sharedCounter, visualizeChildData);

		const expected: FluidObjectValueNode = {
			fluidObjectId: sharedCounter.id,
			value: 37,
			typeMetadata: "SharedCounter",
			nodeKind: VisualNodeKind.FluidValueNode,
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedDirectory", async () => {
		const runtime = new MockFluidDataStoreRuntime();
		const sharedDirectory = new SharedDirectory(
			"test-directory",
			runtime,
			SharedDirectory.getFactory().attributes,
		);
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
		const runtime = new MockFluidDataStoreRuntime();
		const sharedMap = new SharedMap("test-map", runtime, SharedMap.getFactory().attributes);
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
		const runtime = new MockFluidDataStoreRuntime();
		const sharedMatrix = new SharedMatrix(
			runtime,
			"test-matrix",
			SharedMatrix.getFactory().attributes,
		);
		sharedMatrix.insertRows(0, 2);
		sharedMatrix.insertCols(0, 3);
		sharedMatrix.setCell(0, 0, "Hello");
		sharedMatrix.setCell(0, 1, "World");
		// False positive
		// eslint-disable-next-line unicorn/no-useless-undefined
		sharedMatrix.setCell(0, 2, undefined);
		sharedMatrix.setCell(1, 0, 1);
		sharedMatrix.setCell(1, 1, true);
		sharedMatrix.setCell(1, 2, {
			a: null,
			b: undefined,
			c: false,
		});

		const result = await visualizeSharedMatrix(sharedMatrix, visualizeChildData);

		const expected: FluidObjectTreeNode = {
			fluidObjectId: "test-matrix",
			children: {
				0: {
					children: {
						0: {
							value: "Hello",
							nodeKind: VisualNodeKind.ValueNode,
							typeMetadata: "string",
						},
						1: {
							value: "World",
							nodeKind: VisualNodeKind.ValueNode,
							typeMetadata: "string",
						},
						2: {
							value: undefined,
							nodeKind: VisualNodeKind.ValueNode,
							typeMetadata: "undefined",
						},
					},
					nodeKind: VisualNodeKind.TreeNode,
					metadata: {
						cells: 3,
					},
				},
				1: {
					children: {
						0: {
							value: 1,
							nodeKind: VisualNodeKind.ValueNode,
							typeMetadata: "number",
						},
						1: {
							value: true,
							nodeKind: VisualNodeKind.ValueNode,
							typeMetadata: "boolean",
						},
						2: {
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
					nodeKind: VisualNodeKind.TreeNode,
					metadata: {
						cells: 3,
					},
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
		const runtime = new MockFluidDataStoreRuntime();
		const sharedString = new SharedString(
			runtime,
			"test-string",
			SharedString.getFactory().attributes,
		);
		sharedString.insertText(0, "Hello World!");

		const result = await visualizeSharedString(sharedString, visualizeChildData);

		const expected: FluidObjectValueNode = {
			fluidObjectId: sharedString.id,
			value: "Hello World!",
			typeMetadata: "SharedString",
			nodeKind: VisualNodeKind.FluidValueNode,
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
