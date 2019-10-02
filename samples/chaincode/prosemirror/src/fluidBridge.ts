/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    createInsertSegmentOp,
    IMergeTreeOp,
    Marker,
    MergeTreeDeltaType,
    ReferenceType,
    reservedRangeLabelsKey,
    TextSegment,
    ISegment,
} from "@prague/merge-tree";
import {
    SharedString,
    // ISequenceDeltaRange,
    SequenceDeltaEvent,
    ISequenceDeltaRange,
} from "@prague/sequence";
import * as assert from "assert";
import {
    Schema, Fragment, Slice,
    // Slice,
} from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";

export interface IProseMirrorNode {
    [key: string]: any;
    type: string,
    content?: IProseMirrorNode[],
    marks?: any[],
    _open?: boolean;
}

export interface IProseMirrorSlice {
    openStart?: number;
    openEnd?: number;
    content: IProseMirrorNode[];
}

export const proseMirrorTreeLabel = "prosemirror";

export const nodeTypeKey = "nodeType";

export class IProseMirrorTransaction {
}

// For add/remove mark steps - can they be interspersed with replace and replace around steps???
// export class AddMarkStep extends Step {
// export class RemoveMarkStep extends Step {
// export class ReplaceStep extends Step {
// export class ReplaceAroundStep extends Step {

interface IThing {
    type: "ether" | "delete" | "insert" | "annotate";
    event?: ISequenceDeltaRange;
    length: number;
    // TODO make use of me!
    annotations?: any;
}

interface IThingGroup {
    items: IThing[];
    position: number;
}

export class ProseMirrorTransactionBuilder {
    private transaction: Transaction;

    private things = new Array<IThing>();

    constructor(
        state: EditorState,
        private schema: Schema,
        sharedString: SharedString,
    ) {
        this.transaction = state.tr;
        this.transaction.setMeta("fluid-local", true);

        // Insert an empty node to represent the entire list
        this.things.push({ type: "ether", length: sharedString.getLength() });
    }

    private splitAt(position: number, offset: number): number {
        if (position === 0) {
            return offset;
        }

        const currentThing = this.things[offset];
        const newThing: IThing = {
            type: currentThing.type,
            event: currentThing.event,
            length: currentThing.length - position,
        };
        currentThing.length = position;
        this.things.splice(offset + 1, 0, newThing);

        return offset + 1;
    }

    private addRange(range: ISequenceDeltaRange) {
        // let's assume some things...
        // ... we will *never* delete a newly inerted node.
        // ... deletes will always apply to the empty range
        // ... annotates will *not* apply to newly inserted nodes

        let i = 0;
        let position = range.position;
        for (i = 0; i < this.things.length; i++) {
            if (position < this.things[i].length) {
                // Found our insertion point!
                break;
            }

            position -= this.things[i].length;
        }

        // position's current value will tell us *where* in this.things[i] to begin inserting
        switch (range.operation) {
            case MergeTreeDeltaType.REMOVE:
                // walk the ether looking for the first ether element where position is found. Then split the ether
                // and add in the removal node.
                //
                // For positions we *will* need to include any newly inserted nodes. We can count these as "new" ether

                assert(i < this.things.length);

                i = this.splitAt(position, i);
                let length = range.segment.cachedLength;
                while (length > 0) {
                    assert(this.things[i].type === "ether");

                    if (this.things[i].length <= length) {
                        // ether node is fully encompasing
                        this.things[i].type = "delete";
                        this.things[i].event = range;
                        length -= this.things[i].length;
                        this.things[i].length = 0;
                        i++;
                    } else {
                        // ether node is partially encompasing. Split it and loop around to then remove it
                        this.splitAt(length, i);
                    }
                }

                break;
            
            case MergeTreeDeltaType.INSERT:
                // Walk the ether + new ether (ignoring deletes) looking for the position to insert the element
                //
                // Typing the above out it's not all that different from the removal case actually
                const splicePoint = this.splitAt(position, i);
                this.things.splice(splicePoint, 0, { type: "insert", event: range, length: range.segment.cachedLength });

                break;

            case MergeTreeDeltaType.ANNOTATE:
                // Same walk, except we will split/append the ether with annotations.
                // Will do this one later. I think I just add an annotations field to the nodes and will go look
                // for these after the fact
                break;
        }
    }

