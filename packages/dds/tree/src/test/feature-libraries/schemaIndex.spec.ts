/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { getSchemaString, parseSchemaString } from "../../feature-libraries/schemaIndex";

import { SchemaData } from "../../schema-stored";
import { rootFieldKey } from "../../tree";
import { jsonTypeSchema, jsonRoot } from "../../domains";
import { defaultSchemaPolicy, allowsRepoSuperset } from "../../feature-libraries";

describe("SchemaIndex", () => {
    it("roundtrip", () => {
        // Just test with the Json domain schema for now.
        // TODO: add more targeted tests, and tests for more cases.
        const data: SchemaData = {
            globalFieldSchema: new Map([[rootFieldKey, jsonRoot]]),
            treeSchema: jsonTypeSchema,
        };
        const s = getSchemaString(data);
        const parsed = parseSchemaString(s);
        const s2 = getSchemaString(parsed);
        assert.equal(s, s2);
        assert(allowsRepoSuperset(defaultSchemaPolicy, data, parsed));
        assert(allowsRepoSuperset(defaultSchemaPolicy, parsed, data));
    });

    // TODO: testing SchemaIndex class itself, specifically for attachment and normal summaries.
    // TODO: format compatibility tests to detect breaking of existing documents.
});
