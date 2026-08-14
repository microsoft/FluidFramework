/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { OldestSupportedClientVersion } from "../../index.js";

export const supportedVersions: OldestSupportedClientVersion[] = [
	"2.0.0",
	"2.116.0-beta.1",
	"3.0.0",
	"3.1.2-beta.1",
];

export const unsupportedVersions: OldestSupportedClientVersion[] = [
	// @ts-expect-error Client 3.0 does not support collaborating with 1.x clients.
	"1.99.0",
	// @ts-expect-error Client 3.0 does not accept future 4.x versions.
	"4.0.0",
	// @ts-expect-error The value must be valid SemVer.
	"invalid",
];