    public addSequencedDelta(delta: SequenceDeltaEvent) {
        for (const range of delta.ranges) {
            // The range has a position
            // ... range.position                
            // And the range has an operation
            // ... range.operation
            // And the range has a segment
            // ... range.segment
            // And property deltas in the case of an annotate
            // ... range.propertyDeltas
            // I need to extract the length given the type
            // range.segment.cachedLength
            this.addRange(range);
            // this.processRange(range);
        }
    }

    public build(): Transaction {
        console.log(JSON.stringify(this.things.map((t) => ({ type: t.type, length: t.length })), null, 2));

        let currentGroup: IThingGroup;
        const groups = new Array<IThingGroup>();
        let position = 0;

        for (const thing of this.things) {
            if (thing.type === "ether") {
                currentGroup = undefined;
                position += thing.length;
            } else {
                if (!currentGroup) {
                    currentGroup = { items: [], position };
                    groups.push(currentGroup);
                }

                currentGroup.items.push(thing);
            }
        }

        // For now we *just* support replace range
        console.log(`Total groups! ${groups.length}`);
        for (const group of groups) {
            let removalSize = 0;
            let insertSegments = [];

            group.items.forEach((value) => {
                if (value.type === "delete") {
                    removalSize += value.event.segment.cachedLength;
                } else {
                    insertSegments.push(value.event.segment);
                }
            });

            const fragment = generateFragment(insertSegments);
            const slice = new Slice(
                Fragment.fromJSON(this.schema, fragment),
                this.getOpenStart(fragment),
                this.getOpenEnd(fragment));
            
            this.transaction.replaceRange(
                group.position,
                group.position + removalSize,
                slice)
        }


        return this.transaction;
    }

    private getOpenStart(node: IProseMirrorNode[]): number {
        if (!node || node.length === 0) {
            return 0;
        }

        const start = node[0];
        return !start._open || !start.content ? 0 : 1 + this.getOpenStart(start.content);
    }

    private getOpenEnd(node: IProseMirrorNode[]): number {
        if (!node || node.length === 0) {
            return 0;
        }

        const end = node[node.length - 1];
        return !end._open || !end.content ? 0 : 1 + this.getOpenEnd(end.content);
    }

    // private processRemove(range: ISequenceDeltaRange) {
    //     const segment = range.segment;

    //     const length = TextSegment.is(segment) ? segment.text.length : 1;
    //     this.addRemovalRange(range.position, range.position + length);
        
    //     this.transaction.delete(range.position, range.position + length);
    // }

    // private processInsert(range: ISequenceDeltaRange) {
    //     const segment = range.segment;

    //     if (TextSegment.is(segment)) {
    //         this.transaction.insertText(segment.text, range.position);

    //         if (segment.properties) {
    //             for (const prop of Object.keys(segment.properties)) {
    //                 const value = range.segment.properties[prop];
    //                 this.transaction.addMark(
    //                     range.position,
    //                     range.position + segment.text.length,
    //                     this.schema.marks[prop].create(value));
    //             }
    //         }
    //     } else if (Marker.is(segment)) {
    //         if (segment.refType === ReferenceType.Simple) {
    //             const nodeType = segment.properties["type"];
    //             const node = this.schema.nodes[nodeType].create(segment.properties["attrs"]);
    //             this.transaction.insert(range.position, node);
    //         }
    //     }
    // }

    // private processAnnotate(range: ISequenceDeltaRange) {
    //     const segment = range.segment;

    //     // An annotation should just be an immediate flush - I think
    //     for (const prop of Object.keys(range.propertyDeltas)) {
    //         const value = range.segment.properties[prop];

    //         // TODO I think I need to query the sequence for *all* marks and then set them here
    //         // for PM it's an all or nothing set. Not anything additive

    //         const length = TextSegment.is(segment) ? segment.text.length : 1;

    //         if (value) {
    //             this.transaction.addMark(
    //                 range.position,
    //                 range.position + length,
    //                 this.schema.marks[prop].create(value));
    //         } else {
    //             this.transaction.removeMark(
    //                 range.position,
    //                 range.position + length,
    //                 this.schema.marks[prop]);
    //         }
    //     }
    // }

