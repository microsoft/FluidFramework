/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import {
	IDocumentAttributes,
	ISnapshotTree,
} from "@fluidframework/driver-definitions/internal";

/**
 * Reads a blob from storage and parses it from JSON.
 *
 * @internal
 */
export type ReadAndParseBlob = <T>(id: string) => Promise<T>;

/**
 * Fetches the sequence number of the snapshot tree by examining the protocol.
 * @param tree - snapshot tree to examine
 * @param readAndParseBlob - function to read blob contents from storage
 * and parse the result from JSON.
 * @internal
 */
export async function seqFromTree(
	tree: ISnapshotTree,
	readAndParseBlob: ReadAndParseBlob,
): Promise<number> {
	// TODO why are we non null asserting here?
	// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
	const attributesHash = tree.trees[".protocol"]!.blobs.attributes!;
	const attrib = await readAndParseBlob<IDocumentAttributes>(attributesHash);
	return attrib.sequenceNumber;
}

/**
 * Encode compact ID (returned by IContainerRuntime.generateDocumentUniqueId()) to a compact string representation.
 * While this is the main usage pattern, it works with any non-negative integer or a string.
 * Strings are retured as is, and assumed to be UUIDs, i.e. unique enough to never overlap with
 * numbers encoded as strings by this function. Any other strings are likely to run into collisions and should not be used!
 * This function is useful in places where we serialize resulting ID as string and use them as strings, thus we are not
 * gaining any efficiency from having a number type.
 * We do not provide a decode function, so this API is only useful only result is stored and there is no need to go back to origianl form.
 * @param idArg - input - either a non-negative integer or a string. Strings are returned as is, while numbers are encoded in compat form
 * @param prefix - optinal string prefix
 * @returns A string - representation of an input
 * @internal
 */
export function encodeCompactIdToString(idArg: number | string, prefix = ""): string {
	if (typeof idArg === "string") {
		return idArg;
	}
	// WARNING: result of this function are stored in storage!
	// If you ever need to change this function, you will need to ensure that
	// for any inputs N1 & N2, old(N1) !== new(N2), where old() - is the old implementation,
	// and new() - is new implementation of encodeCompactIdToString()
	// This likely means - this function can't be changed, unless it uses some prefix that ensures
	// new values have zero overlap with old values.
	// Also resulting string can't contain "/", as that's disallowed by some users
	// (data store and DDS IDs can't have "/" in their IDs).
	assert(Number.isInteger(idArg) && idArg >= 0, 0x900 /* invalid input */);
	let id = "";
	let num = idArg;
	do {
		// 48-57 -> 0-9
		// 65-91 > A-Z[
		// 97-123 -> a-z}
		// Here are some examples of the input & output:
		// 0 -> 'A'
		// 1 -> 'B'
		// 64 -> "AA"
		// 100 -> 'Aj'
		// 10000 -> 'BaQ'
		// 100000 -> 'XZf'
		const encode = num % 64;
		const base = encode < 27 ? 65 : encode < 54 ? 97 - 27 : 48 - 54;
		id = String.fromCodePoint(base + encode) + id;
		num = Math.floor(num / 64) - 1;
	} while (num !== -1);
	return prefix + id;
}
