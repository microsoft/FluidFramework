/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import nconf from "nconf";
import { resolveVersion } from "./versionUtils.js";
// This import ensures nconf has been configured to load from correct sources before we compute the right baseVersion.
// eslint-disable-next-line import/no-unassigned-import
import "../compatOptions.cjs";
import { pkgVersion } from "./packageVersion.js";

export const baseVersion = resolveVersion(
	(nconf.get("fluid:test:baseVersion") as string) ?? pkgVersion,
	false,
);
