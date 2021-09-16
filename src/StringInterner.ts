/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from './Common';

/**
 * Interns strings as integers.
 * Given a string, this class will produce a unique integer associated with that string that can then be used to retrieve the string.
 */
export class StringInterner {
	private counter = 0;
	private readonly stringToInternIdMap = new Map<string, number>();
	private readonly internIdToStringMap = new Map<number, string>();

	/**
	 * @param inputStrings - A list of strings to intern in the order given
	 */
	constructor(inputStrings: readonly string[] = []) {
		for (const value of inputStrings) {
			this.getInternId(value);
		}
	}

	/**
	 * @param inputString - The string to get the associated intern ID for
	 * @returns an intern ID that is uniquely associated with the input string
	 */
	public getInternId(inputString: string): number {
		const possibleOutput = this.stringToInternIdMap.get(inputString);

		if (possibleOutput === undefined) {
			this.stringToInternIdMap.set(inputString, this.counter);
			this.internIdToStringMap.set(this.counter, inputString);
			return this.counter++;
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
		return this.internIdToStringMap.get(internId) ?? fail(`No string associated with ${internId}.`);
	}

	/**
	 * @returns the list of strings interned where the indices map to the associated intern ID of each string
	 */
	public getSerializable(): readonly string[] {
		return Array.from(this.stringToInternIdMap.keys());
	}
}
