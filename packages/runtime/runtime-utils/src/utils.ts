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
 * Accepted header keys for requests coming to the runtime.
 * @internal
 */
export enum RuntimeHeaders {
	/**
	 * True to wait for a data store to be created and loaded before returning it.
	 */
	wait = "wait",
	/**
	 * True if the request is coming from an IFluidHandle.
	 */
	viaHandle = "viaHandle",
	/**
	 * True if the request is coming from a handle with a pending payload.
	 */
	payloadPending = "payloadPending",
}

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
 * The following characters emulates the UTF-16 code sequence from 65 - 123, except for the `[` and `{`
 * positioned at 91 and 123 respectively - which are changed to '(' and ')'. Used in the `encodeCompactIdToString` utility below.
 * NOTE: The character set must never be changed - since it could result in collisions with existing ids.
 * If changing, make sure to choose new characters that have never been
 * used before, and the characters must not change their encoding with 'encodeURIComponent'.
 * @internal
 */
export const charSetForEncodingIds =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZ(abcdefghijklmnopqrstuvwxyz)0123456789";

/**
 * Encode compact ID (returned by IContainerRuntime.generateDocumentUniqueId()) to a compact string representation.
 * While this is the main usage pattern, it works with any non-negative integer or a string.
 * Strings are returned as is, and assumed to be UUIDs, i.e. unique enough to never overlap with
 * numbers encoded as strings by this function. Any other strings are likely to run into collisions and should not be used!
 * This function is useful in places where we serialize resulting ID as string and use them as strings, thus we are not
 * gaining any efficiency from having a number type.
 * We do not provide a decode function, so this API is only useful only result is stored and there is no need to go back to original form.
 * @param idArg - input - either a non-negative integer or a string. Strings are returned as is, while numbers are encoded in compat form
 * @param prefix - optional string prefix
 * @returns A string - representation of an input
 * @internal
 */
export function encodeCompactIdToString(idArg: number | string, prefix = "") {
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
		// Here are some examples of the input & output:
		// 0 -> 'A'
		// 1 -> 'B'
		// 64 -> "AA"
		// 100 -> 'Aj'
		// 10000 -> 'BaQ'
		// 100000 -> 'XZf'
		const encode = num % 64;
		id = charSetForEncodingIds[encode] + id;
		num = Math.floor(num / 64) - 1;
	} while (num !== -1);
	return prefix + id;
}
