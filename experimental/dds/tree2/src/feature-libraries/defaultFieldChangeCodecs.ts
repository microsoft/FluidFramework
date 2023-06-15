/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";
import { ICodecFamily, IJsonCodec, makeCodecFamily, makeValueCodec, unitCodec } from "../codec";
import { JsonCompatibleReadOnly } from "../util";
import { jsonableTreeFromCursor, singleTextCursor } from "./treeTextCursor";
import type { NodeUpdate, OptionalChangeset, ValueChangeset } from "./defaultFieldChangeTypes";
import type { NodeChangeset } from "./modular-schema";
import {
	EncodedValueChangeset,
	EncodedOptionalChangeset,
	EncodedNodeUpdate,
} from "./defaultFieldChangeFormat";

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
): IJsonCodec<ValueChangeset, EncodedValueChangeset<TAnySchema>> {
	const nodeUpdateCodec = makeNodeUpdateCodec(childCodec);
	return {
		encode: (change: ValueChangeset) => {
			const encoded: EncodedValueChangeset<TAnySchema> = {};
			if (change.value !== undefined) {
				encoded.value = nodeUpdateCodec.encode(change.value);
			}

			if (change.changes !== undefined) {
				encoded.changes = childCodec.encode(change.changes);
			}

			return encoded;
		},

		decode: (encoded: EncodedValueChangeset<TAnySchema>) => {
			const decoded: ValueChangeset = {};
			if (encoded.value !== undefined) {
				decoded.value = nodeUpdateCodec.decode(encoded.value);
			}

			if (encoded.changes !== undefined) {
				decoded.changes = childCodec.decode(encoded.changes);
			}

			return decoded;
		},
		encodedSchema: EncodedValueChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}

function makeOptionalFieldCodec(
	childCodec: IJsonCodec<NodeChangeset>,
): IJsonCodec<OptionalChangeset, EncodedOptionalChangeset<TAnySchema>> {
	const nodeUpdateCodec = makeNodeUpdateCodec(childCodec);
	return {
		encode: (change: OptionalChangeset) => {
			const encoded: EncodedOptionalChangeset<TAnySchema> = {};
			if (change.fieldChange !== undefined) {
				encoded.fieldChange = {
					id: change.fieldChange.id,
					wasEmpty: change.fieldChange.wasEmpty,
				};
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

		decode: (encoded: EncodedOptionalChangeset<TAnySchema>) => {
			const decoded: OptionalChangeset = {};
			if (encoded.fieldChange !== undefined) {
				decoded.fieldChange = {
					id: encoded.fieldChange.id,
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
		encodedSchema: EncodedOptionalChangeset(childCodec.encodedSchema ?? Type.Any()),
	};
}

function makeNodeUpdateCodec(
	childCodec: IJsonCodec<NodeChangeset>,
): IJsonCodec<NodeUpdate, EncodedNodeUpdate<TAnySchema>> {
	return {
		encode: (update: NodeUpdate) => {
			const encoded: EncodedNodeUpdate<TAnySchema> =
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

			return encoded as JsonCompatibleReadOnly & EncodedNodeUpdate<TAnySchema>;
		},
		decode: (encoded: EncodedNodeUpdate<TAnySchema>) => {
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
		encodedSchema: EncodedNodeUpdate(childCodec.encodedSchema ?? Type.Any()),
	};
}
