/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { JsonCursor } from "../domains";
import { ObjectForest } from "../feature-libraries";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { jsonableTreeFromCursor, singleTextCursor } from "../feature-libraries/treeTextCursor";
import { initializeForest, ITreeCursor, TreeNavigationResult } from "../forest";
import { testJsonCompatibleCursor } from "./forest";

function checkTextCursorRequirements(clone: Jsonable, expected: Jsonable) {
    // Check objects are actually json compatible
    if (typeof clone === "object") {
        const text = JSON.stringify(clone);
        const parsed = JSON.parse(text);
        assert.deepEqual(parsed, expected);
    }
}

// Tests for TextCursor and jsonableTreeFromCursor.
testJsonCompatibleCursor("textTreeFormat", {
    factory: (data?: Jsonable) => singleTextCursor(jsonableTreeFromCursor(new JsonCursor(data))),
    checkAdditionalRoundTripRequirements: checkTextCursorRequirements,
});

// TODO: put these in a better place / unify with object forest tests.
testJsonCompatibleCursor("object-forest cursor", {
    factory: (data): ITreeCursor => {
        const forest = new ObjectForest();
        const normalized = jsonableTreeFromCursor(new JsonCursor(data));
        // console.log(normalized);
        initializeForest(forest, [normalized]);
        const cursor = forest.allocateCursor();
        assert.equal(forest.tryMoveCursorTo(forest.root(forest.rootField), cursor), TreeNavigationResult.Ok);
        return cursor;
    },
    checkAdditionalRoundTripRequirements: checkTextCursorRequirements,
});
