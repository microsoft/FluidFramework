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
	ITelemetryBaseEvent,
	ITelemetryBaseLogger,
	ITinyliciousAudience,
	TinyliciousClientProps,
	TinyliciousConnectionConfig,
	TinyliciousContainerServices,
	TinyliciousMember,
	TinyliciousUser,
} from "./interfaces";
export { TinyliciousClient } from "./TinyliciousClient";
// eslint-disable-next-line import/no-default-export
export default TinyliciousClient;
