/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { ObjectForest } from "../feature-libraries/object-forest";

import {
    fieldSchema, rootFieldKey,
    isNeverField, FieldKind,
} from "../schema";
import { TreeNavigationResult } from "../forest";

// Allow importing specific example files:
/* eslint-disable-next-line import/no-internal-modules */
import { json as jsonSchema, jsonTypes } from "./schema/examples/JsonDomainSchema";

// TODO: move JsonCursor to test utilities or non test code.
/* eslint-disable-next-line import/no-internal-modules */
import { JsonCursor, extract } from "./forest/jsonCursor";

describe("object-forest", () => {
    it("basic usage", () => {
        const forest = new ObjectForest();
        const schema = forest.schema;

        for (const t of jsonSchema) {
            assert(schema.tryUpdateTreeSchema(t.name, t));
        }

        const rootField = fieldSchema(FieldKind.Optional, [...jsonTypes]);
        assert(schema.tryUpdateFieldSchema(rootFieldKey, rootField));

        // Check schema is actually valid. If we forgot to add some required types this would fail.
        assert(!isNeverField(schema, rootField));

        const dataToInsert = { blah: "test" };
        const insertCursor = new JsonCursor(dataToInsert);
        const clone = extract(insertCursor);
        assert.deepEqual(clone, dataToInsert);
        const newRange = forest.add([insertCursor]);
        const dst = { index: 0, range: forest.rootField };
        forest.attachRangeOfChildren(dst, newRange);

        const reader = forest.allocateCursor();
        assert(forest.tryGet(forest.root, reader) === TreeNavigationResult.Ok);

        // copy data from reader into json object and compare to dataToInsert.
        const copy = extract(reader);
        assert.deepEqual(copy, dataToInsert);
    });
});
