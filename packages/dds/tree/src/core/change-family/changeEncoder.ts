/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, IsoBuffer } from "@fluidframework/common-utils";
import { JsonCompatibleReadOnly } from "../../util";

/**
 * Serializes and deserializes changes.
 * Supports both binary and JSON formats.
 * Due to data using these formats being persisted in documents,
 * any format for encoding that was ever actually used should be supported for decoding for all future versions.
 *
 * TODO: Nothing in here is specific to changes. Maybe make this interface more general.
 */
export abstract class ChangeEncoder<TChange> {
    /**
     * Encodes `change` into a JSON compatible object.
     */
    public abstract encodeForJson(formatVersion: number, change: TChange): JsonCompatibleReadOnly;

    /**
     * Binary encoding.
     * Override to do better than just Json.
     *
     * TODO: maybe use DataView or some kind of writer instead of IsoBuffer.
     */
    public encodeBinary(formatVersion: number, change: TChange): IsoBuffer {
        const jsonable = this.encodeForJson(formatVersion, change);
        const json = JSON.stringify(jsonable);
        return IsoBuffer.from(json);
    }

    /**
     * Decodes `change` from a JSON compatible object.
     */
    public abstract decodeJson(formatVersion: number, change: JsonCompatibleReadOnly): TChange;

    /**
     * Binary decoding.
     * Override to do better than just Json.
     */
    public decodeBinary(formatVersion: number, change: IsoBuffer): TChange {
        const json = bufferToString(change, "utf8");
        const jsonable = JSON.parse(json);
        return this.decodeJson(formatVersion, jsonable);
    }
}
