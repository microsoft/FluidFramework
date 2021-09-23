/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */
/* eslint-disable no-param-reassign */
/* eslint-disable no-bitwise */

import { assert } from "@fluidframework/common-utils";
import { Serializable } from "@fluidframework/datastore-definitions";

const enum Type {
    String  = (0x00 << 24),
    Object  = (0x01 << 24),
    Boolean = (0x02 << 24),
    Number  = (0x03 << 24),
    Null    = (0x04 << 24),
    Array   = (0x05 << 24),

    // ...and many more types to come...
}

export class ChunkReader {
    private readonly u4: Uint32Array;
    private readonly dv: DataView;
    private p = 0;

    // For debugging, we build the path to the value being parsed.
    private readonly path: (string | number)[] = [];

    constructor(
        private readonly u1: Uint8Array,
    ) {
        this.u4 = new Uint32Array(this.u1.buffer, this.u1.byteOffset, this.u1.byteLength >> 2);
        this.dv = new DataView(this.u1.buffer);
    }

    private peekType(): Type {
        return this.u4[this.p] << 24;
    }

    private readInt24(): number {
        return this.u4[this.p++] >> 8;
    }

    readNull() {
        this.p++;
        this.p++;

        return null;
    }

    readBoolean() {
        this.p++;
        return this.u4[this.p++] !== 0;
    }

    readOffset() {
        // Convert from distance from end of chunk to absolute offset
        return this.u1.length - this.u4[this.p++];
    }

    readNumber() {
        this.p++;
        const offset = this.readOffset();
        return this.dv.getFloat64(offset, /* littleEndian: */ true);
    }

    private readString(): string {
        const length = this.readInt24();
        const start  = this.readOffset();
        const d = new TextDecoder();
        return d.decode(this.u1.slice(start, start + length));
    }

    private readArray(): unknown[] {
        const length = this.readInt24();
        if (length === 0) {
            this.p++;
            return [];
        }

        const oldP = this.p + 1;
        this.p = this.u4[this.p];

        const array: unknown[] = new Array(length);
        for (let i = 0; i < length; i++) {
            this.path.push(i);              // DEBUG
            array[i] = this.readValue();
            this.path.pop();                // DEBUG
        }

        this.p = oldP;

        return array;
    }

    private readObject(): Serializable<Record<string, unknown>> {
        const numKeys = this.readInt24();
        if (numKeys === 0) {
            this.p++;
            return {};
        }

        const oldP = this.p + 1;
        this.p = this.u4[this.p];

        const props: PropertyDescriptorMap = {};
        for (let i = 0; i < numKeys; i++) {
            const key = this.readString();      // DEBUG
            this.path.push(key);

            const value = this.readValue();     // DEBUG
            props[key] = {
                value,
                enumerable: true,
                writable: false,
            };

            this.path.pop();
        }

        this.p = oldP;

        return Object.defineProperties({}, props) as Serializable<Record<string, unknown>>;
    }

    private readValue(): Serializable {
        switch (this.peekType()) {
            case Type.Null:
                return this.readNull();
            case Type.Boolean:
                return this.readBoolean();
            case Type.Number:
                return this.readNumber();
            case Type.Object:
                return this.readObject();
            case Type.Array:
                return this.readArray();
            case Type.String:
                return this.readString();
            default:
                assert(false, this.path.join("."));
        }
    }

    public read<T>(): Serializable<T> {
        return this.readValue() as Serializable<T>;
    }
}

export class ChunkWriter {
    private readonly u4: Uint32Array;
    private readonly dv: DataView;

    private pu4Head     = 0;
    private pu4NextHead = 2;
    private pu1Tail     = 0;

    constructor(public readonly u1: Uint8Array = new Uint8Array(8192)) {
        this.u4 = new Uint32Array(u1.buffer);
        this.dv = new DataView(u1.buffer);
        this.pu1Tail = this.u1.length;
    }

    writeTypeAndInt24(type: Type, int24: number) {
        this.u4[this.pu4Head++] = (int24 << 8) | (type >>> 24);
    }

    writeOffset(pu1Offset) {
        this.u4[this.pu4Head++] = this.u1.length - pu1Offset;
    }

    writeString(value: string) {
        const e = new TextEncoder();
        const bytes = e.encode(value);
        this.pu1Tail -= bytes.length;
        this.u1.set(bytes, this.pu1Tail);

        this.writeTypeAndInt24(Type.String, bytes.length);
        this.writeOffset(this.pu1Tail);
    }

    writeBoolean(value: boolean) {
        this.writeTypeAndInt24(Type.Boolean, 0);
        this.u4[this.pu4Head++] = value ? 1 : 0;
    }

    writeNull() {
        this.writeTypeAndInt24(Type.Null, 0);
        this.u4[this.pu4Head++] = 0;
    }

    writeNumber(value: number) {
        this.pu1Tail -= 8;
        this.dv.setFloat64(this.pu1Tail, value, /* littleEndian: */ true);
        this.writeTypeAndInt24(Type.Number, 0);
        this.writeOffset(this.pu1Tail);
    }

    pushObject(u4Length: number) {
        this.u4[this.pu4Head++] = this.pu4NextHead;

        const pu4OldHead = this.pu4Head;
        this.pu4Head = this.pu4NextHead;
        this.pu4NextHead += u4Length;

        return pu4OldHead;
    }

    writeObject(
        obj: Serializable<Record<string, unknown>>,
    ) {
        const keys = Object.keys(obj as Record<string, unknown>);
        this.writeTypeAndInt24(Type.Object, keys.length);
        const pu4OldHead = this.pushObject(keys.length << 2);

        for (const key of keys) {
            this.writeString(key);
            this.writeValue(obj[key]);
        }

        this.pu4Head = pu4OldHead;
    }

    writeArray(
        array: Serializable<unknown[]>,
    ) {
        this.writeTypeAndInt24(Type.Array, array.length);
        const pu4OldHead = this.pushObject(array.length << 1);

        for (const item of array) {
            this.writeValue(item ?? null);
        }

        this.pu4Head = pu4OldHead;
    }

    writeValue(value: Serializable) {
        switch (typeof value) {
            case "object":
                if (Array.isArray(value)) {
                    this.writeArray(value);
                } else if (value === null) {
                    this.writeNull();
                } else {
                    this.writeObject(value);
                }
                break;
            case "string":
                this.writeString(value);
                break;
            case "boolean":
                this.writeBoolean(value);
                break;
            case "number":
                this.writeNumber(value);
                break;
            default:
                assert(false, "");
        }
    }

    public trim() {
        const x = this.pu4NextHead << 2;
        return this.u1
            .copyWithin(x, this.pu1Tail)
            .slice(0, x + this.u1.length - this.pu1Tail);
    }
}
