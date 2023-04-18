/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { jsonableTreeFromCursor, singleTextCursor } from "./treeTextCursor";
import { ICodecFamily, IJsonCodec, makeCodecFamily, makeValueCodec, unitCodec } from "../codec";
import { JsonCompatibleReadOnly } from "../util";
import type { NodeUpdate, OptionalChangeset, ValueChangeset } from "./defaultFieldKindsTypes";
import type { NodeChangeset } from "./modular-schema";
import type {
	EncodedValueChangeset,
	EncodedOptionalChangeset,
	EncodedNodeUpdate,
} from "./defaultFieldKindsFormat";

export const noChangeCodecFamily: ICodecFamily<0> = makeCodecFamily([[0, unitCodec]]);

export const counterCodecFamily: ICodecFamily<number> = makeCodecFamily([
	[0, makeValueCodec<number>()],
]);

export const makeValueFieldCodecFamily = (childCodec: IJsonCodec<NodeChangeset>) =>
	makeCodecFamily([[0, makeValueFieldCodec(childCodec)]]);

export const makeOptionalFieldCodecFamily = (
	childCodec: IJsonCodec<NodeChangeset>,
): ICodecFamily<OptionalChangeset> => makeCodecFamily([[0, makeOptionalFieldCodec(childCodec)]]);

function makeValueFieldCodec(childCodec: IJsonCodec<NodeChangeset>): IJsonCodec<ValueChangeset> {
	return {
		encode: (change: ValueChangeset) => {
			const encoded: EncodedValueChangeset & JsonCompatibleReadOnly = {};
			if (change.value !== undefined) {
				encoded.value = encodeNodeUpdate(change.value, childCodec);
			}

			if (change.changes !== undefined) {
				encoded.changes = childCodec.encode(change.changes);
			}

			return encoded;
		},

		decode: (change: JsonCompatibleReadOnly) => {
			const encoded = change as EncodedValueChangeset;
			const decoded: ValueChangeset = {};
			if (encoded.value !== undefined) {
				decoded.value = decodeNodeUpdate(encoded.value, childCodec);
			}

			if (encoded.changes !== undefined) {
				decoded.changes = childCodec.decode(encoded.changes);
			}

			return decoded;
		},
	};
}

function makeOptionalFieldCodec(
	childCodec: IJsonCodec<NodeChangeset>,
): IJsonCodec<OptionalChangeset> {
	return {
		encode: (change: OptionalChangeset) => {
			const encoded: EncodedOptionalChangeset & JsonCompatibleReadOnly = {};
			if (change.fieldChange !== undefined) {
				encoded.fieldChange = { wasEmpty: change.fieldChange.wasEmpty };
				if (change.fieldChange.newContent !== undefined) {
					encoded.fieldChange.newContent = encodeNodeUpdate(
						change.fieldChange.newContent,
						childCodec,
					);
				}
			}

			if (change.childChange !== undefined) {
				encoded.childChange = childCodec.encode(change.childChange);
			}

			return encoded;
		},

		decode: (change: JsonCompatibleReadOnly) => {
			const encoded = change as EncodedOptionalChangeset;
			const decoded: OptionalChangeset = {};
			if (encoded.fieldChange !== undefined) {
				decoded.fieldChange = {
					wasEmpty: encoded.fieldChange.wasEmpty,
				};

				if (encoded.fieldChange.newContent !== undefined) {
					decoded.fieldChange.newContent = decodeNodeUpdate(
						encoded.fieldChange.newContent,
						childCodec,
					);
				}
			}

			if (encoded.childChange !== undefined) {
				decoded.childChange = childCodec.decode(encoded.childChange);
			}

			return decoded;
		},
	};
}

function encodeNodeUpdate(
	update: NodeUpdate,
	childCodec: IJsonCodec<NodeChangeset>,
): EncodedNodeUpdate {
	const encoded: EncodedNodeUpdate =
		"revert" in update
			? {
					revert: jsonableTreeFromCursor(update.revert),
					revision: update.revision,
			  }
			: {
					set: update.set,
			  };

	if (update.changes !== undefined) {
		encoded.changes = childCodec.encode(update.changes);
	}

	return encoded;
}

function decodeNodeUpdate(
	encoded: EncodedNodeUpdate,
	childCodec: IJsonCodec<NodeChangeset>,
): NodeUpdate {
	const decoded: NodeUpdate =
		"revert" in encoded
			? {
					revert: singleTextCursor(encoded.revert),
					revision: encoded.revision,
			  }
			: { set: encoded.set };

	if (encoded.changes !== undefined) {
		decoded.changes = childCodec.decode(encoded.changes);
	}

	return decoded;
}
