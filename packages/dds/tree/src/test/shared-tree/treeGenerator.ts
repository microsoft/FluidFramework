/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRandom, makeRandom } from "@fluid-internal/stochastic-test-utils";
import { TransactionResult } from "../../checkout";
import { FieldKinds, namedTreeSchema, singleTextCursor } from "../../feature-libraries";
import { fieldSchema, GlobalFieldKey, SchemaData } from "../../schema-stored";
import { ISharedTree } from "../../shared-tree";
import {
    FieldKey,
    JsonableTree,
    rootFieldKey,
    rootFieldKeySymbol,
    TreeValue,
    UpPath,
} from "../../tree";
import { brand, fail } from "../../util";

export type TreeNodePaths = Map<string, PathInfo>;

export interface TreeEdit {
    editType: string;
    path: string;
    index: number;
    value: number;
    field: string;
}

export type NodeValues = Map<number, number>;

export type PathInfo = Map<string, NodeValues>;

const rootPath = {
    parent: "undefined",
    parentField: "rootFieldKeySymbol",
    parentIndex: 0,
};

const fooKey: FieldKey = brand("foo");
const fooKey2: FieldKey = brand("foo2");

type FieldKeyTypes = GlobalFieldKey | FieldKey;
const fieldsPool = new Map<string, FieldKeyTypes>();
fieldsPool.set("rootFieldKeySymbol", rootFieldKeySymbol);
fieldsPool.set("fooKey", fooKey);
fieldsPool.set("fooKey2", fooKey2);

