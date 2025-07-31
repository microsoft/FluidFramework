/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";
import { Loader, loadExistingContainer } from "@fluidframework/container-loader/internal";
import {
	TestObjectProvider,
	type ITestObjectProvider,
} from "@fluidframework/test-utils/internal";
import { createRuntimeFactory } from "../stressDataObject";

describe("getPendingLocalState", () => {
	it("should return pending local state", async () => {
		const runtime = createRuntimeFactory();
		const detachedClient = await createDetachedClient();

		const attach = detachedClient.container.attach();

		const instantiateRuntime = await runtime.instantiateRuntime(context, true);

		const pendingLocalState = instantiateRuntime.getPendingLocalState();

		const loadContainer2 = loadClient(pendingLocalState);
	});
});
