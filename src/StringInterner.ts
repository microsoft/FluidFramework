/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from './Common';
import type { InternedStringId } from './Identifiers';

/**
 * Interns strings as integers.
 * Given a string, this class will produce a unique integer associated with that string that can then be used to retrieve the string.
 */
export class StringInterner {
	private readonly stringToInternedIdMap = new Map<string, InternedStringId>();
	private readonly internedStrings: string[] = [];

	/**
	 * @param inputStrings - A list of strings to intern in the order given. Can be used to rehydrate from a previous
	 * `StringInterner`'s {@link StringInterner.getSerializable} return value.
	 */
	constructor(inputStrings: readonly string[] = []) {
		for (const value of inputStrings) {
			this.getInternId(value);
		}
	}

	/**
	 * @param input - The string to get the associated intern ID for
	 * @returns an intern ID that is uniquely associated with the input string
	 */
	public getInternId(input: string): InternedStringId {
		const possibleOutput = this.stringToInternedIdMap.get(input);

		if (possibleOutput === undefined) {
			const internId = this.stringToInternedIdMap.size;
			this.stringToInternedIdMap.set(input, internId as InternedStringId);
			this.internedStrings.push(input);
			return internId as InternedStringId;
		}

		return possibleOutput;
	}

	/**
	 *
	 * @param internId - The intern ID to get the associated string for. Can only retrieve strings that have been used as inputs to
	 *                   calls of `getInternId`.
	 * @returns a string that is uniquely associated with the given intern ID
	 */
	public getString(internId: number): string {
		return this.internedStrings[internId] ?? fail(`No string associated with ${internId}.`);
	}

	/**
	 * @returns the list of strings interned where the indices map to the associated {@link InternedStringId} of each string
	 */
	public getSerializable(): readonly string[] {
		return this.internedStrings;
	}
}
