/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import fs from "fs";
import path from "path";

import {
	MockContainerRuntimeFactory,
	MockFluidDataStoreRuntime,
	MockStorage,
} from "@fluidframework/test-runtime-utils/internal";

import { SharedStringFactory, type SharedString } from "../sequenceFactory.js";
import { SharedStringClass } from "../sharedString.js";

import { _dirname } from "./dirname.cjs";
import { LocationBase } from "./generateSharedStrings.js";

describe("SharedString Snapshot Version - Empty Props", () => {
	let filebase: string;

	before(() => {
		filebase = path.join(_dirname, `../../${LocationBase}`);
	});

	async function loadSharedString(
		id: string,
		serializedSnapshot: string,
	): Promise<SharedString> {
		const containerRuntimeFactory = new MockContainerRuntimeFactory();
		const dataStoreRuntime = new MockFluidDataStoreRuntime();
		containerRuntimeFactory.createContainerRuntime(dataStoreRuntime);
		const services = {
			deltaConnection: dataStoreRuntime.createDeltaConnection(),
			objectStorage: new MockStorage(JSON.parse(serializedSnapshot)),
		};
		const sharedString = new SharedStringClass(
			dataStoreRuntime,
			id,
			SharedStringFactory.Attributes,
		);
		await sharedString.load(services);
		return sharedString;
	}

	it("loads a snapshot that contains an empty PropertySet", async () => {
		const filename = `${filebase}emptyPropsAtEnd.json`;
		assert(fs.existsSync(filename), `test snapshot file does not exist: ${filename}`);
		const data = fs.readFileSync(filename, "utf8");
		const sharedString = await loadSharedString("fakeId", data);
		const expectedProps = Object.entries({});
		assert(sharedString !== undefined, "SharedString is undefined");

		for (let i = 0; i < sharedString.getLength(); i++) {
			const actualProps = sharedString.getPropertiesAtPosition(i);
			assert(actualProps !== undefined, "Properties are undefined when they should be empty");
			assert(
				Object.entries(actualProps).toString() === expectedProps.toString(),
				`Properties are not empty at position ${i}`,
			);
		}
	});
});
