/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { Handler } from "../common";
import { handler as assertShortCodeHandler } from "./assertShortCode";
import { handlers as copyrightFileHeaderHandlers } from "./copyrightFileHeader";
import { handler as dockerfilePackageHandler } from "./dockerfilePackages";
import { handler as fluidCaseHandler } from "./fluidCase";
import { handlers as lockfilesHandlers } from "./lockfiles";
import { handler as noJsFileHandler } from "./noJsFiles";
import { handlers as npmPackageContentsHandlers } from "./npmPackages";
import { handlers as pnpmHandlers } from "./pnpm";
import { handlers as fluidBuildTasks } from "./fluidBuildTasks";

/**
 * declared file handlers
 */
export const policyHandlers: Handler[] = [
	...copyrightFileHeaderHandlers,
	...npmPackageContentsHandlers,
	dockerfilePackageHandler,
	fluidCaseHandler,
	...lockfilesHandlers,
	assertShortCodeHandler,
	...pnpmHandlers,
	...fluidBuildTasks,
	noJsFileHandler,
];
