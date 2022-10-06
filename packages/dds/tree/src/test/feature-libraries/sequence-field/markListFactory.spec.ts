/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { SequenceField as SF } from "../../../feature-libraries";
import { TreeSchemaIdentifier } from "../../../schema-stored";
import { brand } from "../../../util";

const dummyMark: SF.Detach = { type: "Delete", id: 0, count: 1 };
const type: TreeSchemaIdentifier = brand("Node");

describe("SequenceField - MarkListFactory", () => {
    it("Inserts an offset when there is content after the offset", () => {
        const factory = new SF.MarkListFactory();
        factory.pushOffset(42);
        factory.pushContent(dummyMark);
        assert.deepStrictEqual(factory.list, [42, dummyMark]);
    });

    it("Does not insert 0-length offsets", () => {
        const factory = new SF.MarkListFactory();
        factory.pushOffset(0);
        factory.pushContent(dummyMark);
        assert.deepStrictEqual(factory.list, [dummyMark]);
    });

    it("Merges runs of offsets into a single offset", () => {
        const factory = new SF.MarkListFactory();
        factory.pushOffset(42);
        factory.pushOffset(42);
        factory.pushContent(dummyMark);
        assert.deepStrictEqual(factory.list, [84, dummyMark]);
    });

    it("Does not insert an offset when there is no content after the offset", () => {
        const factory = new SF.MarkListFactory();
        factory.pushContent(dummyMark);
        factory.pushOffset(42);
        factory.pushOffset(42);
        assert.deepStrictEqual(factory.list, [dummyMark]);
    });

    it("Can merge consecutive inserts", () => {
        const factory = new SF.MarkListFactory();
        const insert1: SF.Insert = { type: "Insert", id: 0, content: [{ type, value: 1 }] };
        const insert2: SF.Insert = { type: "Insert", id: 0, content: [{ type, value: 2 }] };
        factory.pushContent(insert1);
        factory.pushContent(insert2);
        assert.deepStrictEqual(factory.list, [
            {
                type: "Insert",
                id: 0,
                content: [
                    { type, value: 1 },
                    { type, value: 2 },
                ],
            },
        ]);
    });

    it("Can merge consecutive move-ins", () => {
        const factory = new SF.MarkListFactory();
        const move1: SF.MoveIn = { type: "MoveIn", id: 0, count: 1 };
        const move2: SF.MoveIn = { type: "MoveIn", id: 0, count: 1 };
        factory.pushContent(move1);
        factory.pushContent(move2);
        assert.deepStrictEqual(factory.list, [{ type: "MoveIn", id: 0, count: 2 }]);
    });

    it("Can merge consecutive deletes", () => {
        const factory = new SF.MarkListFactory();
        const delete1: SF.Detach = { type: "Delete", id: 0, count: 1 };
        const delete2: SF.Detach = { type: "Delete", id: 0, count: 1 };
        factory.pushContent(delete1);
        factory.pushContent(delete2);
        assert.deepStrictEqual(factory.list, [{ type: "Delete", id: 0, count: 2 }]);
    });

    it("Can merge consecutive move-outs", () => {
        const factory = new SF.MarkListFactory();
        const move1: SF.Detach = { type: "MoveOut", id: 0, count: 1 };
        const move2: SF.Detach = { type: "MoveOut", id: 0, count: 1 };
        factory.pushContent(move1);
        factory.pushContent(move2);
        assert.deepStrictEqual(factory.list, [{ type: "MoveOut", id: 0, count: 2 }]);
    });

    it("Can merge consecutive revives", () => {
        const factory = new SF.MarkListFactory();
        const revive1: SF.Reattach = { type: "Revive", id: 0, tomb: 42, count: 1 };
        const revive2: SF.Reattach = { type: "Revive", id: 0, tomb: 42, count: 1 };
        factory.pushContent(revive1);
        factory.pushContent(revive2);
        assert.deepStrictEqual(factory.list, [{ type: "Revive", id: 0, tomb: 42, count: 2 }]);
    });

    it("Can merge consecutive returns", () => {
        const factory = new SF.MarkListFactory();
        const return1: SF.Reattach = { type: "Return", id: 0, tomb: 42, count: 1 };
        const return2: SF.Reattach = { type: "Return", id: 0, tomb: 42, count: 1 };
        factory.pushContent(return1);
        factory.pushContent(return2);
        assert.deepStrictEqual(factory.list, [{ type: "Return", id: 0, tomb: 42, count: 2 }]);
    });

    it("Can merge consecutive tombs", () => {
        const factory = new SF.MarkListFactory();
        const tomb1: SF.Tomb = { type: "Tomb", change: 42, count: 1 };
        const tomb2: SF.Tomb = { type: "Tomb", change: 42, count: 1 };
        factory.pushContent(tomb1);
        factory.pushContent(tomb2);
        assert.deepStrictEqual(factory.list, [{ type: "Tomb", change: 42, count: 2 }]);
    });
});
