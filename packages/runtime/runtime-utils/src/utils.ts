/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import { IDocumentAttributes, ISnapshotTree } from "@fluidframework/protocol-definitions";

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
	const attributesHash = tree.trees[".protocol"].blobs.attributes;
	const attrib = await readAndParseBlob<IDocumentAttributes>(attributesHash);
	return attrib.sequenceNumber;
}

/**
 * Encode non-negative integer as a string, in a compact form.
 * This function is useful in places where we use numbers as IDs and serialize them as strings,
 * where it's important that such encoding does not result in collisions (i.e. two different numbers
 * to have two different string representations), but otherwise there is no need to decode it back
 * @param numArg - input number, non-negative integer.
 * @param prefix - optinal string prefix
 * @returns A string - representation of an input
 * @internal
 */
export function encodeNumber(numArg: number, prefix = "") {
	// WARNING: result of this function are serialized in storage!
	// If you ever need to change this function, you will need to ensure that
	// for any inputs N1 & N2, old(N1) !== new(N2), where old() - is the old implementation,
	// and new() - is new implementation of encodeNumber()
	// This likely means - this function can't be changed, unless it uses some prefix that ensures
	// new values have zero overlap with old values.
	// Also resulting string can't container "/", as that's disallowed by some users
	// (data store and DDS IDs can't have "/" in their IDs).
	assert(Number.isInteger(numArg) && numArg >= 0, "invalid input");
	let id = "";
	let num = numArg;
	do {
		// 48-57 -> 0-9
		// 65-91 > A-Z[
		// 97-123 -> a-z}
		const encode = num % 64;
		const base = encode < 27 ? 65 : encode < 54 ? 97 - 27 : 48 - 54;
		id = String.fromCharCode(base + encode) + id;
		num = Math.floor(num / 64) - 1;
	} while (num !== -1);
	return prefix + id;
}
