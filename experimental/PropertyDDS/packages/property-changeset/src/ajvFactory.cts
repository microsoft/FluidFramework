/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/prefer-nullish-coalescing */
/* eslint-disable @typescript-eslint/strict-boolean-expressions */

import Ajv from "ajv";
import ajvKeywords from "ajv-keywords";

export const ajvFactory = new Ajv({
	allErrors: true,
	verbose: true,
});

ajvKeywords(ajvFactory, "prohibited");
ajvKeywords(ajvFactory, "typeof");
