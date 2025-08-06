/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

import type {
	A_Public,
	B_Beta,
	C_Alpha,
	D_LegacyPublic,
	E_LegacyBeta,
	F_LegacyAlpha,
	G_Internal,
} from "@fluidframework/test-package/internal";

// INPUT
//
// import type {
// 	A_Public,
// 	B_Beta,
// 	C_Alpha,
// 	D_LegacyPublic,
// 	E_LegacyBeta,
// 	F_LegacyAlpha,
// 	G_Internal,
// } from "@fluidframework/test-package/internal";

// OUTPUT FOR NEW SETUP (with both legacy-beta and legacy-alpha outputs):
//
// import type { A_Public } from "@fluidframework/test-package/public";
// import type { D_LegacyPublic, E_LegacyBeta } from "@fluidframework/test-package/legacy";
// import type { B_Beta } from "@fluidframework/test-package/beta";
// import type {
// 	G_Internal,
// } from "@fluidframework/test-package/internal";
// import type { C_Alpha } from "@fluidframework/test-package/alpha";
// import type { F_LegacyAlpha } from "@fluidframework/test-package/legacy/alpha";


// OUTPUT FOR NEW SETUP (with only legacy-beta output):
//
// import type { A_Public } from "@fluidframework/test-package";
// import type { D_LegacyPublic, E_LegacyBeta, F_LegacyAlpha } from "@fluidframework/test-package/legacy";
// import type { B_Beta } from "@fluidframework/test-package/beta";
// import type {
// 	G_Internal,
// } from "@fluidframework/test-package/internal";
// import type { C_Alpha } from "@fluidframework/test-package/alpha";

// OUTPUT FOR CURRENT SETUP:
//
// import type { A_Public } from "@fluidframework/test-package";
// import type { D_LegacyPublic, E_LegacyBeta, F_LegacyAlpha } from "@fluidframework/test-package/legacy";
// import type { B_Beta } from "@fluidframework/test-package/beta";
// import type {
// 	G_Internal,
// } from "@fluidframework/test-package/internal";
// import type { C_Alpha } from "@fluidframework/test-package/alpha";

// OUTPUT FOR PRE-@legacy SETUP:
//
// import type { A_Public } from "@fluidframework/test-package";
// import type { C_Alpha, D_LegacyPublic, E_LegacyBeta, F_LegacyAlpha } from "@fluidframework/test-package/legacy";
// import type { B_Beta } from "@fluidframework/test-package/beta";
// import type {
// 	G_Internal,
// } from "@fluidframework/test-package/internal";

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
