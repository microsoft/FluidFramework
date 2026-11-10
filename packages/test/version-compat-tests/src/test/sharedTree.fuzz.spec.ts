/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ensureVersionLoaded, getDataRuntimeApi } from "@fluid-private/test-version-utils";
import { createCompatFuzzSuite } from "@fluidframework/tree/internal/test";

// This is ideally 3.11, but so long as there are multiple versions using
// same version of `@sinclair/typebox` (v0.34.49 here), the exception:
// `TypeSystemDuplicateTypeKind [Error]: Duplicate type kind 'Sandbox.RegisteredBufferPlaceholder' detected`
// will arise.
// If 3.7 is dropped from `packages/test/test-version-utils/compat-workspaces/generated-versions.cjs`,
// change this to "3.11.0" and add
// 	"3.11.0", // version-compat-tests/.../sharedTree.fuzz.spec.ts -- pre- ModularChangeFamily refactor
// to `packages/test/test-version-utils/compat-workspaces/explicit-versions.mjs`.

const versionForCompat = "3.7.0";

await ensureVersionLoaded(versionForCompat, 0);

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

describe("Shared tree cross-version collab fuzz", () => {
	const treePackage = getDataRuntimeApi(versionForCompat).packages.tree;
	const prevTreeFactory = treePackage.SharedTree.getFactory();
	createCompatFuzzSuite(
		prevTreeFactory,
		{
			newSchemaFactory: (scope) => new treePackage.SchemaFactory(scope),
			newTreeViewConfiguration: (props) => new treePackage.TreeViewConfiguration(props),
			nodeApi: treePackage.Tree,
		},
		versionForCompat,
	);
});
