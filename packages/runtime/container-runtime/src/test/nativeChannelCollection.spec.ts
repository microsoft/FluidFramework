/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ISnapshotTree } from "@fluidframework/driver-definitions/internal";

import { NativeChannelCollection } from "../nativeChannelCollection.js";
import {
	createLocalDataStoreContext,
	createParentContext,
} from "./dataStoreCreationHelper.js";

describe("NativeChannelCollection metadata", () => {
	// eslint-disable-next-line unicorn/no-null -- Persisted JSON may contain null at either level.
	for (const aliases of [{}, null, [null], [["alias"]], [[1, "child"]], [["alias", 1]]]) {
		it(`rejects malformed aliases ${JSON.stringify(aliases)}`, async () => {
			const context = createLocalDataStoreContext({
				parentContext: {
					...createParentContext(),
					oldestSupportedClient: "3.12.0",
				},
			});
			const snapshot: ISnapshotTree = { blobs: { ".aliases": "aliases" }, trees: {} };
			Object.defineProperty(context, "baseSnapshot", { value: snapshot });
			Object.defineProperty(context, "storage", {
				value: {
					...context.storage,
					readBlob: async () => new TextEncoder().encode(JSON.stringify(aliases)).buffer,
				},
			});
			await assert.rejects(
				NativeChannelCollection.load(context, undefined, async () =>
					assert.fail("Invalid metadata must not create an entry point"),
				),
				/Invalid native channel alias/,
			);
		});
	}
});
