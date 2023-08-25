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

export function getCodeVersion() {
	const configVersion = nconf.get("fluid:test:baseVersion");
	if (configVersion !== undefined) {
		return configVersion as string;
	}
	const version = process.env.SETVERSION_CODEVERSION;
	if (version !== undefined && isInternalVersionScheme(version, true, true)) {
		return version;
	}
	return pkgVersion;
}

export const codeVersion = resolveVersion(getCodeVersion(), false);
export const baseVersion = resolveVersion(
	(nconf.get("fluid:test:baseVersion") as string) ?? pkgVersion,
	false,
);
