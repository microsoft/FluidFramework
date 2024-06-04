/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FullSchemaPolicy } from "../modular-schema/index.js";

import { fieldKinds } from "./defaultFieldKinds.js";

/**
 * FullSchemaPolicy with the default field kinds.
 * @internal
 */
export const defaultSchemaPolicy: FullSchemaPolicy = {
	fieldKinds,
	validateSchema: false,
};
