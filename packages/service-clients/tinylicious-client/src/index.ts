/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The **tinylicious-client** library provides a simple and powerful way to consume collaborative Fluid data with the
 * Tinylicious service.
 *
 * The Tinylicious service is a local, in-memory Fluid service intended for prototyping and development purposes.
 *
 * See {@link https://fluidframework.com/docs/testing/tinylicious/}
 *
 * @packageDocumentation
 */

export {
	type ITinyliciousAudience,
	type TinyliciousClientProps,
	type TinyliciousConnectionConfig,
	type TinyliciousContainerServices,
	type TinyliciousMember,
	type TinyliciousUser,
} from "./interfaces.js";
export { TinyliciousClient } from "./TinyliciousClient.js";

// Re-export so developers have access to parameter types for createContainer/getContainer without pulling in fluid-static
export type { CompatibilityMode } from "@fluidframework/fluid-static";
