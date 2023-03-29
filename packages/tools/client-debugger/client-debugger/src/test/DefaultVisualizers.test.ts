/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { expect } from "chai";

import { SharedCell } from "@fluidframework/cell";
import { SharedCounter } from "@fluidframework/counter";
import { SharedMap } from "@fluidframework/map";
import { SharedString } from "@fluidframework/sequence";
import { ISharedObject } from "@fluidframework/shared-object-base";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";

import {
	FluidObjectTreeNode,
	FluidObjectValueNode,
	FluidUnknownObjectNode,
	visualizeSharedCell,
	visualizeSharedCounter,
	visualizeSharedMap,
	visualizeSharedString,
	visualizeUnknownSharedObject,
	VisualNodeKind,
	VisualValueNode,
} from "../data-visualization";

/**
 * Mock {@link VisualizeChildData} for use in tests
 */
async function visualizeChildData(child: unknown, label: string): Promise<VisualValueNode> {
	return {
		label,
		value: "test",
		nodeKind: VisualNodeKind.ValueNode,
	};
}

describe("DefaultVisualizers unit tests", () => {
	it("SharedCell", async () => {
		const runtime = new MockFluidDataStoreRuntime();
		const sharedCell = new SharedCell("test-cell", runtime, SharedCell.getFactory().attributes);

		const result = await visualizeSharedCell(sharedCell, "test-label", visualizeChildData);

		const expected: FluidObjectTreeNode = {
			label: "test-label",
			fluidObjectId: sharedCell.id,
			children: [
				{
					label: "data",
					value: "test",
					nodeKind: VisualNodeKind.ValueNode,
				},
			],
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

		const result = await visualizeSharedCounter(
			sharedCounter,
			"test-label",
			visualizeChildData,
		);

		const expected: FluidObjectValueNode = {
			label: "test-label",
			fluidObjectId: sharedCounter.id,
			value: 37,
			typeMetadata: "SharedCounter",
			nodeKind: VisualNodeKind.FluidValueNode,
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
		});

		const result = await visualizeSharedMap(sharedMap, "test-label", visualizeChildData);

		const expected: FluidObjectTreeNode = {
			label: "test-label",
			fluidObjectId: sharedMap.id,
			children: [
				{
					label: "foo",
					value: "test",
					nodeKind: VisualNodeKind.ValueNode,
				},
				{
					label: "bar",
					value: "test",
					nodeKind: VisualNodeKind.ValueNode,
				},
				{
					label: "baz",
					value: "test",
					nodeKind: VisualNodeKind.ValueNode,
				},
			],
			metadata: {
				size: 3,
			},
			typeMetadata: "SharedMap",
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

		const result = await visualizeSharedString(sharedString, "test-label", visualizeChildData);

		const expected: FluidObjectValueNode = {
			label: "test-label",
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

		const result = await visualizeUnknownSharedObject(
			unknownObject,
			"test-label",
			visualizeChildData,
		);

		const expected: FluidUnknownObjectNode = {
			fluidObjectId: "test-object-id",
			label: "test-label",
			typeMetadata: "UnknownSharedObjectType",
			nodeKind: VisualNodeKind.FluidUnknownNode,
		};

		expect(result).to.deep.equal(expected);
	});
});
