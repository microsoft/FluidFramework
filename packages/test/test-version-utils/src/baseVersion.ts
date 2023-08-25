/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import nconf from "nconf";
import { isInternalVersionScheme } from "@fluid-tools/version-tools";
import { resolveVersion } from "./versionUtils.js";
// This import ensures nconf has been configured to load from correct sources before we compute the right baseVersion.
// eslint-disable-next-line import/no-unassigned-import
import "../compatOptions.cjs";
import { pkgVersion } from "./packageVersion.js";

export function getBaseVersion() {
	const configVersion = nconf.get("fluid:test:baseVersion");
	if (configVersion !== undefined) {
		return configVersion as string;
	}
	const codeVersion = process.env.SETVERSION_CODEVERSION;
	if (codeVersion !== undefined && isInternalVersionScheme(codeVersion, true, true)) {
		return codeVersion;
	}
	return pkgVersion;
}

export const baseVersion = resolveVersion(getBaseVersion(), false);
