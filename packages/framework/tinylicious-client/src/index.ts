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

import { TinyliciousClient } from "./TinyliciousClient";

export {
	type ITelemetryBaseEvent,
	type ITelemetryBaseLogger,
	type ITinyliciousAudience,
	type TinyliciousClientProps,
	type TinyliciousConnectionConfig,
	type TinyliciousContainerServices,
	type TinyliciousMember,
	type TinyliciousUser,
} from "./interfaces";
export { TinyliciousClient } from "./TinyliciousClient";

// eslint-disable-next-line import/no-default-export, unicorn/prefer-export-from
export default TinyliciousClient;