    // Do I need to just build up a mini-merge tree with the inbound segments. Include in that the deleted segments?
    //
    // Or do I split the insert vs. remove treees?

    // Task is to convert from INSERT/REMOVE/ANNOTATE into addMark/removeMark/replace/replaceAround
    // export class AddMarkStep extends Step {
    // export class RemoveMarkStep extends Step {
    // export class ReplaceStep extends Step {
    //
    // export class ReplaceAroundStep extends Step {
    // :: (number, number, number, number, Slice, number, ?bool)
    // Create a replace-around step with the given range and gap.
    // `insert` should be the point in the slice into which the content
    // of the gap should be moved. `structure` has the same meaning as
    // it has in the [`ReplaceStep`](#transform.ReplaceStep) class.

    // let allSegments: ISegment[];
    // allSegments = new Array<ISegment>();

    // allSegments.push(...ev.ranges.map((range) => range.segment));

    // console.log(`Segment count ${allSegments.length}`);

    // const client = this.sharedString.client;
    // for (const segment of allSegments) {
    //     segment.removedSeq
    //     console.log(
    //         `${(client as any).mergeTree.getPosition(segment, client.getCurrentSeq(), client.getClientId())}`);
    // }
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

function generateFragment(segments: ISegment[]) {
    const nodeStack = new Array<IProseMirrorNode>();
    nodeStack.push({ type: "doc", content: [] });

    // TODO should I pre-seed the data structure based on the nodes to the left of the open?

    for (const segment of segments) {
        let top = nodeStack[nodeStack.length - 1];

        if (TextSegment.is(segment)) {
            const nodeJson: IProseMirrorNode = {
                type: "text",
                text: segment.text,
            };

            if (segment.properties) {
                nodeJson.marks = [];
                for (const propertyKey of Object.keys(segment.properties)) {
                    nodeJson.marks.push({
                        type: propertyKey,
                        value: segment.properties[propertyKey],
                    })
                }
            }

            top.content.push(nodeJson);
        } else if (Marker.is(segment)) {
            const nodeType = segment.properties[nodeTypeKey];
            switch (segment.refType) {
                case ReferenceType.NestBegin:
                    // Create the new node, add it to the top's content, and push it on the stack
                    const newNode = { type: nodeType, content: [], _open: true };
                    top.content.push(newNode);
                    nodeStack.push(newNode);
                    break;

                case ReferenceType.NestEnd:
                    if (top.type === nodeType) {
                        top._open = false;
                        // matching open
                        nodeStack.pop();
                    } else {
                        // unmatched open
                        const newNode = { type: nodeType, content: [], _open: true };
                        top.content.push(newNode);
                    }
                    
                    break;

                case ReferenceType.Simple:
                    // TODO consolidate the text segment and simple references
                    const nodeJson: IProseMirrorNode = {
                        type: segment.properties["type"],
                        attrs: segment.properties["attrs"],
                    };

                    if (segment.properties) {
                        nodeJson.marks = [];
                        for (const propertyKey of Object.keys(segment.properties)) {
                            if (propertyKey !== "type" && propertyKey !== "attrs") {
                                nodeJson.marks.push({
                                    type: propertyKey,
                                    value: segment.properties[propertyKey],
                                });
                            }
                        }
                    }

                    top.content.push(nodeJson);
                    break;

                default:
                    // throw for now when encountering something unknown
                    throw new Error("Unknown marker");
            }
        }
    }

    const doc = nodeStack[0];
    return doc.content;
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

// export function segmentsToSlice(text: SharedString, segments: ISequenceDeltaRange[]): Slice {
    // const initialSegment = segments[0];

    // const stack = text.getStackContext(initialSegment.position, [proseMirrorTreeLabel]).proseMirrorTreeLabel;
    // let root: IProseMirrorNode = {
    //     content: [],
    //     type: "doc",
    // }
    // while (!stack.empty()) {
    //     const marker = stack.pop();
    //     const type = marker.properties[nodeTypeKey];

    //     const newNode = { type, content: [] };
    //     root.content.push(newNode);
        
    //     root = newNode;
    // }

    // segments.forEach(() => {
    //     // TODO do stuff here
    // });

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

    // const fragment = null;
    // const openStart = 0;
    // const openEnd = 0;

    // return new Slice(fragment, openStart, openEnd);
// }

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