/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IMergeTreeOp,
    TextSegment,
    createInsertSegmentOp,
    Marker,
    ReferenceType,
    reservedRangeLabelsKey,
} from "@prague/merge-tree";
import { Schema } from "prosemirror-model";

export interface IProseMirrorNode {
    [key: string]: any;
    type: string,
    content?: IProseMirrorNode[],
    marks?: any[],
}

export interface IProseMirrorSlice {
    openStart?: number;
    openEnd?: number;
    content: IProseMirrorNode[];
}

export const proseMirrorTreeLabel = "prosemirror";

export const nodeTypeKey = "nodeType";

export function sliceToGroupOps(from: number, slice: IProseMirrorSlice, schema: Schema): IMergeTreeOp[] {
    const ops = new Array<IMergeTreeOp>();

    const sliceOpenStart = slice.openStart || 0;
    const sliceOpenEnd = slice.openEnd || 0;
    let offset = from;

    slice.content.forEach((value, index) => {
        const openStart = index === 0 ? sliceOpenStart - 1 : -1;
        const openEnd = index === slice.content.length - 1 ? sliceOpenEnd - 1 : -1;

        offset += sliceToGroupOpsInternal(value, schema, openStart, openEnd, offset, ops);
    });

    return ops;
}

function sliceToGroupOpsInternal(
    value: IProseMirrorNode,
    schema: Schema,
    openStart: number,
    openEnd: number,
    offset: number,
    ops: IMergeTreeOp[],
) {
    let from = offset;

    let props: any = undefined;
    if (value.marks) {
        props = {};
        for (const mark of value.marks) {
            props[mark.type] = mark.attrs || true;
        }
    }

    const node = schema.nodes[value.type];
    if (node.isInline) {
        if (value.type === "text") {
            const segment = new TextSegment(value.text);
            if (props) {
                segment.addProperties(props);
            }
            ops.push(createInsertSegmentOp(from, segment));

            from += value.text.length;
        } else {
            const nodeProps = {
                ...props,
                ...{
                    type: value.type,
                    attrs: value.attrs,
                },
            };

            const marker = new Marker(ReferenceType.Simple);
            marker.addProperties(nodeProps);
            ops.push(createInsertSegmentOp(from, marker));

            from++;
        }
    } else {
        // negative open start indicates we have past the depth from which the opening began
        if (openStart < 0) {
            const beginProps = {
                ...props,
                ...{
                    [reservedRangeLabelsKey]: [proseMirrorTreeLabel],
                    [nodeTypeKey]: value.type,
                }
            };

            const marker = new Marker(ReferenceType.NestBegin);
            marker.addProperties(beginProps);
            ops.push(createInsertSegmentOp(from, marker));

            from++;
        }

        if (value.content) {
            value.content.forEach((content, index) => {
                from += sliceToGroupOpsInternal(
                    content,
                    schema,
                    index === 0 ? openStart - 1 : -1,
                    index === value.content.length - 1 ? openEnd - 1 : -1,
                    from,
                    ops);
            });
        }

        if (openEnd < 0) {
            const endProps = {
                ...props,
                ...{
                    [reservedRangeLabelsKey]: [proseMirrorTreeLabel],
                    [nodeTypeKey]: value.type,
                }
            };

            const marker = new Marker(ReferenceType.NestEnd);
            marker.addProperties(endProps);
            ops.push(createInsertSegmentOp(from, marker));

            from++;
        }
    }

    return from;
}

// TODO a replace should be an entire group
// iterate over all elements and create a new fragment

// {
//     "stepType": "replace",
//     "from": 14,
//     "to": 14,
//     "slice": {
//         "content": [
//         {
//             "type": "paragraph"
//         },
//         {
//             "type": "paragraph"
//         }
//         ],
//         "openStart": 1,
//         "openEnd": 1
//     },
//     "structure": true
// }

// When `structure` is true, the step will fail if the content between
// from and to is not just a sequence of closing and then opening
// tokens (this is to guard against rebased replace steps
// overwriting something they weren't supposed to).

// collab cursor
// https://discuss.prosemirror.net/t/collaborative-editor-show-other-users-cursor-position/1862