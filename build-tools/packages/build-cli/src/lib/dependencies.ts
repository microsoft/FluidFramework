/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	InterdependencyRange,
	VersionBumpType,
	detectVersionScheme,
	getVersionRange,
} from "@fluid-tools/version-tools";
import {
	Context,
	Logger,
	MonoRepo,
	Package,
	VersionBag,
	updatePackageJsonFile,
} from "@fluidframework/build-tools";
import execa from "execa";
import { readJson, writeFile } from "fs-extra";
import path from "node:path";
import { format as prettier, resolveConfig as resolvePrettierConfig } from "prettier";
import semver from "semver";

export interface DependencyWithRange {
	pkg: Package;
	range: InterdependencyRange | VersionBumpType;
}
