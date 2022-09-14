/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { unreachableCase } from "@fluidframework/common-utils";
import { JsonCompatible, JsonCompatibleReadOnly } from "../../util";
import { FieldChangeEncoder, NodeChangeDecoder, NodeChangeEncoder } from "../modular-schema";
import { Changeset } from "./format";
import { isSkipMark } from "./utils";

export const sequenceFieldChangeEncoder: FieldChangeEncoder<Changeset> = {
    encodeForJson,
    decodeJson,
};

function encodeForJson(
    formatVersion: number,
    markList: Changeset,
    encodeChild: NodeChangeEncoder,
): JsonCompatibleReadOnly {
    const jsonMarks: JsonCompatible[] = [];
    for (const mark of markList) {
        if (isSkipMark(mark)) {
            jsonMarks.push(mark);
        } else {
            const type = mark.type;
            switch (type) {
                case "Modify":
                case "MDelete":
                case "MInsert":
                case "MMoveIn":
                case "MMoveOut":
                case "MReturn":
                case "MRevive":
                    jsonMarks.push({
                        ...mark,
                        changes: encodeChild(mark.changes),
                    } as unknown as JsonCompatible);
                    break;
                case "Delete":
                case "Insert":
                case "MoveIn":
                case "MoveOut":
                case "Return":
                case "Revive":
                case "Tomb":
                    jsonMarks.push(mark as unknown as JsonCompatible);
                    break;
                default: unreachableCase(type);
            }
        }
    }
    return jsonMarks as JsonCompatibleReadOnly;
}

function decodeJson(
    formatVersion: number,
    change: JsonCompatibleReadOnly,
    decodeChild: NodeChangeDecoder,
): Changeset {
    const marks: Changeset = [];
    const array = change as Changeset<JsonCompatibleReadOnly>;
    for (const mark of array) {
        if (isSkipMark(mark)) {
            marks.push(mark);
        } else if (typeof mark === "object" && "type" in mark) {
            const type = mark.type;
            switch (type) {
                case "Modify":
                case "MDelete":
                case "MInsert":
                case "MMoveIn":
                case "MMoveOut":
                case "MReturn":
                case "MRevive":
                    marks.push({
                        ...mark,
                        changes: decodeChild(mark.changes),
                    });
                    break;
                case "Delete":
                case "Insert":
                case "MoveIn":
                case "MoveOut":
                case "Return":
                case "Revive":
                case "Tomb":
                    marks.push(mark);
                    break;
                default: unreachableCase(type);
            }
        }
    }
    return marks;
}
