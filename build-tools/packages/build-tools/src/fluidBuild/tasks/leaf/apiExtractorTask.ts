/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getInstalledPackageVersion } from "../../../common/taskUtils";
import { TscDependentTask } from "./tscTask";

export class ApiExtractorTask extends TscDependentTask {
	protected get configFileFullPaths() {
		return [
			this.getPackageFileFullPath("api-extractor.json"),
			this.getPackageFileFullPath("api-extractor-esm.json"),
			this.getPackageFileFullPath("api-extractor-lint.json"),
		];
	}

	protected async getToolVersion() {
		return getInstalledPackageVersion("@microsoft/api-extractor", this.node.pkg.directory);
	}
}
