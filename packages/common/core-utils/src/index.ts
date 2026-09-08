/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line no-restricted-syntax -- This external entrypoint includes all exports shared with the internal entrypoint.
export * from "./main.js";

import { assert as assertInternal } from "./assert.js";

// TODO:28084: when this export is removed, this special barrel file should be removed.
/**
 * @deprecated 3.0.0. This API will be removed in 3.10.0.
 * Use an assertion utility appropriate for your application instead.
 * See {@link https://github.com/microsoft/FluidFramework/issues/28084} for context.
 * @legacy @beta
 */
export const assert: (
	condition: boolean,
	message: string | number,
	debugMessageBuilder?: () => string,
) => asserts condition = assertInternal;
