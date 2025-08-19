/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert/strict";
import { useWorker } from "../../../fluidBuild/tasks/leaf/apiExtractorTask.js";

describe("API Extractor Task", () => {
	it("useWorker", () => {
		assert(useWorker("api-extractor run"));
		assert(useWorker("api-extractor run --local"));
		assert(useWorker("api-extractor run --config the/File.extension"));
		assert(useWorker("api-extractor run --local --config the/File.extension"));
		assert(!useWorker("api-extractor run --local --config the/File.extension --unsupported"));
		assert(!useWorker("api-extractor run unsupported"));
		assert(!useWorker("api-extractor run --local --config"));
	});
});
