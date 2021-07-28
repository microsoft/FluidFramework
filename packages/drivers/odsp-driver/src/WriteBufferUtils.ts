/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { ReadBuffer } from "./ReadBufferUtils";

/**
 * Buffer class, used to sequentially writ data.
 * Used by tree code to serialize tree into binary representation.
 */
export class WriteBuffer {
    protected data?: Uint8Array = new Uint8Array(4096);
    protected index = 0;

    protected push(code: number) {
        assert(this.data !== undefined, "Data should be there");
        const length = this.data.length;
        if (this.index === length) {
            const newData = new Uint8Array(length * 1.2 + 4096);
            let index = 0;
            const oldData = this.data;
            while (index < length) {
                newData[index] = oldData[index];
                index++;
            }
            this.data = newData;
        }
        this.data[this.index] = code % 256;
        this.index++;
    }

    public write(codeArg: number, lengthArg = 1) {
        let code = codeArg;
        let length = lengthArg;
        while (length > 0) {
            this.push(code % 256);
            code = Math.floor(code / 256);
            length--;
        }
        assert(code === 0, `Should write complete data code= ${codeArg} ${lengthArg}`);
    }

    public done(): ReadBuffer {
        assert(this.data !== undefined, "Data should be there");
        // We can slice it to have smaller memory representation.
        // But it will be way more expensive in terms of CPU cycles!
        const buffer = new ReadBuffer(this.data.subarray(0, this.index));
        this.data = undefined;
        return buffer;
    }
}
