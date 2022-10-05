/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Jsonable } from "@fluidframework/datastore-definitions";
import { LocalFieldKey, TreeSchemaIdentifier } from "../../schema-stored";
import { JsonCompatible, JsonCompatibleObject } from "../../util";
import {
    ITreeCursorNew as ITreeCursor,
    EmptyKey,
    FieldKey,
    mapCursorFieldNew,
    mapCursorFields,
} from "../../tree";
import { StackCursor, CursorAdapter } from "../../feature-libraries";
import {
    jsonArray, jsonBoolean, jsonNull, jsonNumber, jsonObject, jsonString,
} from "./jsonDomainSchema";

const adapter: CursorAdapter<JsonCompatible> = {
    keysFromNode: (node: JsonCompatible): readonly FieldKey[] => {
        switch (typeof node) {
            case "object":
                if (node === null) {
                    return [];
                } else if (Array.isArray(node)) {
                    return [EmptyKey];
                } else {
                    return Object.keys(node as object) as FieldKey[];
                }
            default:
               return [];
        }
    },
    getFieldFromNode: (node: JsonCompatible, key: FieldKey): readonly JsonCompatible[] => {
        if (key === EmptyKey && Array.isArray(node)) {
            return node;
        }

        const field = (node as JsonCompatibleObject)[key as LocalFieldKey];
        return field === undefined ? [] : [field];
    },
}

/**
 * An ITreeCursor implementation used to read a Jsonable tree for testing and benchmarking.
 *
 * @sealed
 */
export class JsonCursor<T> extends StackCursor<JsonCompatible> {
    constructor(root: Jsonable<T>) {
        super(root as JsonCompatible, adapter);
    }

    public get value(): any {
        const node = this.getNode();

        return typeof (node) === "object"
            ? undefined     // null, arrays, and objects have no defined value
            : node;         // boolean, numbers, and strings are their own value
    }

    public get type(): TreeSchemaIdentifier {
        const node = this.getNode();
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
    }

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
            return reader.value as number | boolean | string;
        case jsonArray.name: {
            reader.enterField(EmptyKey);
            const result = mapCursorFieldNew(reader, cursorToJsonObject);
            reader.exitField();
            return result;
        }
        case jsonObject.name: {
            const result: JsonCompatible = {};
            mapCursorFields(reader, (cursor) => {
                const key = cursor.getFieldKey() as LocalFieldKey;
                assert(cursor.firstNode() === true, 0x360 /* expected navigation ok */);
                result[key] = cursorToJsonObject(reader);
                cursor.exitNode();
            });
            return result;
        }
        default: {
            assert(type === jsonNull.name, 0x362 /* unexpected type */);
            return null;
        }
    }
}
