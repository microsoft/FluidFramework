/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Static, TSchema } from "@sinclair/typebox";

import type { JsonValidator } from "./codec.js";

/**
 * A {@link JsonValidator} implementation which performs no validation and accepts all data as valid.
 * @privateRemarks Having this as an option unifies opting out of validation with selection of
 * validators, simplifying code performing validation.
 * @alpha
 */
export const noopValidator: JsonValidator = {
	compile: <Schema extends TSchema>() => ({ check: (data): data is Static<Schema> => true }),
};
