/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { OldestSupportedClientVersion } from "../../index.js";

export const supportedVersions: OldestSupportedClientVersion[] = [
	"2.0.0",
	"2.0.0-defaults",
	"2.116.1-beta.1",
	"3.0.0",
	"3.1.0",
];

export const unsupportedVersions: OldestSupportedClientVersion[] = [
	// @ts-expect-error Client 3.0 does not support collaborating with 1.x clients.
	"1.99.0",
	// @ts-expect-error New major versions use minor-level feature checkpoints.
	"3.1.2",
	// @ts-expect-error New major versions do not accept prerelease checkpoints.
	"3.1.0-beta.1",
	// @ts-expect-error Client 3.0 does not accept future 4.x versions.
	"4.0.0",
	// @ts-expect-error The value must be valid SemVer.
	"invalid",
];
