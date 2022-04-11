/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from './Common';
import type { InternedStringId } from './Identifiers';

/**
 * Interns strings as integers.
 */
export interface StringInterner {
	getInternedId(input: string): InternedStringId | undefined;
	getString(internedId: number): string;
	getSerializable(): readonly string[];
}

/**
 * Interns strings as integers.
 * Given a string, this class will produce a unique integer associated with that string that can then be used to retrieve the string.
 */
export class MutableStringInterner implements StringInterner {
	private readonly stringToInternedIdMap = new Map<string, InternedStringId>();
	private readonly internedStrings: string[] = [];

	/**
	 * @param inputStrings - A list of strings to intern in the order given. Can be used to rehydrate from a previous
	 * `StringInterner`'s {@link StringInterner.getSerializable} return value.
	 */
	constructor(inputStrings: readonly string[] = []) {
		for (const value of inputStrings) {
			this.getOrCreateInternedId(value);
		}
	}

	/**
	 * @param input - The string to get the associated intern ID for
	 * @returns an intern ID that is uniquely associated with the input string
	 */
	public getOrCreateInternedId(input: string): InternedStringId {
		return this.getInternedId(input) ?? this.createNewId(input);
	}

	public getInternedId(input: string): InternedStringId | undefined {
		return this.stringToInternedIdMap.get(input);
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

	/** Create a new interned id. Assumes without validation that the input doesn't already have an interned id. */
	private createNewId(input: string): InternedStringId {
		const internedId = this.stringToInternedIdMap.size as InternedStringId;
		this.stringToInternedIdMap.set(input, internedId);
		this.internedStrings.push(input);
		return internedId;
	}
}
