/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { buildForest } from "../../feature-libraries/object-forest";

import { InMemoryStoredSchemaRepository } from "../../schema-stored";
import { jsonSchemaData } from "../../domains";
import {
    defaultSchemaPolicy,
    jsonableTreeFromCursor,
    singleTextCursor,
} from "../../feature-libraries";
import { testForest } from "../forestTestSuite";
import { testJsonableTreeCursor } from "../cursorTestSuite";
import { initializeForest, moveToDetachedField, ITreeCursor } from "../../core";

testForest("object-forest", () =>
    buildForest(new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchemaData)),
);

testJsonableTreeCursor(
    "object-forest cursor",
    (data): ITreeCursor => {
        const forest = buildForest(
            new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchemaData),
        );
        initializeForest(forest, [singleTextCursor(data)]);
        const cursor = forest.allocateCursor();
        moveToDetachedField(forest, cursor);
        assert(cursor.firstNode());
        return cursor;
    },
    jsonableTreeFromCursor,
    false,
);
