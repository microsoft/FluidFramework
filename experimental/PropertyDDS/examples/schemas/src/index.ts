/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { schemas as SQUARES_DEMO_SCHEMAS } from "./squares_demo";
import PERSON_SCHEMAS from "./person_demo";

export { convertPSetSchema } from "./schemaConverter";

export { registerSchemas } from "./schemasRegisterer";

export { SQUARES_DEMO_SCHEMAS, PERSON_SCHEMAS };

export const ALL_SCHEMAS = {
    SQUARES_DEMO_SCHEMAS,
    PERSON_SCHEMAS,
};
