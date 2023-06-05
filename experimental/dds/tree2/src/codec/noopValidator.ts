/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Static, TSchema } from "@sinclair/typebox";
import { JsonValidator } from "./codec";

/**
 * A {@link JsonValidator} implementation which performs no validation and accepts all data as valid.
 * @privateRemarks - This is useful to avoid conditional branching in codecs when the SharedTree configurer
 * passes no validator.
 * @alpha
 */
export const noopValidator: JsonValidator = {
	compile: <Schema extends TSchema>() => ({ check: (data): data is Static<Schema> => true }),
};
