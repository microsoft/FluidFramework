/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isInternalVersionScheme } from "@fluid-tools/version-tools";
import nconf from "nconf";

import { pkgVersion } from "./packageVersion.js";
import { resolveVersion } from "./versionUtils.js";
// This import ensures nconf has been configured to load from correct sources before we compute the right baseVersion.
// eslint-disable-next-line import/no-unassigned-import
import "./compatOptions.js";

function getCodeVersion() {
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

// So for test branches, the base version is 0.0.0-xyz-test where xyz is the build number.
// So if we use the base version we will not get the right back compat testing and thus we want to use the code version.
/**
 * @internal
 */
export const codeVersion = resolveVersion(getCodeVersion(), false);

/**
 * Usually this is enough, but it can be bad on test branches which would have a value of 0.0.0-xyz-test.
 *
 * @internal
 */
export const baseVersion = resolveVersion(
	(nconf.get("fluid:test:baseVersion") as string) ?? pkgVersion,
	false,
);

/**
 * Base version used for N min compat versions calculations. Decoupled from baseVersion or codeVersion to avoid
 * running with issues while bumping a new version or releasing.
 *
 * @internal
 */
export const baseVersionForMinCompat = "2.0.0-rc.4.0.0";
/**
 * The problem with just using the code version, is that the current version in the test is actually 0.0.0-xyz-test
 * we want to tell the test to use 0.0.0-xyz-test as the current version. If we are asking for an N-1 version, that
 * value needs to be different. I.e. the current head is at 2.0.0-internal.6.2.0, then N-1 is 2.0.0-internal.5.x.y.
 * Otherwise we would be comparing against 0.0.0-xyz-test which N-1 of that is 0.58, which is a very old version we do
 * not want to be testing against.
 *
 * @internal
 */
export function testBaseVersion(
	value: string | number | undefined,
	base: string = baseVersion,
	code: string = codeVersion,
) {
	if (typeof value === "string" || value === 0 || value === undefined) {
		return base;
	}
	return code;
}
