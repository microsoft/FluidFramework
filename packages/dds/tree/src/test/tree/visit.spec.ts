/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { jsonString } from "../../domains";
import { emptyField, FieldKinds, namedTreeSchema, singleTextCursor } from "../../feature-libraries";
import { FieldKey, Delta, DeltaVisitor, visitDelta, JsonableTree, fieldSchema, TreeSchemaIdentifier } from "../../core";
import { brand } from "../../util";
import { deepFreeze } from "../utils";
import { stringSchema } from "../feature-libraries/editable-tree/mockData";

export const childSchema = namedTreeSchema({
    name: brand("Test:Opsize-Bench-Child"),
    localFields: {
        data: fieldSchema(FieldKinds.value, [stringSchema.name]),
    },
    extraLocalFields: emptyField,
});

export const parentSchema = namedTreeSchema({
    name: brand("Test:Opsize-Bench-Root"),
    localFields: {
        children: fieldSchema(FieldKinds.sequence, [childSchema.name]),
    },
    extraLocalFields: emptyField,
});

const getJsonNode = (desiredByteSize: number): JsonableTree => {
    const node = {
        type: childSchema.name,
        fields: {
            data: [{ value: "", type: stringSchema.name }],
        },
    };

    const initialNodeByteSize = new TextEncoder().encode(JSON.stringify(node)).length;
    const sizeIncrementor = "a"; // 1 byte
    const remainingByteSizeToAdd = desiredByteSize - initialNodeByteSize;
    node.fields.data[0].value = sizeIncrementor.repeat(remainingByteSizeToAdd);
    return node;
};

const getInitialJsonTreeWithChildren = (numChildNodes: number, childNodeByteSize: number) => {
    const childNode = getJsonNode(childNodeByteSize);
    const jsonTree: {
        type: TreeSchemaIdentifier,
        fields: { children: JsonableTree[] }
    } = {
        type: parentSchema.name,
        fields: {
            children: [],
        },
    };
    for (let i = 0; i < numChildNodes; i++) {
        jsonTree.fields.children.push({ ...childNode });
    }
    return jsonTree;
};

function visit(delta: Delta.Root, visitor: DeltaVisitor): void {
    deepFreeze(delta);
    visitDelta(delta, visitor);
}

type CallSignatures<T> = {
    [K in keyof T]: T[K] extends (...args: any) => any ? [K, ...Parameters<T[K]>] : never;
};
type PropType<T> = T[keyof T];
type VisitCall = PropType<CallSignatures<DeltaVisitor>>;
type VisitScript = VisitCall[];

const visitorMethods: (keyof DeltaVisitor)[] = [
    "onDelete",
    "onInsert",
    "onMoveOut",
    "onMoveIn",
    "onSetValue",
    "enterNode",
    "exitNode",
    "enterField",
    "exitField",
];

function testVisit(delta: Delta.Root, expected: Readonly<VisitScript>): void {
    let callIndex = 0;
    const makeChecker =
        (name: string) =>
        (...args: unknown[]) => {
            assert.deepStrictEqual([name, ...args], expected[callIndex]);
            callIndex += 1;
        };
    const visitor: DeltaVisitor = {} as any;
    for (const methodName of visitorMethods) {
        visitor[methodName] = makeChecker(methodName);
    }
    visit(delta, visitor);
    assert.strictEqual(callIndex, expected.length);
}

function testTreeVisit(marks: Delta.MarkList, expected: Readonly<VisitScript>): void {
    testVisit(new Map([[rootKey, marks]]), [
        ["enterField", rootKey],
        ...expected,
        ["exitField", rootKey],
    ]);
}

const rootKey: FieldKey = brand("root");
const fooKey: FieldKey = brand("foo");
const nodeX = { type: jsonString.name, value: "X" };
const content = [singleTextCursor(nodeX)];

describe("visit", () => {
    it("empty delta", () => {
        testTreeVisit([], []);
    });

    it("set root value", () => {
        const mark: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };
        const expected: VisitScript = [
            ["enterNode", 0],
            ["onSetValue", 1],
            ["exitNode", 0],
        ];
        testTreeVisit([mark], expected);
    });

    it("set child value", () => {
        const mark: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };
        const delta: Delta.MarkList = [
            {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooKey, [42, mark]]]),
            },
        ];
        const expected: VisitScript = [
            ["enterNode", 0],
            ["enterField", fooKey],
            ["enterNode", 42],
            ["onSetValue", 1],
            ["exitNode", 42],
            ["exitField", fooKey],
            ["exitNode", 0],
        ];
        testTreeVisit(delta, expected);
    });

    it("insert root", () => {
        const mark: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content,
        };
        testTreeVisit([mark], [["onInsert", 0, content]]);
    });

    it("insert child", () => {
        const mark = {
            type: Delta.MarkType.Insert,
            content,
        };
        const delta: Delta.MarkList = [
            {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooKey, [42, mark]]]),
            },
        ];
        const expected: VisitScript = [
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onInsert", 42, content],
            ["exitField", fooKey],
            ["exitNode", 0],
        ];
        testTreeVisit(delta, expected);
    });

    it("delete root", () => {
        const mark: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        testTreeVisit([mark], [["onDelete", 0, 10]]);
    });

    it("delete child", () => {
        const mark: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const delta: Delta.MarkList = [
            {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooKey, [42, mark]]]),
            },
        ];
        const expected: VisitScript = [
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onDelete", 42, 10],
            ["exitField", fooKey],
            ["exitNode", 0],
        ];
        testTreeVisit(delta, expected);
    });

    it("the lot on a field", () => {
        const del: Delta.Delete = {
            type: Delta.MarkType.Delete,
            count: 10,
        };
        const ins: Delta.Insert = {
            type: Delta.MarkType.Insert,
            content,
        };
        const set: Delta.Modify = {
            type: Delta.MarkType.Modify,
            setValue: 1,
        };
        const delta: Delta.MarkList = [
            {
                type: Delta.MarkType.Modify,
                fields: new Map([[fooKey, [del, 3, ins, 1, set]]]),
            },
        ];
        const expected: VisitScript = [
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onDelete", 0, 10],
            ["onInsert", 3, content],
            ["enterNode", 5],
            ["onSetValue", 1],
            ["exitNode", 5],
            ["exitField", fooKey],
            ["exitNode", 0],
        ];
        testTreeVisit(delta, expected);
    });

    it("move children", () => {
        const moveId: Delta.MoveId = brand(1);
        const moveOut: Delta.MoveOut = {
            type: Delta.MarkType.MoveOut,
            count: 2,
            moveId,
        };

        const moveIn: Delta.MoveIn = {
            type: Delta.MarkType.MoveIn,
            moveId,
        };

        const delta: Delta.Root = new Map([
            [
                rootKey,
                [
                    {
                        type: Delta.MarkType.Modify,
                        fields: new Map([[fooKey, [2, moveOut, 3, moveIn]]]),
                    },
                ],
            ],
        ]);

        const expected: VisitScript = [
            ["enterField", rootKey],
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onMoveOut", 2, 2, moveId],
            ["exitField", fooKey],
            ["exitNode", 0],
            ["exitField", rootKey],
            ["enterField", rootKey],
            ["enterNode", 0],
            ["enterField", fooKey],
            ["onMoveIn", 5, 2, moveId],
            ["exitField", fooKey],
            ["exitNode", 0],
            ["exitField", rootKey],
        ];

        testVisit(delta, expected);
    });
});
