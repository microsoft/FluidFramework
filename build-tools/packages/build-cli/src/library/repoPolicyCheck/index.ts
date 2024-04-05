/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { handler as assertShortCodeHandler } from "./assertShortCode";
import { type Handler } from "./common";
import { handlers as copyrightFileHeaderHandlers } from "./copyrightFileHeader";
import { handler as dockerfilePackageHandler } from "./dockerfilePackages";
import { handlers as fluidBuildTasks } from "./fluidBuildTasks";
import { handler as fluidCaseHandler } from "./fluidCase";
import { handlers as lockfileHandlers } from "./lockfiles";
import { handler as noJsFileHandler } from "./noJsFiles";
import { handlers as npmPackageContentsHandlers } from "./npmPackages";
import { handlers as pnpmHandlers } from "./pnpm";

/**
 * declared file handlers
 */
export const policyHandlers: Handler[] = [
	...copyrightFileHeaderHandlers,
	...npmPackageContentsHandlers,
	dockerfilePackageHandler,
	fluidCaseHandler,
	...lockfileHandlers,
	assertShortCodeHandler,
	...pnpmHandlers,
	...fluidBuildTasks,
	noJsFileHandler,
];

export { type Handler } from "./common";
