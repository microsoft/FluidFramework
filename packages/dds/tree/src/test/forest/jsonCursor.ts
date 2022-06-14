/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Serializable } from "@fluidframework/datastore-definitions";
import {
    ITreeCursor,
    TreeKey,
    TreeNavigationResult,
    TreeType
} from "../..";

export const enum JsonType {
    JsonNull    = 0,
    JsonBoolean = 1,
    JsonNumber  = 2,
    JsonString  = 3,
    JsonArray   = 4,
    JsonObject  = 5,
};

export class JsonCursor implements ITreeCursor {
    private currentNode: any;
    private currentKey: TreeKey;
    private currentIndex: number;

    private readonly parentStack: any[] = [];
    private readonly keyStack: TreeKey[] = [];
    private readonly indexStack: number[] = [];

    constructor(root: any) {
        this.currentNode = root;
        this.currentKey = "" as TreeKey;
        this.currentIndex = -1;
    }

    down(key: TreeKey, index: number): TreeNavigationResult {
        const parentNode = this.currentNode;
        let childNode: any;

        if (key === "" && Array.isArray(parentNode)) {
            if (!((index >>> 0) < parentNode.length)) {
                return TreeNavigationResult.NotFound;
            } else {
                childNode = parentNode[index];
            }
        } else {
            childNode = parentNode[key];
            if (childNode === undefined) {
                return TreeNavigationResult.NotFound;
            }
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
        if (this.parentStack.length < 1) {
            return TreeNavigationResult.NotFound;
        }

        this.currentNode = this.parentStack.pop()!;
        this.currentKey = this.keyStack.pop()!;
        this.currentIndex = this.indexStack.pop()!;

        return TreeNavigationResult.Ok;
    }

    get type(): TreeType {
        const node = this.currentNode;
        const type = typeof node;

        switch (type) {
            case "number":
                return JsonType.JsonNumber as TreeType;
            case "string":
                return JsonType.JsonString as TreeType;
            case "boolean":
                return JsonType.JsonBoolean as TreeType;
            default:
                if (node === null) {
                    return JsonType.JsonNull as TreeType;
                } else if (Array.isArray(node)) {
                    return JsonType.JsonArray as TreeType;
                } else {
                    // assert.equal(type, "object");
                    return JsonType.JsonObject as TreeType;
                }
        }
    }

    get keys(): Iterable<TreeKey> {
        return this.currentNode !== null
            ? Object.keys(this.currentNode) as Iterable<TreeKey>
            : [];
    }

    length(key: TreeKey): number {
        const node = this.currentNode;

        if (key === "" && Array.isArray(node)) {
            return node.length;
        }

        return node === undefined
            ? 0
            : 1;
    }

    get value(): Serializable {
        const node = this.currentNode;

        return typeof (node) === "object"
            ? undefined
            : node;
    }
}
