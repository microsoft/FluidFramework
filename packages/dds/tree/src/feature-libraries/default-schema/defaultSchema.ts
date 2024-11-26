/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { FullSchemaPolicy } from "../modular-schema/index.js";

import { fieldKinds } from "./defaultFieldKinds.js";

/**
 * FullSchemaPolicy with the default field kinds.
 */
export const defaultSchemaPolicy: FullSchemaPolicy = {
	fieldKinds,
	validateSchema: false,
	allowUnknownOptionalFields: () => false,
};
