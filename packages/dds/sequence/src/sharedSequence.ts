/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { BaseSegment, IJSONSegment, ISegment, PropertySet } from "@fluidframework/merge-tree";
import {
	IChannelAttributes,
	IFluidDataStoreRuntime,
	Serializable,
} from "@fluidframework/datastore-definitions";
import { SharedSegmentSequence } from "./sequence";

const MaxRun = 128;

/**
 * @deprecated IJSONRunSegment will be removed in a upcoming release. It has been moved to the fluid-experimental/sequence-deprecated package
 * @internal
 */
export interface IJSONRunSegment<T> extends IJSONSegment {
	items: Serializable<T>[];
}

/**
 * @deprecated SubSequence will be removed in a upcoming release. It has been moved to the fluid-experimental/sequence-deprecated package
 * @internal
 */
export class SubSequence<T> extends BaseSegment {
	public static readonly typeString: string = "SubSequence";
	public static is(segment: ISegment): segment is SubSequence<any> {
		return segment.type === SubSequence.typeString;
	}
	public static fromJSONObject<U>(spec: any) {
		if (spec && typeof spec === "object" && "items" in spec) {
			const segment = new SubSequence<U>(spec.items);
			if (spec.props) {
				segment.addProperties(spec.props);
			}
			return segment;
		}
		return undefined;
	}

	public readonly type = SubSequence.typeString;

	constructor(public items: Serializable<T>[]) {
		super();
		this.cachedLength = items.length;
	}

	public toJSONObject() {
		const obj: IJSONRunSegment<T> = { items: this.items };
		super.addSerializedProps(obj);
		return obj;
	}

	public clone(start = 0, end?: number) {
		const clonedItems = this.items.slice(start, end);
		const b = new SubSequence(clonedItems);
		this.cloneInto(b);
		return b;
	}

	public canAppend(segment: ISegment): boolean {
		return (
			SubSequence.is(segment) &&
			(this.cachedLength <= MaxRun || segment.cachedLength <= MaxRun)
		);
	}

	public toString() {
		return this.items.toString();
	}

	public append(segment: ISegment) {
		assert(SubSequence.is(segment), 0x448 /* can only append to another run segment */);
		super.append(segment);
		// assert above checks that segment is a SubSequence but not that generic T matches.
		// Since SubSequence is already deprecated, assume that usage is generic T consistent
		// and just cast here to satisfy concat.
		this.items = this.items.concat((segment as SubSequence<T>).items);
	}

	// TODO: retain removed items for undo
	// returns true if entire run removed
	public removeRange(start: number, end: number) {
		let remnantItems: Serializable<T>[] = [];
		const len = this.items.length;
		if (start > 0) {
			remnantItems = remnantItems.concat(this.items.slice(0, start));
		}
		if (end < len) {
			remnantItems = remnantItems.concat(this.items.slice(end));
		}
		this.items = remnantItems;
		this.cachedLength = this.items.length;
		return this.items.length === 0;
	}

	protected createSplitSegmentAt(pos: number) {
		if (pos > 0) {
			const remainingItems = this.items.slice(pos);
			this.items = this.items.slice(0, pos);
			this.cachedLength = this.items.length;
			const leafSegment = new SubSequence(remainingItems);
			return leafSegment;
		}
	}
}

/**
 * @deprecated SharedSequence will be removed in a upcoming release. It has been moved to the fluid-experimental/sequence-deprecated package
 * @internal
 */
export class SharedSequence<T> extends SharedSegmentSequence<SubSequence<T>> {
	constructor(
		document: IFluidDataStoreRuntime,
		public id: string,
		attributes: IChannelAttributes,
		specToSegment: (spec: IJSONSegment) => ISegment,
	) {
		super(document, id, attributes, specToSegment);
	}

	/**
	 * @param pos - The position to insert the items at.
	 * @param items - The items to insert.
	 * @param props - Optional. Properties to set on the inserted items.
	 */
	public insert(pos: number, items: Serializable<T>[], props?: PropertySet) {
		const segment = new SubSequence<T>(items);
		if (props) {
			segment.addProperties(props);
		}
		this.client.insertSegmentLocal(pos, segment);
	}

	/**
	 * @param start - The inclusive start of the range to remove
	 * @param end - The exclusive end of the range to remove
	 */
	public remove(start: number, end: number) {
		this.removeRange(start, end);
	}

	/**
	 * Returns the total count of items in the sequence
	 */
	public getItemCount(): number {
		return this.getLength();
	}

	/**
	 * Gets the items in the specified range
	 *
	 * @param start - The inclusive start of the range
	 * @param end - The exclusive end of the range
	 */
	public getItems(start: number, end?: number): Serializable<T>[] {
		const items: Serializable<T>[] = [];
		let firstSegment: ISegment | undefined;

		// Return if the range is incorrect.
		if (end !== undefined && end <= start) {
			return items;
		}

		this.walkSegments(
			(segment: ISegment) => {
				if (SubSequence.is(segment)) {
					if (firstSegment === undefined) {
						firstSegment = segment;
					}
					// Condition above checks that segment is a SubSequence but not that
					// generic T matches. Since SubSequence is already deprecated, assume
					// that walk only has SubSequence<T> segments and just cast here.
					items.push(...(segment as SubSequence<T>).items);
				}
				return true;
			},
			start,
			end,
		);

		// The above call to walkSegments adds all the items in the walked
		// segments. However, we only want items beginning at |start| in
		// the first segment. Similarly, if |end| is passed in, we only
		// want items until |end| in the last segment. Remove the rest of
		// the items.
		if (firstSegment !== undefined) {
			items.splice(0, start - this.getPosition(firstSegment));
		}
		if (end !== undefined) {
			items.splice(end - start);
		}
		return items;
	}
}
