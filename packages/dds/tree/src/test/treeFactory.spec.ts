/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { validateUsageError } from "@fluidframework/test-runtime-utils/internal";

import { configuredSharedTreeAlpha, SharedTreeAlpha } from "../treeFactory.js";
import type { requireAssignableTo } from "../util/index.js";

describe("treeFactory", () => {
	describe("configuredSharedTreeAlpha", () => {
		for (const [name, options] of [
			["default", {}],
			["non-default", { retainHistory: true }],
		] as const) {
			it(`preserves alpha kind capabilities with ${name} options`, async () => {
				// Keep the inferred return type: an annotation or cast could hide the capability loss.
				const configured = configuredSharedTreeAlpha(options);
				type _kind = requireAssignableTo<typeof configured, typeof SharedTreeAlpha>;
				assert.equal(configured.type, SharedTreeAlpha.type);

				const adapted = await configured.adapt(Promise.resolve(configured));
				type _adaptedKind = requireAssignableTo<typeof adapted, typeof SharedTreeAlpha>;
				assert.equal(adapted, configured);

				// Adaptation checks kind identity, not just the common SharedTree type identifier.
				await assert.rejects(
					configured.adapt(Promise.resolve(SharedTreeAlpha)),
					validateUsageError(/Conflicting DataStoreKinds with same type/),
				);
			});
		}
	});
});
