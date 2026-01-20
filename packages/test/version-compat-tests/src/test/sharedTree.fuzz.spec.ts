/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { describeInstallVersions, getDataRuntimeApi } from "@fluid-private/test-version-utils";
import { createCompatFuzzSuite } from "@fluidframework/tree/internal/test";

const versionForCompat = "2.74.0";

/**
 * Fuzz tests in this suite are meant to exercise as much of the SharedTree code as possible and do so in the most
 * production-like manner possible. For example, these fuzz tests should not utilize branching APIs to emulate
 * multiple clients working on the same document. Instead, they should use multiple SharedTree instances, tied together
 * by a sequencing service. The tests may still use branching APIs because that's part of the normal usage of
 * SharedTree, but not as way to avoid using multiple SharedTree instances.
 *
 * The fuzz tests should validate that the clients do not crash and that their document states do not diverge.
 * See the "Fuzz - Targeted" test suite for tests that validate more specific code paths or invariants.
 */
describeInstallVersions({
	requestAbsoluteVersions: [versionForCompat],
})("Fuzz - Top-Level", () => {
	const prevTreeFactory =
		getDataRuntimeApi(versionForCompat).packages.tree.SharedTree.getFactory();

	createCompatFuzzSuite(prevTreeFactory);
});
