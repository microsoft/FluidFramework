/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assertShortCodeHandler, copyrightFileHeaderHandlers, dockerfilePackageHandler, fluidCaseHandler, Handler, lockfilesHandlers, npmPackageContentsHandlers } from "../..";

/**
 * declared file handlers
 */
 export const handlers: Handler[] = [
    ...copyrightFileHeaderHandlers,
    ...npmPackageContentsHandlers,
    dockerfilePackageHandler,
    fluidCaseHandler,
    ...lockfilesHandlers,
    assertShortCodeHandler,
];
