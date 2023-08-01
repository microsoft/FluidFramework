/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fieldSchema } from "../../core";
import { FullSchemaPolicy } from "../modular-schema";
import { forbidden, fieldKinds } from "./defaultFieldKinds";

/**
 * FieldStoredSchema which is impossible to put anything in.
 * @alpha
 */
export const emptyField = fieldSchema(forbidden, []);

/**
 * FullSchemaPolicy with the default field kinds.
 * @alpha
 */
export const defaultSchemaPolicy: FullSchemaPolicy = {
	fieldKinds,
};
