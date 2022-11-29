/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import {
    LocalFieldKey,
    ITreeCursor,
    EmptyKey,
    FieldKey,
    mapCursorField,
    mapCursorFields,
    ITreeCursorSynchronous,
} from "../../core";
import { JsonCompatible, JsonCompatibleObject } from "../../util";
import { CursorAdapter, isPrimitiveValue, singleStackTreeCursor } from "../../feature-libraries";
import {
    jsonArray,
    jsonBoolean,
    jsonNull,
    jsonNumber,
    jsonObject,
    jsonString,
} from "./jsonDomainSchema";

const adapter: CursorAdapter<JsonCompatible> = {
    value: (node: JsonCompatible) =>
        typeof node === "object"
            ? undefined // null, arrays, and objects have no defined value
            : node, // boolean, numbers, and strings are their own value
    type: (node: JsonCompatible) => {
        const type = typeof node;

        switch (type) {
            case "number":
                return jsonNumber.name;
            case "string":
                return jsonString.name;
            case "boolean":
                return jsonBoolean.name;
            default:
                if (node === null) {
                    return jsonNull.name;
                } else if (Array.isArray(node)) {
                    return jsonArray.name;
                } else {
                    return jsonObject.name;
                }
        }
    },
    keysFromNode: (node: JsonCompatible): readonly FieldKey[] => {
        switch (typeof node) {
            case "object":
                if (node === null) {
                    return [];
                } else if (Array.isArray(node)) {
                    return node.length === 0 ? [] : [EmptyKey];
                } else {
                    return (Object.keys(node) as FieldKey[]).filter((key) => {
                        const value = node[key as LocalFieldKey];
                        return !Array.isArray(value) || value.length !== 0;
                    });
                }
            default:
                return [];
        }
    },
    getFieldFromNode: (node: JsonCompatible, key: FieldKey): readonly JsonCompatible[] => {
        if (node === null) {
            return [];
        }

        if (Array.isArray(node)) {
            return key === EmptyKey ? node : [];
        }

        if (Object.prototype.hasOwnProperty.call(node, key)) {
            const field = (node as JsonCompatibleObject)[key as LocalFieldKey];
            assert(
                field !== undefined,
                0x41e /* explicit undefined fields should not be preserved in JSON */,
            );
            return [field];
        }

        return [];
    },
};

/**
 * Used to read a Jsonable tree for testing and benchmarking.
 *
 * @returns an {@link ITreeCursorSynchronous} for a single {@link JsonCompatible}.
 */
export function singleJsonCursor(root: JsonCompatible): ITreeCursorSynchronous {
    return singleStackTreeCursor(root, adapter);
}

/**
 * Extract a JS object tree from the contents of the given ITreeCursor.
 * Assumes that ITreeCursor contains only unaugmented JsonTypes.
 */
export function cursorToJsonObject(reader: ITreeCursor): JsonCompatible {
    const type = reader.type;

    switch (type) {
        case jsonNumber.name:
        case jsonBoolean.name:
        case jsonString.name:
            assert(isPrimitiveValue(reader.value), 0x41f /* expected a primitive value */);
            return reader.value as JsonCompatible;
        case jsonArray.name: {
            reader.enterField(EmptyKey);
            const result = mapCursorField(reader, cursorToJsonObject);
            reader.exitField();
            return result;
        }
        case jsonObject.name: {
            const result: JsonCompatible = {};
            mapCursorFields(reader, (cursor) => {
                const key = cursor.getFieldKey() as LocalFieldKey;
                assert(cursor.firstNode(), 0x420 /* expected non-empty field */);
                // like `result[key] = cursorToJsonObject(reader);` except safe when keyString == "__proto__".
                Object.defineProperty(result, key, {
                    enumerable: true,
                    configurable: true,
                    writable: true,
                    value: cursorToJsonObject(reader),
                });
                assert(!cursor.nextNode(), 0x421 /* expected exactly one node */);
            });
            return result;
        }
        default: {
            assert(type === jsonNull.name, 0x422 /* unexpected type */);
            return null;
        }
    }
}
