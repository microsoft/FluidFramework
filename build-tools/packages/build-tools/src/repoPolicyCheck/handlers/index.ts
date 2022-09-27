/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { handler as assertShortCodeHandler } from "./assertShortCode";
import { handlers as copyrightFileHeaderHandlers } from "./copyrightFileHeader";
import { handler as dockerfilePackageHandler } from "./dockerfilePackages";
import { handler as fluidCaseHandler } from "./fluidCase";
import { handlers as lockfilesHandlers } from "./lockfiles";
import { handlers as npmPackageContentsHandlers } from "./npmPackages";
import { Handler } from "../common";

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
];
