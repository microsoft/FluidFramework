/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Required for testing support of null values
/* eslint-disable unicorn/no-null */

import { expect } from "chai";

import { SharedCell } from "@fluidframework/cell";
import { type IFluidHandle } from "@fluidframework/core-interfaces";
import { SharedCounter } from "@fluidframework/counter";
import { SharedDirectory, SharedMap } from "@fluidframework/map";
import { SharedMatrix } from "@fluidframework/matrix";
import { SharedString } from "@fluidframework/sequence";
import { type ISharedObject } from "@fluidframework/shared-object-base";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { SchemaFactory, TreeConfiguration, TreeFactory } from "@fluid-experimental/tree2";

import { EditType, type FluidObjectId } from "../CommonInterfaces";
import {
	type FluidObjectTreeNode,
	type FluidObjectValueNode,
	type FluidUnknownObjectNode,
	type VisualChildNode,
	visualizeChildData as visualizeChildDataBase,
	visualizeSharedCell,
	visualizeSharedCounter,
	visualizeSharedDirectory,
	visualizeSharedMap,
	visualizeSharedMatrix,
	visualizeSharedString,
	visualizeSharedTree,
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
	it("SharedCell (Primitive data)", async () => {
		const runtime = new MockFluidDataStoreRuntime();
		const sharedCell = new SharedCell("test-cell", runtime, SharedCell.getFactory().attributes);

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
		const runtime = new MockFluidDataStoreRuntime();
		const sharedCell = new SharedCell("test-cell", runtime, SharedCell.getFactory().attributes);

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
			editProps: { editTypes: [EditType.Number] },
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
			editProps: { editTypes: [EditType.String] },
		};

		expect(result).to.deep.equal(expected);
	});

	it("SharedTree", async () => {
		const factory = new TreeFactory({});
		const builder = new SchemaFactory("DefaultVisualizer_SharedTree_Test");

		const sharedTree = factory.create(new MockFluidDataStoreRuntime(), "test");

		class LeafSchema extends builder.object("leaf-item", {
			leafField: [builder.boolean, builder.handle, builder.string],
		}) {}

		class ChildSchema extends builder.object("child-item", {
			childField: [builder.string, builder.boolean],
			childData: builder.optional(LeafSchema),
		}) {}

		class RootNodeSchema extends builder.object("root-item", {
			childrenOne: builder.array(ChildSchema),
			childrenTwo: builder.number,
		}) {}

		sharedTree.schematize(
			new TreeConfiguration(
				RootNodeSchema,
				() =>
					new RootNodeSchema({
						childrenOne: [
							{
								childField: "Hello world!",
								childData: {
									leafField: "Hello world again!",
								},
							},
							{
								childField: true,
								childData: {
									leafField: false, // TODO: Use a handle here.
								},
							},
						],
						childrenTwo: 32,
					}),
			),
		);
		const result = await visualizeSharedTree(
			sharedTree as unknown as ISharedObject,
			visualizeChildData,
		);

		// TODO: this should probably:
		// 1. Use a more maintainable approach (like comparing json snapshot files on disk with an automated way to update them).
		// 2. Use a more concise format.
		// 3. Use a smaller test tree with a simpler schema.
		const expected: FluidObjectTreeNode = {
			fluidObjectId: "test",
			children: {
				tree: {
					children: {
						"0": {
							children: {
								type: {
									value: "DefaultVisualizer_SharedTree_Test.root-item",
									typeMetadata: "string",
									nodeKind: VisualNodeKind.ValueNode,
								},
								fields: {
									children: {
										childrenTwo: {
											children: {
												"0": {
													children: {
														type: {
															value: "com.fluidframework.leaf.number",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														value: {
															value: 32,
															typeMetadata: "number",
															nodeKind: VisualNodeKind.ValueNode,
														},
													},
													nodeKind: VisualNodeKind.TreeNode,
													typeMetadata: "object",
												},
											},
											nodeKind: VisualNodeKind.TreeNode,
											typeMetadata: "object",
										},
										childrenOne: {
											children: {
												"0": {
													children: {
														type: {
															value: 'DefaultVisualizer_SharedTree_Test.List<["DefaultVisualizer_SharedTree_Test.child-item"]>',
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														fields: {
															children: {
																"": {
																	children: {
																		"0": {
																			children: {
																				type: {
																					value: "DefaultVisualizer_SharedTree_Test.child-item",
																					typeMetadata:
																						"string",
																					nodeKind:
																						VisualNodeKind.ValueNode,
																				},
																				fields: {
																					children: {
																						childField:
																							{
																								children:
																									{
																										"0": {
																											children:
																												{
																													type: {
																														value: "com.fluidframework.leaf.string",
																														typeMetadata:
																															"string",
																														nodeKind:
																															VisualNodeKind.ValueNode,
																													},
																													value: {
																														value: "Hello world!",
																														typeMetadata:
																															"string",
																														nodeKind:
																															VisualNodeKind.ValueNode,
																													},
																												},
																											nodeKind:
																												VisualNodeKind.TreeNode,
																											typeMetadata:
																												"object",
																										},
																									},
																								nodeKind:
																									VisualNodeKind.TreeNode,
																								typeMetadata:
																									"object",
																							},
																						childData: {
																							children:
																								{
																									"0": {
																										children:
																											{
																												type: {
																													value: "DefaultVisualizer_SharedTree_Test.leaf-item",
																													typeMetadata:
																														"string",
																													nodeKind:
																														VisualNodeKind.ValueNode,
																												},
																												fields: {
																													children:
																														{
																															leafField:
																																{
																																	children:
																																		{
																																			"0": {
																																				children:
																																					{
																																						type: {
																																							value: "com.fluidframework.leaf.string",
																																							typeMetadata:
																																								"string",
																																							nodeKind:
																																								VisualNodeKind.ValueNode,
																																						},
																																						value: {
																																							value: "Hello world again!",
																																							typeMetadata:
																																								"string",
																																							nodeKind:
																																								VisualNodeKind.ValueNode,
																																						},
																																					},
																																				nodeKind:
																																					VisualNodeKind.TreeNode,
																																				typeMetadata:
																																					"object",
																																			},
																																		},
																																	nodeKind:
																																		VisualNodeKind.TreeNode,
																																	typeMetadata:
																																		"object",
																																},
																														},
																													nodeKind:
																														VisualNodeKind.TreeNode,
																													typeMetadata:
																														"object",
																												},
																											},
																										nodeKind:
																											VisualNodeKind.TreeNode,
																										typeMetadata:
																											"object",
																									},
																								},
																							nodeKind:
																								VisualNodeKind.TreeNode,
																							typeMetadata:
																								"object",
																						},
																					},
																					nodeKind:
																						VisualNodeKind.TreeNode,
																					typeMetadata:
																						"object",
																				},
																			},
																			nodeKind:
																				VisualNodeKind.TreeNode,
																			typeMetadata: "object",
																		},
																		"1": {
																			children: {
																				type: {
																					value: "DefaultVisualizer_SharedTree_Test.child-item",
																					typeMetadata:
																						"string",
																					nodeKind:
																						VisualNodeKind.ValueNode,
																				},
																				fields: {
																					children: {
																						childField:
																							{
																								children:
																									{
																										"0": {
																											children:
																												{
																													type: {
																														value: "com.fluidframework.leaf.boolean",
																														typeMetadata:
																															"string",
																														nodeKind:
																															VisualNodeKind.ValueNode,
																													},
																													value: {
																														value: true,
																														typeMetadata:
																															"boolean",
																														nodeKind:
																															VisualNodeKind.ValueNode,
																													},
																												},
																											nodeKind:
																												VisualNodeKind.TreeNode,
																											typeMetadata:
																												"object",
																										},
																									},
																								nodeKind:
																									VisualNodeKind.TreeNode,
																								typeMetadata:
																									"object",
																							},
																						childData: {
																							children:
																								{
																									"0": {
																										children:
																											{
																												type: {
																													value: "DefaultVisualizer_SharedTree_Test.leaf-item",
																													typeMetadata:
																														"string",
																													nodeKind:
																														VisualNodeKind.ValueNode,
																												},
																												fields: {
																													children:
																														{
																															leafField:
																																{
																																	children:
																																		{
																																			"0": {
																																				children:
																																					{
																																						type: {
																																							value: "com.fluidframework.leaf.boolean",
																																							typeMetadata:
																																								"string",
																																							nodeKind:
																																								VisualNodeKind.ValueNode,
																																						},
																																						value: {
																																							value: false,
																																							typeMetadata:
																																								"boolean",
																																							nodeKind:
																																								VisualNodeKind.ValueNode,
																																						},
																																					},
																																				nodeKind:
																																					VisualNodeKind.TreeNode,
																																				typeMetadata:
																																					"object",
																																			},
																																		},
																																	nodeKind:
																																		VisualNodeKind.TreeNode,
																																	typeMetadata:
																																		"object",
																																},
																														},
																													nodeKind:
																														VisualNodeKind.TreeNode,
																													typeMetadata:
																														"object",
																												},
																											},
																										nodeKind:
																											VisualNodeKind.TreeNode,
																										typeMetadata:
																											"object",
																									},
																								},
																							nodeKind:
																								VisualNodeKind.TreeNode,
																							typeMetadata:
																								"object",
																						},
																					},
																					nodeKind:
																						VisualNodeKind.TreeNode,
																					typeMetadata:
																						"object",
																				},
																			},
																			nodeKind:
																				VisualNodeKind.TreeNode,
																			typeMetadata: "object",
																		},
																	},
																	nodeKind:
																		VisualNodeKind.TreeNode,
																	typeMetadata: "object",
																},
															},
															nodeKind: VisualNodeKind.TreeNode,
															typeMetadata: "object",
														},
													},
													nodeKind: VisualNodeKind.TreeNode,
													typeMetadata: "object",
												},
											},
											nodeKind: VisualNodeKind.TreeNode,
											typeMetadata: "object",
										},
									},
									nodeKind: VisualNodeKind.TreeNode,
									typeMetadata: "object",
								},
							},
							nodeKind: VisualNodeKind.TreeNode,
							typeMetadata: "object",
						},
					},
					nodeKind: VisualNodeKind.TreeNode,
					typeMetadata: "object",
				},
				schema: {
					children: {
						version: {
							value: "1.0.0",
							typeMetadata: "string",
							nodeKind: VisualNodeKind.ValueNode,
						},
						rootFieldSchema: {
							children: {
								kind: {
									value: "Value",
									typeMetadata: "string",
									nodeKind: VisualNodeKind.ValueNode,
								},
								types: {
									children: {
										"0": {
											value: "DefaultVisualizer_SharedTree_Test.root-item",
											typeMetadata: "string",
											nodeKind: VisualNodeKind.ValueNode,
										},
									},
									nodeKind: VisualNodeKind.TreeNode,
									typeMetadata: "object",
								},
							},
							nodeKind: VisualNodeKind.TreeNode,
							typeMetadata: "object",
						},
						nodeSchema: {
							children: {
								"0": {
									children: {
										name: {
											value: 'DefaultVisualizer_SharedTree_Test.List<["DefaultVisualizer_SharedTree_Test.child-item"]>',
											typeMetadata: "string",
											nodeKind: VisualNodeKind.ValueNode,
										},
										mapFields: {
											value: undefined,
											typeMetadata: "undefined",
											nodeKind: VisualNodeKind.ValueNode,
										},
										objectNodeFields: {
											children: {
												"0": {
													children: {
														kind: {
															value: "Sequence",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														name: {
															value: "",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														types: {
															children: {
																"0": {
																	value: "DefaultVisualizer_SharedTree_Test.child-item",
																	typeMetadata: "string",
																	nodeKind:
																		VisualNodeKind.ValueNode,
																},
															},
															nodeKind: VisualNodeKind.TreeNode,
															typeMetadata: "object",
														},
													},
													nodeKind: VisualNodeKind.TreeNode,
													typeMetadata: "object",
												},
											},
											nodeKind: VisualNodeKind.TreeNode,
											typeMetadata: "object",
										},
									},
									nodeKind: VisualNodeKind.TreeNode,
									typeMetadata: "object",
								},
								"1": {
									children: {
										name: {
											value: "DefaultVisualizer_SharedTree_Test.child-item",
											typeMetadata: "string",
											nodeKind: VisualNodeKind.ValueNode,
										},
										mapFields: {
											value: undefined,
											typeMetadata: "undefined",
											nodeKind: VisualNodeKind.ValueNode,
										},
										objectNodeFields: {
											children: {
												"0": {
													children: {
														kind: {
															value: "Optional",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														name: {
															value: "childData",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														types: {
															children: {
																"0": {
																	value: "DefaultVisualizer_SharedTree_Test.leaf-item",
																	typeMetadata: "string",
																	nodeKind:
																		VisualNodeKind.ValueNode,
																},
															},
															nodeKind: VisualNodeKind.TreeNode,
															typeMetadata: "object",
														},
													},
													nodeKind: VisualNodeKind.TreeNode,
													typeMetadata: "object",
												},
												"1": {
													children: {
														kind: {
															value: "Value",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														name: {
															value: "childField",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														types: {
															children: {
																"0": {
																	value: "com.fluidframework.leaf.string",
																	typeMetadata: "string",
																	nodeKind:
																		VisualNodeKind.ValueNode,
																},
																"1": {
																	value: "com.fluidframework.leaf.boolean",
																	typeMetadata: "string",
																	nodeKind:
																		VisualNodeKind.ValueNode,
																},
															},
															nodeKind: VisualNodeKind.TreeNode,
															typeMetadata: "object",
														},
													},
													nodeKind: VisualNodeKind.TreeNode,
													typeMetadata: "object",
												},
											},
											nodeKind: VisualNodeKind.TreeNode,
											typeMetadata: "object",
										},
									},
									nodeKind: VisualNodeKind.TreeNode,
									typeMetadata: "object",
								},
								"2": {
									children: {
										name: {
											value: "DefaultVisualizer_SharedTree_Test.leaf-item",
											typeMetadata: "string",
											nodeKind: VisualNodeKind.ValueNode,
										},
										mapFields: {
											value: undefined,
											typeMetadata: "undefined",
											nodeKind: VisualNodeKind.ValueNode,
										},
										objectNodeFields: {
											children: {
												"0": {
													children: {
														kind: {
															value: "Value",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														name: {
															value: "leafField",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														types: {
															children: {
																"0": {
																	value: "com.fluidframework.leaf.boolean",
																	typeMetadata: "string",
																	nodeKind:
																		VisualNodeKind.ValueNode,
																},
																"1": {
																	value: "com.fluidframework.leaf.handle",
																	typeMetadata: "string",
																	nodeKind:
																		VisualNodeKind.ValueNode,
																},
																"2": {
																	value: "com.fluidframework.leaf.string",
																	typeMetadata: "string",
																	nodeKind:
																		VisualNodeKind.ValueNode,
																},
															},
															nodeKind: VisualNodeKind.TreeNode,
															typeMetadata: "object",
														},
													},
													nodeKind: VisualNodeKind.TreeNode,
													typeMetadata: "object",
												},
											},
											nodeKind: VisualNodeKind.TreeNode,
											typeMetadata: "object",
										},
									},
									nodeKind: VisualNodeKind.TreeNode,
									typeMetadata: "object",
								},
								"3": {
									children: {
										name: {
											value: "DefaultVisualizer_SharedTree_Test.root-item",
											typeMetadata: "string",
											nodeKind: VisualNodeKind.ValueNode,
										},
										mapFields: {
											value: undefined,
											typeMetadata: "undefined",
											nodeKind: VisualNodeKind.ValueNode,
										},
										objectNodeFields: {
											children: {
												"0": {
													children: {
														kind: {
															value: "Value",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														name: {
															value: "childrenOne",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														types: {
															children: {
																"0": {
																	value: 'DefaultVisualizer_SharedTree_Test.List<["DefaultVisualizer_SharedTree_Test.child-item"]>',
																	typeMetadata: "string",
																	nodeKind:
																		VisualNodeKind.ValueNode,
																},
															},
															nodeKind: VisualNodeKind.TreeNode,
															typeMetadata: "object",
														},
													},
													nodeKind: VisualNodeKind.TreeNode,
													typeMetadata: "object",
												},
												"1": {
													children: {
														kind: {
															value: "Value",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														name: {
															value: "childrenTwo",
															typeMetadata: "string",
															nodeKind: VisualNodeKind.ValueNode,
														},
														types: {
															children: {
																"0": {
																	value: "com.fluidframework.leaf.number",
																	typeMetadata: "string",
																	nodeKind:
																		VisualNodeKind.ValueNode,
																},
															},
															nodeKind: VisualNodeKind.TreeNode,
															typeMetadata: "object",
														},
													},
													nodeKind: VisualNodeKind.TreeNode,
													typeMetadata: "object",
												},
											},
											nodeKind: VisualNodeKind.TreeNode,
											typeMetadata: "object",
										},
									},
									nodeKind: VisualNodeKind.TreeNode,
									typeMetadata: "object",
								},
								"4": {
									children: {
										name: {
											value: "com.fluidframework.leaf.boolean",
											typeMetadata: "string",
											nodeKind: VisualNodeKind.ValueNode,
										},
										mapFields: {
											value: undefined,
											typeMetadata: "undefined",
											nodeKind: VisualNodeKind.ValueNode,
										},
										leafValue: {
											value: 2,
											typeMetadata: "number",
											nodeKind: VisualNodeKind.ValueNode,
										},
										objectNodeFields: {
											children: {},
											nodeKind: VisualNodeKind.TreeNode,
											typeMetadata: "object",
										},
									},
									nodeKind: VisualNodeKind.TreeNode,
									typeMetadata: "object",
								},
								"5": {
									children: {
										name: {
											value: "com.fluidframework.leaf.handle",
											typeMetadata: "string",
											nodeKind: VisualNodeKind.ValueNode,
										},
										mapFields: {
											value: undefined,
											typeMetadata: "undefined",
											nodeKind: VisualNodeKind.ValueNode,
										},
										leafValue: {
											value: 3,
											typeMetadata: "number",
											nodeKind: VisualNodeKind.ValueNode,
										},
										objectNodeFields: {
											children: {},
											nodeKind: VisualNodeKind.TreeNode,
											typeMetadata: "object",
										},
									},
									nodeKind: VisualNodeKind.TreeNode,
									typeMetadata: "object",
								},
								"6": {
									children: {
										name: {
											value: "com.fluidframework.leaf.number",
											typeMetadata: "string",
											nodeKind: VisualNodeKind.ValueNode,
										},
										mapFields: {
											value: undefined,
											typeMetadata: "undefined",
											nodeKind: VisualNodeKind.ValueNode,
										},
										leafValue: {
											value: 0,
											typeMetadata: "number",
											nodeKind: VisualNodeKind.ValueNode,
										},
										objectNodeFields: {
											children: {},
											nodeKind: VisualNodeKind.TreeNode,
											typeMetadata: "object",
										},
									},
									nodeKind: VisualNodeKind.TreeNode,
									typeMetadata: "object",
								},
								"7": {
									children: {
										name: {
											value: "com.fluidframework.leaf.string",
											typeMetadata: "string",
											nodeKind: VisualNodeKind.ValueNode,
										},
										mapFields: {
											value: undefined,
											typeMetadata: "undefined",
											nodeKind: VisualNodeKind.ValueNode,
										},
										leafValue: {
											value: 1,
											typeMetadata: "number",
											nodeKind: VisualNodeKind.ValueNode,
										},
										objectNodeFields: {
											children: {},
											nodeKind: VisualNodeKind.TreeNode,
											typeMetadata: "object",
										},
									},
									nodeKind: VisualNodeKind.TreeNode,
									typeMetadata: "object",
								},
							},
							nodeKind: VisualNodeKind.TreeNode,
							typeMetadata: "object",
						},
					},
					nodeKind: VisualNodeKind.TreeNode,
					typeMetadata: "object",
				},
			},
			typeMetadata: "SharedTree",
			nodeKind: VisualNodeKind.FluidTreeNode,
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
