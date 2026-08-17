/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export type {
	IVersionMarkResolver,
	ResolveResult,
	VersionMarkCapture,
} from "@fluidframework/container-runtime-definitions/internal";
export {
	VersionMarkResolver,
	type VersionMarkResolverRuntimeHooks,
} from "./versionMarkResolver.js";
export { inboundVersionMarkUpdate, type InboundVersionMarkUpdate } from "./inboundBatch.js";
