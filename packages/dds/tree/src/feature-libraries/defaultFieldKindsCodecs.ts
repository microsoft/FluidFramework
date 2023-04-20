/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { jsonableTreeFromCursor, singleTextCursor } from "./treeTextCursor";
import { ICodecFamily, IJsonCodec, makeCodecFamily, makeValueCodec, unitCodec } from "../codec";
import type { NodeUpdate, OptionalChangeset, ValueChangeset } from "./defaultFieldKindsTypes";
import type { NodeChangeset } from "./modular-schema";
import {
	EncodedValueChangeset,
	EncodedOptionalChangeset,
	EncodedNodeUpdate,
} from "./defaultFieldKindsFormat";
import { Type } from "@sinclair/typebox";

export const noChangeCodecFamily: ICodecFamily<0> = makeCodecFamily([[0, unitCodec]]);

export const counterCodecFamily: ICodecFamily<number> = makeCodecFamily([
	[0, makeValueCodec(Type.Number())],
]);

export const makeValueFieldCodecFamily = (childCodec: IJsonCodec<NodeChangeset>) =>
	makeCodecFamily([[0, makeValueFieldCodec(childCodec)]]);

export const makeOptionalFieldCodecFamily = (
	childCodec: IJsonCodec<NodeChangeset>,
): ICodecFamily<OptionalChangeset> => makeCodecFamily([[0, makeOptionalFieldCodec(childCodec)]]);

function makeValueFieldCodec(
	childCodec: IJsonCodec<NodeChangeset>,
): IJsonCodec<ValueChangeset, EncodedValueChangeset> {
	const nodeUpdateCodec = makeNodeUpdateCodec(childCodec);
	return {
		encode: (change: ValueChangeset) => {
			const encoded: EncodedValueChangeset = {};
			if (change.value !== undefined) {
				encoded.value = nodeUpdateCodec.encode(change.value);
			}

			if (change.changes !== undefined) {
				encoded.changes = childCodec.encode(change.changes);
			}

			return encoded;
		},

		decode: (encoded: EncodedValueChangeset) => {
			const decoded: ValueChangeset = {};
			if (encoded.value !== undefined) {
				decoded.value = nodeUpdateCodec.decode(encoded.value);
			}

			if (encoded.changes !== undefined) {
				decoded.changes = childCodec.decode(encoded.changes);
			}

			return decoded;
		},

		encodedSchema: EncodedValueChangeset,
	};
}

function makeOptionalFieldCodec(
	childCodec: IJsonCodec<NodeChangeset>,
): IJsonCodec<OptionalChangeset, EncodedOptionalChangeset> {
	const nodeUpdateCodec = makeNodeUpdateCodec(childCodec);
	return {
		encode: (change: OptionalChangeset) => {
			const encoded: EncodedOptionalChangeset = {};
			if (change.fieldChange !== undefined) {
				encoded.fieldChange = { wasEmpty: change.fieldChange.wasEmpty };
				if (change.fieldChange.newContent !== undefined) {
					encoded.fieldChange.newContent = nodeUpdateCodec.encode(
						change.fieldChange.newContent,
					);
				}
			}

			if (change.childChange !== undefined) {
				encoded.childChange = childCodec.encode(change.childChange);
			}

			return encoded;
		},

		decode: (encoded: EncodedOptionalChangeset) => {
			const decoded: OptionalChangeset = {};
			if (encoded.fieldChange !== undefined) {
				decoded.fieldChange = {
					wasEmpty: encoded.fieldChange.wasEmpty,
				};

				if (encoded.fieldChange.newContent !== undefined) {
					decoded.fieldChange.newContent = nodeUpdateCodec.decode(
						encoded.fieldChange.newContent,
					);
				}
			}

			if (encoded.childChange !== undefined) {
				decoded.childChange = childCodec.decode(encoded.childChange);
			}

			return decoded;
		},

		encodedSchema: EncodedOptionalChangeset,
	};
}

function makeNodeUpdateCodec(
	childCodec: IJsonCodec<NodeChangeset>,
): IJsonCodec<NodeUpdate, EncodedNodeUpdate> {
	return {
		encode: (update: NodeUpdate) => {
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
		},
		decode: (encoded: EncodedNodeUpdate) => {
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
		},
		encodedSchema: EncodedNodeUpdate,
	};
}
