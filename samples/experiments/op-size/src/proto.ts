/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { op } from "../op";

export function convertToProto(input: any): op.SequencedOp {
    return op.SequencedOp.fromObject(input);
}

export function convertFromProto(input: op.SequencedOp): any {
    return input.toJSON();
}

export function convertToObject(input: op.SequencedOp): any {
    return op.SequencedOp.toObject(input, {
        longs: String,
        enums: String,
        bytes: String,
    });
}

export function getProtoSize(input: any): number {
    const buffer = op.SequencedOp.encode(input).finish();
    return buffer.byteLength;
}