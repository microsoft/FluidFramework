/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { LeafSequence, TreeNodeSchemaIdentifier } from "../core/index.js";
import type { StringSequence } from "../util/index.js";

/**
 * Adapts forest-independent string storage to homogeneous primitive tree leaves.
 */
export class StringLeafSequence implements LeafSequence {
	public readonly representativeValue = "";

	public constructor(
		public readonly type: TreeNodeSchemaIdentifier,
		public readonly storage: StringSequence,
	) {}

	public get length(): number {
		return this.storage.length;
	}

	public at(index: number): string {
		return this.storage.at(index);
	}

	public values(start: number): IterableIterator<string> {
		return this.storage.values(start);
	}

	public slice(start: number, end: number): StringLeafSequence {
		return new StringLeafSequence(this.type, this.storage.slice(start, end));
	}

	public tryConcat(other: LeafSequence): StringLeafSequence | undefined {
		if (!(other instanceof StringLeafSequence) || this.type !== other.type) {
			return undefined;
		}
		// eslint-disable-next-line unicorn/prefer-spread -- StringSequence.concat preserves atom boundaries and coalesces pieces.
		return new StringLeafSequence(this.type, this.storage.concat(other.storage));
	}
}
