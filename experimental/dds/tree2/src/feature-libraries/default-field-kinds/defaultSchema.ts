/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FullSchemaPolicy } from "../modular-schema";
import { fieldKinds } from "./defaultFieldKinds";

/**
 * FullSchemaPolicy with the default field kinds.
 * @public
 */
export const defaultSchemaPolicy: FullSchemaPolicy = {
	fieldKinds,
};
