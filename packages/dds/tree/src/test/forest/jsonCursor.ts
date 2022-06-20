/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Jsonable } from "@fluidframework/datastore-definitions";
import {
    ITreeCursor,
    EmptyKey,
    FieldKey,
    TreeNavigationResult,
    TreeType,
} from "../../..";

/** NodeTypes used by the JsonCursor. */
export const enum JsonType {
    Null = 0,
    Boolean = 1,
    Number = 2,
    String = 3,
    Array = 4,
    Object = 5,
}

/**
 * An ITreeCursor implementation used to read a JSONable tree for testing and benchmarking.
 */
export class JsonCursor<T> implements ITreeCursor {
    // PERF: JsonCursor maintains a stack of nodes/edges traversed.  This stack is
    //       partitioned across 3 arrays, with the top of the stack stored in fields.
    //       This design was advantageous in a similar tree visitor, but should
    //       be benchmarked measured again to see if this still provides an advantage.

    private currentNode: any;       // The node currently being visited.
    private currentKey: FieldKey;   // The parent key used to navigate to this node.
    private currentIndex: number;   // The parent index used to navigate to this node.

    private readonly parentStack: any[] = [];       // Ancestors traversed to visit this node.
    private readonly keyStack: FieldKey[] = [];     // Keys traversed to visit this node, excluding the most recent.
    private readonly indexStack: number[] = [];     // Indices traversed to visit this node, excluding the most recent.

    constructor(root: Jsonable<T>) {
        this.currentNode = root;
        this.currentKey = EmptyKey;
        this.currentIndex = -1;
    }

    down(key: FieldKey, index: number): TreeNavigationResult {
        const parentNode = this.currentNode;
        let childNode: any;

        if (key === EmptyKey && Array.isArray(parentNode)) {
            childNode = parentNode[index];
        } else if (index === 0) {
            childNode = parentNode[key];
        } else {
            return TreeNavigationResult.NotFound;
        }

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

    up(): TreeNavigationResult {
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

    get type(): TreeType {
        const node = this.currentNode;
        const type = typeof node;

        switch (type) {
            case "number":
                return JsonType.Number as TreeType;
            case "string":
                return JsonType.String as TreeType;
            case "boolean":
                return JsonType.Boolean as TreeType;
            default:
                if (node === null) {
                    return JsonType.Null as TreeType;
                } else if (Array.isArray(node)) {
                    return JsonType.Array as TreeType;
                } else {
                    return JsonType.Object as TreeType;
                }
        }
    }

    get keys(): Iterable<FieldKey> {
        const node = this.currentNode;

        // It is legal to invoke 'keys()' on a node of type 'JsonType.Null', which requires a
        // special to avoid 'Object.keys()' throwing.  We do not require a special case for
        // 'undefined', as both JSON and the SharedTree data model represent 'undefined' via
        // omission (except at the root, where JSON coerces undefined to null).
        return node !== null
            ? Object.keys(node) as Iterable<FieldKey>
            : [];
    }

    length(key: FieldKey): number {
        const node = this.currentNode;

        // The length of an array's indexer is equal to the length of the array.
        if (key === EmptyKey && Array.isArray(node)) {
            return node.length;
        }

        return node[key] === undefined
            ? 0     // A field with an undefined value has 0 length
            : 1;    // All other fields have a length of 1
    }

    get value(): Jsonable {
        const node = this.currentNode;

        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return typeof (node) === "object"
            ? undefined     // null, arrays, and objects have no defined value
            : node;         // boolean, numbers, and strings are their own value
    }
}
