/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

// Allow importing from this specific file which is being tested:
/* eslint-disable-next-line import/no-internal-modules */
import { ObjectForest } from "../../feature-libraries/object-forest";

import {
    fieldSchema,
    InMemoryStoredSchemaRepository,
    StoredSchemaRepository,
} from "../../schema-stored";
import {
    IEditableForest,
    initializeForest,
    moveToDetachedField,
    TreeNavigationResult,
} from "../../forest";
import {
    jsonNumber,
    jsonObject,
    jsonSchemaData,
    jsonRoot,
    singleJsonCursor,
    cursorToJsonObject,
} from "../../domains";
import { recordDependency } from "../../dependency-tracking";
import {
    clonePath,
    Delta,
    JsonableTree,
    UpPath,
    rootFieldKey,
    mapCursorField,
    rootFieldKeySymbol,
    ITreeCursor,
} from "../../tree";
import { brand } from "../../util";
import {
    defaultSchemaPolicy,
    FieldKinds,
    isNeverField,
    jsonableTreeFromCursor,
    singleTextCursor,
} from "../../feature-libraries";
import { MockDependent } from "../utils";
import { testJsonableTreeCursor } from "../cursorTestSuite";

testForest(
    "object-forest",
    () => new ObjectForest(new InMemoryStoredSchemaRepository(defaultSchemaPolicy, jsonSchemaData)),
);
