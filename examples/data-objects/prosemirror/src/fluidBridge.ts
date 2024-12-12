/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { assert } from "@fluidframework/core-utils/internal";
import { IMergeTreeDeltaOp, createInsertSegmentOp } from "@fluidframework/merge-tree/internal";
import {
	ISegment,
	ISequenceDeltaRange,
	Marker,
	MergeTreeDeltaType,
	ReferenceType,
	SequenceDeltaEvent,
	SharedString,
	TextSegment,
	reservedRangeLabelsKey,
} from "@fluidframework/sequence/internal";
import {
	Fragment,
	Schema,
	Slice,
	// Slice,
} from "prosemirror-model";
import { EditorState, Transaction } from "prosemirror-state";
import { ReplaceAroundStep } from "prosemirror-transform";

export interface IProseMirrorNode {
	[key: string]: any;
	type: string;
	content?: IProseMirrorNode[];
	marks?: any[];
	_open?: boolean;
}

export interface IProseMirrorSlice {
	openStart?: number;
	openEnd?: number;
	content: IProseMirrorNode[];
}

export const proseMirrorTreeLabel = "prosemirror";

export const nodeTypeKey = "nodeType";

export const stackTypeKey = "stackType";
export const stackTypeBegin = "begin";
export const stackTypeEnd = "end";

// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class IProseMirrorTransaction {}

