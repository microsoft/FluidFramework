/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { apisToBundle as aqueduct } from "./aqueduct.js";
import { apisToBundle as azureClient } from "./azureClient.js";
import { apisToBundle as connectionState } from "./connectionState.js";
import { apisToBundle as containerRuntime } from "./containerRuntimeBundle.js";
import { apisToBundle as experimentalSharedTree } from "./experimentalSharedTree.js";
import { apisToBundle as fluidFramework } from "./fluidFramework.js";
import { apisToBundle as loader } from "./loader.js";
import { apisToBundle as odspClient } from "./odspClient.js";
import { apisToBundle as odspDriver } from "./odspDriver.js";
import { apisToBundle as odspPrefetchSnapshot } from "./odspPrefetchSnapshot.js";
import { apisToBundle as sharedDirectory } from "./sharedDirectory.js";
import { apisToBundle as sharedMap } from "./sharedMap.js";
import { apisToBundle as sharedMatrix } from "./sharedMatrix.js";
import { apisToBundle as sharedString } from "./sharedString.js";
import { apisToBundle as sharedTree } from "./sharedTree.js";
import { apisToBundle as sharedTreeAttributes } from "./sharedTreeAttributes.js";

/**
 * Aggregate entrypoint that pulls in every other bundle-size-tests entrypoint so
 * webpack emits a single chunk containing the deduplicated union of all of them.
 *
 * Summing the individual per-entrypoint asset sizes double-counts any module
 * shared between entrypoints, so it cannot yield a real total. This entrypoint
 * lets webpack dedupe shared modules exactly once while still tree-shaking away
 * anything none of the entrypoints actually use, giving a single
 * customer-representative "full Fluid Framework footprint" number.
 *
 * `debugAssert` is intentionally excluded: it is a side-effect-only module that
 * throws at evaluation time and exposes no `apisToBundle` to invoke.
 */
export function apisToBundle(): void {
	// Reference every entrypoint so none of them are tree-shaken out of this
	// aggregate bundle. The return values are intentionally unused.
	aqueduct();
	azureClient();
	connectionState();
	containerRuntime();
	experimentalSharedTree();
	fluidFramework();
	loader();
	odspClient();
	odspDriver();
	odspPrefetchSnapshot();
	sharedDirectory();
	sharedMap();
	sharedMatrix();
	sharedString();
	sharedTree();
	sharedTreeAttributes();
}
