/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { bufferToString, IsoBuffer } from "@fluidframework/common-utils";

export abstract class ChangeEncoder<TChange> {
    public abstract encodeForJson(formatVersion: number, change: TChange): JsonCompatible;
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

    public abstract decodeJson(formatVersion: number, change: JsonCompatible): TChange;

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
/**
 * Use for Json compatible data.
 *
 * Note that this does not robustly forbid non json comparable data via type checking,
 * but instead mostly restricts access to it.
 */
// eslint-disable-next-line @rushstack/no-new-null
export type JsonCompatible = string | number | boolean | null | JsonCompatible[] | { [P in string]: JsonCompatible; };
