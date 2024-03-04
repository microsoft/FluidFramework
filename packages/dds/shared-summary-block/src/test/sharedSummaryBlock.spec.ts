/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ISummaryBlob } from "@fluidframework/protocol-definitions";
import {
	MockFluidDataStoreRuntime,
	MockSharedObjectServices,
} from "@fluidframework/test-runtime-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { ISharedSummaryBlock } from "../interfaces.js";
import { SharedSummaryBlockFactory } from "../sharedSummaryBlockFactory.js";

interface ITestInterface {
	value1: string;
	value2: number;
	value3: boolean[];
	value4?: ITestInterface;
}

describe("SharedSummaryBlock", () => {
	let dataStoreRuntime: MockFluidDataStoreRuntime;
	let factory: SharedSummaryBlockFactory;
	let sharedSummaryBlock: ISharedSummaryBlock;

	beforeEach(async () => {
		// We only want to test local state of the DDS.
		dataStoreRuntime = new MockFluidDataStoreRuntime({ attachState: AttachState.Detached });
		factory = new SharedSummaryBlockFactory();
		sharedSummaryBlock = factory.create(dataStoreRuntime, "root") as ISharedSummaryBlock;
	});

	describe("Api", () => {
		it("can create a shared summary block", () => {
			assert.ok(sharedSummaryBlock);
		});

		it("can set and get shared summary block data", async () => {
			const key1 = "testKey1";
			const value1 = "testValue1";
			sharedSummaryBlock.set(key1, value1);
			assert.equal(
				sharedSummaryBlock.get(key1),
				value1,
				"The retrieved value must match the set value",
			);

			const key2 = "testKey2";
			const value2 = { value: "testValue2" };
			sharedSummaryBlock.set(key2, value2);
			assert.deepEqual(
				sharedSummaryBlock.get(key2),
				value2,
				"The retrieved value must match the set value",
			);

			const key3 = "testKey3";
			const value3: ITestInterface = {
				value1: "outer string",
				value2: 2,
				value3: [true, false],
				value4: {
					value1: "inner string",
					value2: 500,
					value3: [false, false, true],
				},
			};
			sharedSummaryBlock.set(key3, value3);
			assert.deepEqual(
				sharedSummaryBlock.get(key3),
				value3,
				"The retrieved value must match the set value",
			);
		});
	});

	describe("Summarize", () => {
		it("can generate summary of the shared summary block data and load from it", async () => {
			const key1 = "testKey1";
			const value1 = "testValue1";
			sharedSummaryBlock.set(key1, value1);

			const key2 = "testKey2";
			const value2 = "testValue2";
			sharedSummaryBlock.set(key2, value2);

			const key3 = "testKey3";
			const value3 = { value: "testValue3" };
			sharedSummaryBlock.set(key3, value3);

			const summaryTree = sharedSummaryBlock.getAttachSummary().summary;
			const contents = JSON.stringify({
				testKey1: value1,
				testKey2: value2,
				testKey3: value3,
			});

			// Verify that the generated summary is correct.
			const summaryObjectKeys = Object.keys(summaryTree.tree);
			assert(
				summaryObjectKeys.length === 1,
				"summarize should return a tree with single blob",
			);
			assert(summaryObjectKeys[0] === "header", "summary should have a header blob");
			assert(
				(summaryTree.tree.header as ISummaryBlob).content === contents,
				"The summary content is incorrect",
			);

			const services = new MockSharedObjectServices({
				header: contents,
			});

			// Load another object from the snapshot and ensure that it has loaded the data from the original object.
			const sharedSummaryBlock2 = (await factory.load(
				dataStoreRuntime,
				"mapId",
				services,
				factory.attributes,
			)) as ISharedSummaryBlock;
			assert.equal(sharedSummaryBlock2.get(key1), value1);
			assert.equal(sharedSummaryBlock2.get(key2), value2);
			assert.deepEqual(sharedSummaryBlock2.get(key3), value3);
		});
	});
});
