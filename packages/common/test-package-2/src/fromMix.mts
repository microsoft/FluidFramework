/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import type { B_Beta } from "@fluidframework/test-package/alpha";
import type { A_Public } from "@fluidframework/test-package/legacy";
import type { D_LegacyPublic, E_LegacyBeta } from "@fluidframework/test-package/legacy/alpha";
import type {
	C_Alpha,
	F_LegacyAlpha,
	G_Internal,
} from "@fluidframework/test-package/internal";

// INPUT
//
// import type { B_Beta } from "@fluidframework/test-package/alpha";
// import type { A_Public } from "@fluidframework/test-package/legacy";
// import type { D_LegacyPublic, E_LegacyBeta } from "@fluidframework/test-package/legacy/alpha";
// import type {
// 	C_Alpha,
// 	F_LegacyAlpha,
// 	G_Internal,
// } from "@fluidframework/test-package/internal";

// OUTPUT FOR NEW SETUP (with both legacy-beta and legacy-alpha outputs):
//
// TODO

// OUTPUT FOR NEW SETUP (with only legacy-beta output):
//
// TODO

// OUTPUT FOR NEW SETUP (with only legacy-alpha output):
//
// TODO

// OUTPUT FOR CURRENT SETUP:
//
// TODO

// OUTPUT FOR PRE-@legacy SETUP:
//
// TODO

/**
 * @internal
 */
export interface Foo {
	a: A_Public;
	b: B_Beta;
	c: C_Alpha;
	d: D_LegacyPublic;
	e: E_LegacyBeta;
	f: F_LegacyAlpha;
	g: G_Internal;
}