// For add/remove mark steps - can they be interspersed with replace and replace around steps???
// export class AddMarkStep extends Step {
// export class RemoveMarkStep extends Step {
// export class ReplaceStep extends Step {
// export class ReplaceAroundStep extends Step {

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
	private readonly transaction: Transaction;

	private readonly things = new Array<IThing>();

	constructor(
		state: EditorState,
		private readonly schema: Schema,
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
			annotations: currentThing.annotations,
		};
		currentThing.length = position;
		this.things.splice(offset + 1, 0, newThing);

		return offset + 1;
	}

	private addRange(range: ISequenceDeltaRange) {
		// Let's assume some things...
		// ... we will *never* delete an inserted node.
		// ... deletes will always apply to the ether
		// ... annotates will apply to non-deleted ether nodes

		let i = 0;
		let position = range.position;
		for (i = 0; i < this.things.length; i++) {
			if (position < this.things[i].length) {
				// Found our insertion point!
				break;
			}

			position -= this.things[i].length;
		}

		// Position's current value will tell us *where* in this.things[i] to begin inserting
		switch (range.operation) {
			case MergeTreeDeltaType.REMOVE: {
				// Walk the ether looking for the first ether element where position is found. Then split the ether
				// and add in the removal node.
				//
				// For positions we *will* need to include any newly inserted nodes. We can count these as "new" ether

				assert(i < this.things.length, "Trying to insert removal node out-of-bounds!");

				i = this.splitAt(position, i);
				let length = range.segment.cachedLength;
				while (length > 0) {
					assert(
						this.things[i].type === "ether",
						"Current thing does not have 'ether' node type!",
					);

					if (this.things[i].length <= length) {
						// Ether node is fully encompassing
						this.things[i].type = "delete";
						this.things[i].event = range;
						length -= this.things[i].length;
						this.things[i].length = 0;
						i++;
					} else {
						// Ether node is partially encompassing. Split it and loop around to then remove it
						this.splitAt(length, i);
					}
				}

				break;
			}

			case MergeTreeDeltaType.INSERT: {
				// Walk the ether + new ether (ignoring deletes) looking for the position to insert the element
				//
				// Typing the above out it's not all that different from the removal case actually
				const splicePoint = this.splitAt(position, i);
				this.things.splice(splicePoint, 0, {
					type: "insert",
					event: range,
					length: range.segment.cachedLength,
				});

				break;
			}

			case MergeTreeDeltaType.ANNOTATE: {
				// Same walk, except we will split/append the ether with annotations.
				// Will do this one later. I think I just add an annotations field to the nodes and will go look
				// for these after the fact
				// walk the ether looking for the first ether element where position is found. Then split the ether
				// and add in the removal node.
				//
				// For positions we *will* need to include any newly inserted nodes. We can count these as "new" ether

				assert(
					i < this.things.length,
					"Trying to insert annotations field on out-of-bounds node!",
				);

				i = this.splitAt(position, i);
				let length = range.segment.cachedLength;
				while (length > 0) {
					assert(
						this.things[i].type === "ether",
						"Current thing does not have 'ether' node type!",
					);

					if (this.things[i].length <= length) {
						// Ether node is fully encompasing
						this.things[i].annotations = range.propertyDeltas;
						this.things[i].event = range;
						length -= this.things[i].length;
						i++;
					} else {
						// Ether node is partially encompasing. Split it and loop around to then remove it
						this.splitAt(length, i);
					}
				}

				break;
			}
			default:
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
			// This.processRange(range);
		}
	}

	public build(): Transaction {
		console.log(
			JSON.stringify(
				this.things.map((t) => ({ type: t.type, length: t.length })),
				null,
				2,
			),
		);

		let currentGroup: IThingGroup | undefined;
		const groups = new Array<IThingGroup>();
		const annotations: {
			from: number;
			to: number;
			segment: ISegment;
			propertyDeltas?: any;
		}[] = [];
		let position = 0;

		for (const thing of this.things) {
			if (thing.type === "ether") {
				if (thing.annotations) {
					annotations.push({
						from: position,
						to: position + thing.length,
						segment: thing.event!.segment,
						propertyDeltas: thing.annotations,
					});
				}

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

		if (groups.length === 1) {
			const group = groups[0];

			let removalSize = 0;
			const insertSegments: ISegment[] = [];

			group.items.forEach((value) => {
				if (value.type === "delete") {
					removalSize += value.event!.segment.cachedLength;
				} else {
					insertSegments.push(value.event!.segment);
				}
			});

			const fragment = generateFragment(insertSegments);
			const slice = new Slice(
				Fragment.fromJSON(this.schema, fragment),
				this.getOpenStart(fragment),
				this.getOpenEnd(fragment),
			);

			this.transaction.replaceRange(group.position, group.position + removalSize, slice);
		} else if (groups.length > 1) {
			const removalSizes: number[] = [];
			const insertSizes: number[] = [];
			const insertSegments: ISegment[] = [];

			for (const group of groups) {
				let removalSize = 0;
				let groupSize = 0;

				group.items.forEach((value) => {
					if (value.type === "delete") {
						removalSize += value.event!.segment.cachedLength;
					} else {
						insertSegments.push(value.event!.segment);
						groupSize += value.event!.segment.cachedLength;
					}
				});

				removalSizes.push(removalSize);
				insertSizes.push(groupSize);
			}

			const fragment = generateFragment(insertSegments);
			const slice = new Slice(
				Fragment.fromJSON(this.schema, fragment),
				this.getOpenStart(fragment),
				this.getOpenEnd(fragment),
			);

			const gapSize = groups[1].position - groups[0].position;

			this.transaction.step(
				new ReplaceAroundStep(
					groups[0].position,
					groups[0].position + removalSizes[0] + gapSize + removalSizes[1],
					groups[0].position + removalSizes[0],
					groups[0].position + removalSizes[0] + gapSize,
					slice,
					insertSizes[0],
				),
			);
		}

		// Apply annotations
		for (const annotation of annotations) {
			const segment = annotation.segment;
			// An annotation should just be an immediate flush - I think
			for (const prop of Object.keys(annotation.propertyDeltas)) {
				const value = segment.properties![prop];

				if (value) {
					this.transaction.addMark(
						annotation.from,
						annotation.to,
						this.schema.marks[prop].create(value),
					);
				} else {
					this.transaction.removeMark(annotation.from, annotation.to, this.schema.marks[prop]);
				}
			}
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
}

export function sliceToGroupOps(
	from: number,
	slice: IProseMirrorSlice,
	schema: Schema,
	insert?: number,
	gapDistance?: number,
): IMergeTreeDeltaOp[] {
	const ops = new Array<IMergeTreeDeltaOp>();

	const sliceOpenStart = slice.openStart ?? 0;
	const sliceOpenEnd = slice.openEnd ?? 0;
	let offset = from + adjustOffset(from, 0, 0, insert, gapDistance);

	slice.content.forEach((value, index) => {
		const openStart = index === 0 ? sliceOpenStart - 1 : -1;
		const openEnd = index === slice.content.length - 1 ? sliceOpenEnd - 1 : -1;

		offset += sliceToGroupOpsInternal(
			value,
			schema,
			openStart,
			openEnd,
			offset,
			ops,
			insert,
			gapDistance,
		);
	});

	return ops;
}

// Likely a cleaner way to detect the gap than checking every offset adjust - but brute forcing for now
function adjustOffset(from, offset, value, insert, gapDistance) {
	const newFrom = from + offset + value;
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return newFrom === insert ? offset + value + gapDistance : offset + value;
}

function sliceToGroupOpsInternal(
	value: IProseMirrorNode,
	schema: Schema,
	openStart: number,
	openEnd: number,
	from: number,
	ops: IMergeTreeDeltaOp[],
	insert?: number,
	gapDistance?: number,
) {
	let offset = 0;

	let props: any;
	if (value.marks) {
		props = {};
		for (const mark of value.marks) {
			props[mark.type] = mark.attrs || true;
		}
	}

	const node = schema.nodes[value.type];
	if (node.isInline) {
		if (value.type === "text") {
			const segment = TextSegment.make(value.text, props);
			ops.push(createInsertSegmentOp(from + offset, segment));

			offset = adjustOffset(from, offset, value.text.length, insert, gapDistance);
		} else {
			const nodeProps = {
				...props,
				...{
					type: value.type,
					attrs: value.attrs,
				},
			};

			const marker = Marker.make(ReferenceType.Simple, nodeProps);
			ops.push(createInsertSegmentOp(from + offset, marker));

			offset = adjustOffset(from, offset, 1, insert, gapDistance);
		}
	} else {
		// Negative open start indicates we have passed the depth from which the opening began
		if (openStart < 0) {
			const beginProps = {
				...props,
				...{
					[reservedRangeLabelsKey]: [proseMirrorTreeLabel],
					[nodeTypeKey]: value.type,
					[stackTypeKey]: stackTypeBegin,
				},
			};

			const marker = Marker.make(ReferenceType.Simple, beginProps);
			ops.push(createInsertSegmentOp(from + offset, marker));

			offset = adjustOffset(from, offset, 1, insert, gapDistance);
		}

		if (value.content) {
			value.content.forEach((content, index) => {
				offset += sliceToGroupOpsInternal(
					content,
					schema,
					index === 0 ? openStart - 1 : -1,
					index === value.content!.length - 1 ? openEnd - 1 : -1,
					from + offset,
					ops,
					insert,
					gapDistance,
				);
			});
		}

		if (openEnd < 0) {
			const endProps = {
				...props,
				...{
					[reservedRangeLabelsKey]: [proseMirrorTreeLabel],
					[nodeTypeKey]: value.type,
					[stackTypeKey]: stackTypeEnd,
				},
			};

			const marker = Marker.make(ReferenceType.Simple, endProps);
			ops.push(createInsertSegmentOp(from + offset, marker));

			offset = adjustOffset(from, offset, 1, insert, gapDistance);
		}
	}

	return offset;
}

function generateFragment(segments: ISegment[]) {
	const nodeStack = new Array<IProseMirrorNode>();
	nodeStack.push({ type: "doc", content: [] });

	let openTop: IProseMirrorNode | undefined;

	// TODO should I pre-seed the data structure based on the nodes to the left of the open?

	for (const segment of segments) {
		const top = nodeStack[nodeStack.length - 1];

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
					});
				}
			}

			top.content!.push(nodeJson);
		} else if (Marker.is(segment)) {
			const nodeType = segment.properties![nodeTypeKey];
			const stackType = segment.properties![stackTypeKey];
			switch (segment.refType) {
				case ReferenceType.Simple:
					if (stackType === stackTypeBegin) {
						// Special case the open top
						if (openTop) {
							top.content!.push(openTop);
							openTop = undefined;
						}
						// Create the new node, add it to the top's content, and push it on the stack
						const newNode = {
							type: nodeType,
							content: [] as IProseMirrorNode[],
							_open: true,
						};
						top.content!.push(newNode);
						nodeStack.push(newNode);
					} else if (stackType === stackTypeEnd) {
						if (top.type === nodeType) {
							top._open = false;
							// Matching open
							nodeStack.pop();
						} else {
							// Unmatched open
							const newNode2 = {
								type: nodeType,
								content: [] as IProseMirrorNode[],
								_open: true,
							};
							if (openTop) {
								newNode2.content.push(openTop);
							}

							openTop = newNode2;
						}
					} else {
						// TODO consolidate the text segment and simple references
						const nodeJson: IProseMirrorNode = {
							type: segment.properties!.type,
							attrs: segment.properties!.attrs,
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

						top.content!.push(nodeJson);
					}
					break;

				default:
					// Throw for now when encountering something unknown
					throw new Error("Unknown marker");
			}
		}
	}

	const doc = nodeStack[0];
	const content = doc.content!;

	// We do a fix up down the left edge for all the open nodes since we need to change the ordering. Likely
	// better way to do this but holding off until better understand slice use
	// if (content[0] && content[0]._open) {
	//     let prev;
	//     let current = content[0];
	//     while (current) {
	//         const next = current.content ? current.content[0] : undefined;
	//         prev = current;
	//         current = next;
	//     }
	//     content[0] = prev;
	// }

	return content;
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
