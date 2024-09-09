/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getInstalledPackageVersion } from "../taskUtils";
import { TscDependentTask } from "./tscTask";

export class GenerateEntrypointsTask extends TscDependentTask {
	protected get configFileFullPaths() {
		// Add package.json, which tsc should also depend on, but currently doesn't.
		return [this.node.pkg.packageJsonFileName];
	}

	protected async getToolVersion() {
		return getInstalledPackageVersion("@fluid-tools/build-cli", this.node.pkg.directory);
	}
}
