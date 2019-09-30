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
import { Schema, Slice } from "prosemirror-model";
import { ISequenceDeltaRange, SharedString, SequenceDeltaEvent } from "@prague/sequence";
import { EditorState, Transaction } from "prosemirror-state";

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

export class ProseMirrorTransactionBuilder {
    private transaction: Transaction<any>;

    constructor(state: EditorState) {
        this.transaction = state.tr;
    }

    addSequencedDelta(delta: SequenceDeltaEvent) {
        return;
    }

    build() {

    }
}

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

// if (TextSegment.is(segment)) {
//     transaction.insertText(segment.text, range.position);

//     if (segment.properties) {
//         for (const prop of Object.keys(segment.properties)) {
//             const value = range.segment.properties[prop];
//             transaction.addMark(
//                 range.position,
//                 range.position + segment.text.length,
//                 this.schema.marks[prop].create(value));
//         }
//     }
// } else if (Marker.is(segment)) {
//     if (segment.refType === ReferenceType.Simple) {
//         const nodeType = segment.properties["type"];
//         const node = this.schema.nodes[nodeType].create(segment.properties["attrs"]);
//         transaction.insert(range.position, node);
//     }
// }

export function segmentsToSlice(text: SharedString, segments: ISequenceDeltaRange[]): Slice {
    const initialSegment = segments[0];

    const stack = text.getStackContext(initialSegment.position, [proseMirrorTreeLabel]).proseMirrorTreeLabel;
    let root: IProseMirrorNode = {
        content: [],
        type: "doc",
    }
    while (!stack.empty()) {
        const marker = stack.pop();
        const type = marker.properties[nodeTypeKey];

        const newNode = { type, content: [] };
        root.content.push(newNode);
        
        root = newNode;
    }

    segments.forEach((segment) => {
        // TODO do stuff here
    });

    // Initialize the base ProseMirror JSON data structure
    // const nodeStack = new Array<IProseMirrorNode>();
    // nodeStack.push({ type: "doc", content: [] });

    // this.text.walkSegments((segment) => {
    //     let top = nodeStack[nodeStack.length - 1];

    //     if (TextSegment.is(segment)) {
    //         const nodeJson: IProseMirrorNode = {
    //             type: "text",
    //             text: segment.text,
    //         };

    //         if (segment.properties) {
    //             nodeJson.marks = [];
    //             for (const propertyKey of Object.keys(segment.properties)) {
    //                 nodeJson.marks.push({
    //                     type: propertyKey,
    //                     value: segment.properties[propertyKey],
    //                 })
    //             }
    //         }

    //         top.content.push(nodeJson);
    //     } else if (Marker.is(segment)) {
    //         // TODO are marks applied to the structural nodes as well? Or just inner text?

    //         const nodeType = segment.properties[nodeTypeKey];
    //         switch (segment.refType) {
    //             case ReferenceType.NestBegin:
    //                 // Create the new node, add it to the top's content, and push it on the stack
    //                 const newNode = { type: nodeType, content: [] };
    //                 top.content.push(newNode);
    //                 nodeStack.push(newNode);
    //                 break;

    //             case ReferenceType.NestEnd:
    //                 const popped = nodeStack.pop();
    //                 assert(popped.type === nodeType);
    //                 break;

    //             case ReferenceType.Simple:
    //                 // TODO consolidate the text segment and simple references
    //                 const nodeJson: IProseMirrorNode = {
    //                     type: segment.properties["type"],
    //                     attrs: segment.properties["attrs"],
    //                 };

    //                 if (segment.properties) {
    //                     nodeJson.marks = [];
    //                     for (const propertyKey of Object.keys(segment.properties)) {
    //                         if (propertyKey !== "type" && propertyKey !== "attrs") {
    //                             nodeJson.marks.push({
    //                                 type: propertyKey,
    //                                 value: segment.properties[propertyKey],
    //                             });
    //                         }
    //                     }
    //                 }

    //                 top.content.push(nodeJson);
    //                 break;

    //             default:
    //                 // throw for now when encountering something unknown
    //                 throw new Error("Unknown marker");
    //         }
    //     }

    //     return true;
    // });

    const fragment = null;
    const openStart = 0;
    const openEnd = 0;

    return new Slice(fragment, openStart, openEnd);
}

function sliceToGroupOpsInternal(
    value: IProseMirrorNode,
    schema: Schema,
    openStart: number,
    openEnd: number,
    from: number,
    ops: IMergeTreeOp[],
) {
    let offset = 0;

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
            ops.push(createInsertSegmentOp(from + offset, segment));

            offset += value.text.length;
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
            ops.push(createInsertSegmentOp(from + offset, marker));

            offset++;
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
            ops.push(createInsertSegmentOp(from + offset, marker));

            offset++;
        }

        if (value.content) {
            value.content.forEach((content, index) => {
                offset += sliceToGroupOpsInternal(
                    content,
                    schema,
                    index === 0 ? openStart - 1 : -1,
                    index === value.content.length - 1 ? openEnd - 1 : -1,
                    from + offset,
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
            ops.push(createInsertSegmentOp(from + offset, marker));

            offset++;
        }
    }

    return offset;
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