const rootValue = makeRandom(0).integer(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
const initialPaths: TreeNodePaths = new Map<string, PathInfo>();
const rootPathInfo: PathInfo = new Map<string, NodeValues>();
const rootNodeValues: NodeValues = new Map<number, number>();
rootNodeValues.set(0, rootValue);
rootPathInfo.set("rootFieldKeySymbol", rootNodeValues);
initialPaths.set(JSON.stringify(rootPath), rootPathInfo);

const initialEdits: TreeEdit[] = [];
const rootEdit: TreeEdit = {
    editType: "insert",
    path: JSON.stringify(rootPath),
    index: 0,
    value: rootValue,
    field: "rootFieldKeySymbol",
};
initialEdits.push(rootEdit);

export function treeGenerator(
    state: TreeNodePaths = initialPaths,
    edits: TreeEdit[] = initialEdits,
    seed: number,
): any {
    const random = makeRandom(seed);
    const treeType = random.pick(["leaf", "stick", "balanced"]);
    const path = selectRandomPath(state, random);
    const field = random.pick(Array.from(fieldsPool.keys()));
    switch (treeType) {
        case "leaf":
            addLeaf(state, path, field, edits, random);
            return { state, edits };
        case "stick":
            addStick(state, path, edits, random);
            return { state, edits };
        case "balanced":
            addBalanced(state, path, edits, random);
            return { state, edits };
        default:
            fail(`Unexpected treeType ${treeType}`);
    }
}

function selectRandomPath(state: TreeNodePaths, random: IRandom): string {
    const paths = Array.from(state.keys());
    const path = random.pick(paths);
    return path;
}

function addLeaf(
    state: TreeNodePaths,
    path: string,
    field: string,
    edits: TreeEdit[],
    random: IRandom,
) {
    const pathInfo = state.get(path);
    const fieldData = pathInfo?.get(field);
    const indices = fieldData !== undefined ? Array.from(fieldData.keys()) : [];
    const index = getMaxIndex(indices);
    const value = random.integer(0, Number.MAX_SAFE_INTEGER);
    const nodeValue: NodeValues = new Map<number, number>();
    nodeValue.set(index, value);
    if (pathInfo === undefined) {
        const newPathInfo: PathInfo = new Map<string, NodeValues>();
        newPathInfo.set(field, nodeValue);
        state.set(path, newPathInfo);
    } else {
        pathInfo.set(field, nodeValue);
        state.set(path, pathInfo);
    }
    const edit = {
        editType: "insert",
        path,
        index,
        value,
        field,
    };
    edits.push(edit);
}

function addStick(state: TreeNodePaths, path: string, edits: TreeEdit[], random: IRandom) {
    const parentPath = parseParentPath(JSON.parse(path));
    const pathInfo = state.get(path);
    const availableFields = pathInfo !== undefined ? Array.from(pathInfo.keys()) : [];
    const parentField = random.pick(availableFields);
    const availableIndices = getCurrentIndices(state, path, parentField);
    const index = random.pick(availableIndices);
    const newPath = {
        parent: parentPath,
        parentField,
        parentIndex: index,
    };
    const newPathKey = JSON.stringify(newPath);
    const nodeField = random.pick(Array.from(fieldsPool.keys()));
    if (state.has(newPathKey)) {
        addLeaf(state, newPathKey, nodeField, edits, random);
    } else {
        const value = random.integer(0, Number.MAX_SAFE_INTEGER);
        const newPathInfo: PathInfo = new Map<string, NodeValues>();
        const newNodeValues: NodeValues = new Map<number, number>();
        newNodeValues.set(0, value);
        newPathInfo.set(nodeField, newNodeValues);
        state.set(newPathKey, newPathInfo);
        const edit = {
            editType: "insert",
            path: newPathKey,
            index,
            value,
            field: nodeField,
        };
        edits.push(edit);
    }
}

function addBalanced(state: TreeNodePaths, path: string, edits: TreeEdit[], random: IRandom): any {
    addStick(state, path, edits, random);
    addStick(state, path, edits, random);
}

function parseParentPath(path: any): any {
    const parsedPath = {
        parent: path.parent,
        parentField: path.parentField,
        parentIndex: path.parentIndex,
    };
    return parsedPath;
}

function getMaxIndex(indices: number[]): number {
    if (indices.length === 0) {
        return 0;
    }
    return Math.max(...indices) + 1;
}

function getCurrentIndices(state: TreeNodePaths, path: string, field: string) {
    const nodeInfo = state.get(path)?.get(field);
    const indices = nodeInfo !== undefined ? Array.from(nodeInfo.keys()) : [];
    return indices;
}

const globalFieldKey: GlobalFieldKey = brand("globalFieldKey");
const rootFieldSchema = fieldSchema(FieldKinds.value);
const globalFieldSchema = fieldSchema(FieldKinds.value);
const rootNodeSchema = namedTreeSchema({
    name: brand("TestValue"),
    localFields: {
        optionalChild: fieldSchema(FieldKinds.optional, [brand("TestValue")]),
    },
    extraLocalFields: fieldSchema(FieldKinds.sequence),
    globalFields: [globalFieldKey],
});
const testSchema: SchemaData = {
    treeSchema: new Map([[rootNodeSchema.name, rootNodeSchema]]),
    globalFieldSchema: new Map([
        [rootFieldKey, rootFieldSchema],
        [globalFieldKey, globalFieldSchema],
    ]),
};

const convertToUpPath = (obj: { [x: string]: any }) => {
    Object.keys(obj).forEach((key) => {
        console.log(`key: ${key}, value: ${obj[key]}`);
        if (key === "parentField") {
            obj[key] = fieldsPool.get(obj[key]);
        } else if (key === "parent" && obj[key] === "undefined") {
            obj[key] = undefined;
        }

        if (typeof obj[key] === "object" && obj[key] !== null) {
            convertToUpPath(obj[key]);
        }
    });
    return obj;
};

export function applyTreeEdits(tree: ISharedTree, edits: TreeEdit[]): void {
    initializeTestTreeWithValue(tree, 42);
    for (const edit of edits) {
        const editPath = convertToUpPath(JSON.parse(edit.path));
        const path: UpPath = {
            parent: editPath.parent,
            parentField: editPath.parentField,
            parentIndex: editPath.parentIndex,
        };
        const index = edit.index;
        const value = edit.value;
        const editField = fieldsPool.get(edit.field);

        tree.runTransaction((forest, editor) => {
            const writeCursor = singleTextCursor({ type: brand("TestValue"), value });
            const field = editor.sequenceField(path, editField as FieldKey);
            field.insert(index, writeCursor);
            return TransactionResult.Apply;
        });
    }
}

/**
 * Updates the given `tree` to the given `schema` and inserts `state` as its root.
 */
function initializeTestTree(
    tree: ISharedTree,
    state: JsonableTree,
    schema: SchemaData = testSchema,
): void {
    tree.storedSchema.update(schema);

    // Apply an edit to the tree which inserts a node with a value
    tree.runTransaction((forest, editor) => {
        const writeCursor = singleTextCursor(state);
        const field = editor.sequenceField(undefined, rootFieldKeySymbol);
        field.insert(0, writeCursor);

        return TransactionResult.Apply;
    });
}

/**
 * Inserts a single node under the root of the tree with the given value.
 * Use {@link getTestValue} to read the value.
 */
function initializeTestTreeWithValue(tree: ISharedTree, value: TreeValue): void {
    initializeTestTree(tree, { type: brand("TestValue"), value });
}
