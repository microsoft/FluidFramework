/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TAnySchema, Type } from "@sinclair/typebox";
import { ICodecFamily, IJsonCodec, makeCodecFamily, unitCodec } from "../../codec";
import { JsonCompatibleReadOnly, Mutable } from "../../util";
import { jsonableTreeFromCursor, singleTextCursor } from "../treeTextCursor";
import type { NodeChangeset } from "../modular-schema";
import type { NodeUpdate, OptionalChangeset, OptionalFieldChange } from "./defaultFieldChangeTypes";
import { EncodedOptionalChangeset, EncodedNodeUpdate } from "./defaultFieldChangeFormat";

export const noChangeCodecFamily: ICodecFamily<0> = makeCodecFamily([[0, unitCodec]]);

export const makeOptionalFieldCodecFamily = (
	childCodec: IJsonCodec<NodeChangeset>,
): ICodecFamily<OptionalChangeset> => makeCodecFamily([[0, makeOptionalFieldCodec(childCodec)]]);

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
				if (change.fieldChange.revision !== undefined) {
					encoded.fieldChange.revision = change.fieldChange.revision;
				}
				if (change.fieldChange.newContent !== undefined) {
					encoded.fieldChange.newContent = nodeUpdateCodec.encode(
						change.fieldChange.newContent,
					);
				}
			}

			if (change.childChanges !== undefined) {
				encoded.childChanges = change.childChanges.map(([id, childChange]) => [
					id,
					childCodec.encode(childChange),
				]);
			}

			return encoded;
		},

		decode: (encoded: EncodedOptionalChangeset<TAnySchema>) => {
			const decoded: Mutable<OptionalChangeset> = {};
			if (encoded.fieldChange !== undefined) {
				const decodedFieldChange: Mutable<OptionalFieldChange> = {
					id: encoded.fieldChange.id,
					wasEmpty: encoded.fieldChange.wasEmpty,
				};
				if (encoded.fieldChange.revision !== undefined) {
					decodedFieldChange.revision = encoded.fieldChange.revision;
				}
				if (encoded.fieldChange.newContent !== undefined) {
					decodedFieldChange.newContent = nodeUpdateCodec.decode(
						encoded.fieldChange.newContent,
					);
				}
				decoded.fieldChange = decodedFieldChange;
			}

			if (encoded.childChanges !== undefined) {
				decoded.childChanges = encoded.childChanges.map(([id, childChange]) => [
					id,
					childCodec.decode(childChange),
				]);
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
							changeId: update.changeId,
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
							changeId: encoded.changeId,
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
