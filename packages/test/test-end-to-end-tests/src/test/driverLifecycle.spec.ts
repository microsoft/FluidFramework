/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { describeCompat, type ITestDataObject } from "@fluid-private/test-version-utils";
import { AttachState } from "@fluidframework/container-definitions/internal";
import {
	type ITestObjectProvider,
	waitForContainerConnection,
} from "@fluidframework/test-utils/internal";

describeCompat("Driver lifecycle smoke", "NoCompat", (getTestObjectProvider) => {
	let provider: ITestObjectProvider;
	beforeEach(() => {
		provider = getTestObjectProvider();
	});

	it("creates detached, attaches, loads a peer, exchanges edits, and closes", async () => {
		const configuration = {
			runtimeOptions: {
				summaryOptions: { summaryConfigOverrides: { state: "disabled" as const } },
			},
		};
		const loader = provider.makeTestLoader(configuration);
		const first = await loader.createDetachedContainer(provider.defaultCodeDetails);
		assert.equal(first.attachState, AttachState.Detached);
		const writer = (await first.getEntryPoint()) as ITestDataObject;
		writer._root.set("value", "detached");
		await provider.attachDetachedContainer(first);
		await waitForContainerConnection(first);
		assert.equal(first.attachState, AttachState.Attached);
		assert.equal(provider.documentId, first.resolvedUrl?.id);
		const second = await provider.loadTestContainer(configuration);
		const reader = (await second.getEntryPoint()) as ITestDataObject;
		assert.equal(reader._root.get("value"), "detached");
		writer._root.set("value", "from-first");
		await provider.ensureSynchronized();
		assert.equal(reader._root.get("value"), "from-first");
		reader._root.set("value", "from-second");
		await provider.ensureSynchronized();
		assert.equal(writer._root.get("value"), "from-second");
		first.close();
		second.close();
		assert(first.closed && second.closed);
	});
});
