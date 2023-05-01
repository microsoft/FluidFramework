/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MockContainerRuntimeFactory, MockFluidDataStoreRuntime } from "../mocks";

describe("MockContainerRuntime", () => {
	it("inherits its id from the datastore when set", () => {
		const id = "example test id";
		const factory = new MockContainerRuntimeFactory();
		const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: id });
		const containerRuntime = factory.createContainerRuntime(dataStoreRuntime);
		assert.equal(containerRuntime.clientId, id);
	});
});
