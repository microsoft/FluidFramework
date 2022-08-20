/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { ObjectForest } from "../feature-libraries/object-forest";
import { jsonTypeSchema } from "../domains";
import { defaultSchemaPolicy } from "../feature-libraries";
import { SchemaData, StoredSchemaRepository } from "../schema-stored";

import { testForest } from "./forest";

const schemaData: SchemaData = {
    globalFieldSchema: new Map(),
    treeSchema: jsonTypeSchema,
};
testForest("object-forest", () => new ObjectForest(new StoredSchemaRepository(defaultSchemaPolicy, schemaData)));
