/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type Handler } from "./common.js";
import { handlers as copyrightFileHeaderHandlers } from "./copyrightFileHeader.js";
import { handler as dockerfilePackageHandler } from "./dockerfilePackages.js";
import { handlers as fluidBuildTasks } from "./fluidBuildTasks.js";
import { handler as fluidCaseHandler } from "./fluidCase.js";
import { handlers as lockfileHandlers } from "./lockfiles.js";
import { handler as noJsFileHandler } from "./noJsFiles.js";
import { handlers as npmPackageContentsHandlers } from "./npmPackages.js";
import { handlers as pnpmHandlers } from "./pnpm.js";
import { handler as yamlTabsHandler } from "./spacesOverTabsInYaml.js";

/**
 * declared file handlers
 */
export const policyHandlers: Handler[] = [
	...copyrightFileHeaderHandlers,
	...npmPackageContentsHandlers,
	dockerfilePackageHandler,
	fluidCaseHandler,
	...lockfileHandlers,
	...pnpmHandlers,
	...fluidBuildTasks,
	noJsFileHandler,
	yamlTabsHandler,
];

export { type Handler } from "./common.js";
