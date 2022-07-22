/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { Jsonable } from "@fluidframework/datastore-definitions";
import {
    ITreeCursor,
    mapCursorField,
    TreeNavigationResult,
} from "../../forest";
import {
    EmptyKey,
    FieldKey,
    TreeType,
    Value,
} from "../../tree";

import {
    jsonArray, jsonBoolean, jsonNull, jsonNumber, jsonObject, jsonString,
} from "./jsonDomainSchema";

/**
 * An ITreeCursor implementation used to read a Jsonable tree for testing and benchmarking.
 */
export class JsonCursor<T> implements ITreeCursor {
    // PERF: JsonCursor maintains a stack of nodes/edges traversed.  This stack is
    //       partitioned across 3 arrays, with the top of the stack stored in fields.
    //       This design was advantageous in a similar tree visitor, but should
    //       be measured again to see if this still provides an advantage.

    private currentNode: unknown;   // The node currently being visited.
    private currentKey?: FieldKey;  // The parent key used to navigate to this node.
    private currentIndex: number;   // The parent index used to navigate to this node.

    private readonly parentStack: unknown[] = [];  // Ancestors traversed to visit this node.

    // Keys/indices traversed to visit the current node, excluding the most recent,
    // which are maintained in the current key/index fields.
    private readonly keyStack: (FieldKey | undefined)[] = [];
    private readonly indexStack: number[] = [];

    constructor(root: Jsonable<T>) {
        this.currentNode = root;
        this.currentKey = undefined;
        this.currentIndex = -1;
    }

    public seek(offset: number): { result: TreeNavigationResult; moved: number; } {
        if (offset === 0) {
            return { result: TreeNavigationResult.Ok, moved: 0 };
        }

        // TODO: Measure if maintaining immediate parent in a field improves seek
        //       performance.
        const parent = this.parentStack[this.parentStack.length - 1];

        // The only seekable key is the 'EmptyKey' of an array.
        if (this.currentKey !== EmptyKey || !Array.isArray(parent)) {
            return { result: TreeNavigationResult.NotFound, moved: 0 };
        }

        const newIndex = this.currentIndex + offset;
        const newChild = (parent as any)[newIndex];

        if (newChild === undefined) {
            // In JSON, arrays must be dense and may not contain 'undefined' values
            // ('undefined' items are implicitly coerced to 'null' by stringify()).
            assert(0 > newIndex || newIndex >= (parent as unknown as []).length,
                "JSON arrays must be dense / contain no 'undefined' items.");

            return { result: TreeNavigationResult.NotFound, moved: 0 };
        } else {
            const moved = newIndex - this.currentIndex;
            this.currentNode = newChild;
            this.currentIndex = newIndex;
            return { result: TreeNavigationResult.Ok, moved };
        }
    }

    public down(key: FieldKey, index: number): TreeNavigationResult {
        const parentNode = this.currentNode;
        let childNode: any;

        if (key === EmptyKey && Array.isArray(parentNode)) {
            childNode = parentNode[index];
        } else if (index === 0) {
            childNode = (parentNode as any)[key as string];
        } else {
            return TreeNavigationResult.NotFound;
        }

        // Like JSON, we model 'undefined' values by omitting the field.
        if (childNode === undefined) {
            return TreeNavigationResult.NotFound;
        }

        this.parentStack.push(parentNode);
        this.currentNode = childNode;

        this.keyStack.push(this.currentKey);
        this.currentKey = key;

        this.indexStack.push(this.currentIndex);
        this.currentIndex = index;

        return TreeNavigationResult.Ok;
    }

    public up(): TreeNavigationResult {
        // TODO: Should benchmark vs. detecting via returned 'undefined' from 'pop()'.
        if (this.parentStack.length < 1) {
            return TreeNavigationResult.NotFound;
        }

        /* eslint-disable @typescript-eslint/no-non-null-assertion */
        this.currentNode = this.parentStack.pop()!;
        this.currentKey = this.keyStack.pop()!;
        this.currentIndex = this.indexStack.pop()!;
        /* eslint-enable @typescript-eslint/no-non-null-assertion */

        return TreeNavigationResult.Ok;
    }

    public get type(): TreeType {
        const node = this.currentNode;
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

    public get keys(): Iterable<FieldKey> {
        const node = this.currentNode;
        const type = typeof node;

        switch (type) {
            case "object":
                if (node === null) {
                    return [];
                } else if (Array.isArray(node)) {
                    return [EmptyKey];
                } else {
                    return Object.keys(node as object) as Iterable<FieldKey>;
                }
            default:
               return [];
        }
    }

    public length(key: FieldKey): number {
        const node = this.currentNode;

        // The 'Empty' field is used to access the indexer of array nodes.
        if (key === EmptyKey && Array.isArray(node)) {
            return node.length;
        }

        return (node as any)[key as string] === undefined
            ? 0     // A field with an undefined value has 0 length
            : 1;    // All other fields have a length of 1
    }

    public get value(): Value {
        const node = this.currentNode;

        return typeof (node) === "object"
            ? undefined     // null, arrays, and objects have no defined value
            : node;         // boolean, numbers, and strings are their own value
    }
}

/**
 * Extract a JS object tree from the contents of the given ITreeCursor.
 * Assumes that ITreeCursor contains only unaugmented JsonTypes.
 */
export function cursorToJsonObject(reader: ITreeCursor): unknown {
    const type = reader.type;

    switch (type) {
        case jsonNumber.name:
        case jsonBoolean.name:
        case jsonString.name:
            return reader.value;
        case jsonArray.name: {
            const result = mapCursorField(reader, EmptyKey, cursorToJsonObject);
            return result;
        }
        case jsonObject.name: {
            const result: any = {};
            for (const key of reader.keys) {
                assert(reader.down(key, 0) === TreeNavigationResult.Ok, "expected navigation ok");
                result[key as string] = cursorToJsonObject(reader);
                assert(reader.up() === TreeNavigationResult.Ok, "expected navigation ok");
            }
            return result;
        }
        default: {
            assert(type === jsonNull.name, "unexpected type");
            return null;
        }
    }
}
