/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint accessor-pairs: [2, { "getWithoutSet": false }] */

/**
 * The data arrays definition file.
 */

/**
  * A typed data container that is persistable, high-performance, and can be used
  * as a backing store for collaborative property sets.
 */
class BaseDataArray {
    protected _buffer: any;
    private readonly bufferConstructor;
    protected size: number;

    constructor(size: number);

    /**
     * @param bufferConstructor - This is the constructor to be used to
     *    setup the internal buffer of the DataArray.
     * @param size - The initial size with which to allocate the array.
     */
    constructor(bufferConstructor: any, size: number);
    constructor(a, b?) {
        if (typeof a === "number") {
            this.size = a;
            this.bufferConstructor = this.getBufferCtor();
        } else {
            this.bufferConstructor = a;
            this.size = b;
        }
        // The 'eslint-...' is used to disable the rule that requires
        // constructors to start with a capitalized letter.
        this._buffer = new this.bufferConstructor(this.size); // eslint-disable-line new-cap
    }

    /**
     * Get the value at an index. If no index is passed, return zeroth item.
     * @param in_idx -  the specific item in the data array.
     * @returns the value at that index
     */
    getValue(in_idx = 0): any {
        if (in_idx >= this.size || in_idx < 0) {
            throw new Error("Trying to access out of bounds!");
        }

        return this._buffer[in_idx];
    }

    /**
     * Return a range of values in the array.
     * @param in_idxStart - the starting index
     * @param in_idxEnd - the end index
     * @returns the array of values in the range
     */
    getValueRange(in_idxStart: number, in_idxEnd: number) {
        if (in_idxStart >= this.size || in_idxEnd > this.size || in_idxStart < 0 || in_idxEnd < 0) {
            throw new Error("Trying to access out of bounds!");
        }

        return this._buffer.subarray(in_idxStart, in_idxEnd);
    }

    /**
     * Return the serialized form of Data Arrays.
     * @returns An object containing an array of the values.
     */
    serialize(): number[] {
        return Array.from(this._buffer.subarray(0, this.size));
    }

    /**
     * Deserialize data from a serialized representation
     * @param in_serialized - the serialized representation
     */
    deserialize(in_serialized) {
        const values = in_serialized;
        const length = in_serialized.length;
        if (length !== this.size) {
            this.resize(length);
            this.size = length;
        }
        let i;
        for (i = 0; i < length; i++) {
            this._buffer[i] = values[i];
        }
    }

    /**
     * Set value at an index.
     * @param in_idx - the index
     * @param in_value - the value we want to set at index
     */
    setValue(in_idx: number, in_value) {
        if (in_idx < this._buffer.length) {
            this._buffer[in_idx] = in_value;
        } else {
            console.error("DataArray setValue in_idx is out of bounds.");
        }
    }

    /**
     * creates a copy of a typed array with removed elements
     * @param in_arr - the input array (won't be modified)
     * @param in_offset - starting index of range that will be removed
     * @param in_deleteCount - number of removed elements
     * @returns a copy of the input array without the selected range
     */
    private _removeElementsFromArray(in_arr, in_offset: number, in_deleteCount: number) {
        // TODO: this function can be optimized
        const newSize = this.size - in_deleteCount;
        const splicedArray = new in_arr.constructor(newSize);
        splicedArray.set(in_arr.subarray(0, in_offset));
        splicedArray.set(in_arr.subarray(in_offset + in_deleteCount, this.size), in_offset);
        return splicedArray;
    }

    /**
     * remove a range of elements from the array
     * @param in_offset - start of the range
     * @param in_deleteCount - number of elements to be removed
     */
    removeRange(in_offset: number, in_deleteCount: number) {
        if (in_offset + in_deleteCount < (this._buffer.length as number) + 1) {
            this._buffer = this._removeElementsFromArray(this._buffer, in_offset, in_deleteCount);
            this.size = this.size - in_deleteCount;
        } else {
            console.error("DataArray removeRange in_offset + in_deleteCount is out of bounds.");
        }
    }

    /**
     * copy an array with elements inserted into the copy
     * @param in_arr - the input array (won't be modified)
     * @param in_offset - the index where the new elements will be inserted
     * @param in_addedArray - the array with the elements that will be added
     * @returns the combined array
     */
    private _insert(in_arr, in_offset: number, in_addedArray) {
        // TODO: this function can be optimized
        const newSize = this.size + (in_addedArray.length as number);
        const insertedArray = new in_arr.constructor(newSize);
        insertedArray.set(in_arr.subarray(0, in_offset));
        insertedArray.set(in_addedArray, in_offset);
        insertedArray.set(in_arr.subarray(in_offset, this.size), in_offset + (in_addedArray.length as number));
        return insertedArray;
    }

    /**
     * insert the content of an array into the DataArray
     * @param in_offset - the target index
     * @param in_array - the array to be inserted
     */
    insertRange(in_offset: number, in_array) {
        this._buffer = this._insert(this._buffer, in_offset, in_array);
        this.size = this.size + (in_array.length as number);
    }

    /**
     * Set this array values to be equal to in_array values
     * @param in_offset - An optional offset in this array to begin start
     *                  setting this arrays values to in_array values.
     * @param in_array - the input array
     */
    set(in_offset: number, in_array) {
        if (in_array instanceof ArrayBuffer || in_array instanceof Array || in_array instanceof this.getBufferCtor()) {
            this._buffer.set(in_array, in_offset);
        } else if (in_array instanceof BaseDataArray) {
            this._buffer.set(in_array.getBuffer(), in_offset);
        } else {
            console.error("DataArray set() must be called with Array, TypedArray or DataArray");
        }
    }

    /**
     * insert a value at the end of the array, creates a new element at the end and sets the value
     * @param in_value - the new value
     */
    push(in_value) {
        // Adjust the buffer if necessary
        const bufferLength = this._buffer.length;
        if (this.size > bufferLength - 1) {
            this._alloc(this.size * 2 || 1); // grow by a factor of 2x
        }
        // set the value and update size
        this.setValue(this.size, in_value);
        this.size++;
    }

    /**
     * get direct access to the data (for performance reasons)
     * this should be uses read only
     * @returns the (read only) raw data
     */
    getBuffer() {
        return this._buffer;
    }

    /**
     * get the constructor of the underlying TypedArray
     * @returns the constructor for the data buffer
     */
    getBufferCtor() {
        return this.bufferConstructor;
    }

    /**
     * apply a given function to all elements of the array
     * @param in_fn - the function that will be applied to every element
     */
    iterate(in_fn) {
        const l = this.size;
        for (let i = 0; i < l; i++) {
            in_fn(this._buffer[i]);
        }
    }

    /**
     * get a resized buffer copy
     * @param in_bufferCtor - the constructor for the returned buffer
     * @param in_buffer - the input buffer (won't be modified)
     * @param in_newSize - the target size
     * @returns the buffer with the new size
     */
    private resizeBuffer(in_bufferCtor, in_buffer, in_newSize: number) {
        // target buffer with the desired new size
        // The 'eslint-...' is used to disable the rule that requires
        // constructors to start with a capitalized letter.
        const newBuffer = new in_bufferCtor(in_newSize); // eslint-disable-line new-cap
        const oldSize = in_buffer.length;
        const oldBuffer = in_buffer;
        const isShrinking = oldSize > in_newSize;
        newBuffer.set(isShrinking ? oldBuffer.subarray(0, in_newSize) : oldBuffer);
        return newBuffer;
    }

    /**
     * allocate memory for the array (for performance reasons, you can allocate more space than the current length,
     * which makes pushes to the array less expensive later)
     * @param size - the target allocated space
     * @returns the DataArray itself
     */
    protected _alloc(size: number): any {
        this._buffer = this.resizeBuffer(this.bufferConstructor, this._buffer, size);
        return this;
    }

    /**
     * Change the size of the array
     * @param size - The target size
     * @returns The DataArray itself
     */
    resize(size: number) {   // this can be costly!!!
        this._alloc(size);
        this.size = size;
        return this;
    }

    copy() {  // and this!
        const newBuffer = new this.bufferConstructor(this.size); // buffer with the desired new size
        newBuffer.set(this._buffer);
        return newBuffer;
    }

    get length() {
        return this.size;
    }
}

class Int8DataArray extends BaseDataArray {
    constructor(size: number) {
        super(Int8Array, size);
    }
}

class Int16DataArray extends BaseDataArray {
    constructor(size: number) {
        super(Int16Array, size);
    }
}

class Int32DataArray extends BaseDataArray {
    constructor(size: number) {
        super(Int32Array, size);
    }
}

class Uint8DataArray extends BaseDataArray {
    constructor(size: number) {
        super(Uint8Array, size);
    }
}

class Uint16DataArray extends BaseDataArray {
    constructor(size: number) {
        super(Uint16Array, size);
    }
}

class Uint32DataArray extends BaseDataArray {
    constructor(size: number) {
        super(Uint32Array, size);
    }
}

class Float32DataArray extends BaseDataArray {
    constructor(size: number) {
        super(Float32Array, size);
    }
}

class Float64DataArray extends BaseDataArray {
    constructor(size: number) {
        super(Float64Array, size);
    }
}

/**
 * A data container that can contain every native type
 *
 * @param size - The initial size with which to allocate the array.
 */
class UniversalDataArray extends BaseDataArray {
    constructor(bufferConstructor: any, size: number);
    constructor(size: number);
    constructor(a?, b?) {
        if (b === undefined) {
            super(Array, a);
        } else {
            super(a, b);
        }
    }

    /**
 * helper function to write array values into another array at a given offset
 * @param array - target array
 * @param values - the values we need to write
 * @param offset - starting index in target array
 */
    private arraySet(array, values, offset = 0) {
        let index = 0;
        values.forEach(function(value) {
            array[index + offset] = value;
            index++;
        });
    }

    /**
     * Insert the content of an array into the DataArray
     * @param in_offset - The target index
     * @param in_array - The array to be inserted
     */
    insertRange(in_offset: number, in_array: any[]) {
        this._buffer.splice.call(this._buffer, ...[in_offset, 0].concat(in_array));
        this.size = this.size + in_array.length;
    }

    /**
     * remove a range of elements from the array
     * @param in_offset - start of the range
     * @param in_deleteCount - number of elements to be removed
     */
    removeRange(in_offset: number, in_deleteCount: number) {
        if (in_offset + in_deleteCount < (this._buffer.length as number) + 1) {
            this._buffer.splice(in_offset, in_deleteCount);
            this.size -= in_deleteCount;
        } else {
            throw Error("DataArray removeRange in_offset + in_deleteCount is out of bounds.");
        }
    }

    /**
     * Set this array values to be equal to in_array values
     * @param in_offset - An optional offset in this array to begin start
     *                  setting this arrays values to in_array values.
     * @param in_array - the input array
     */
    set(in_offset: number, in_array) {
        if (in_array instanceof ArrayBuffer || in_array instanceof Array || in_array instanceof this.getBufferCtor()) {
            this.arraySet(this._buffer, in_array, in_offset);
        } else if (in_array instanceof BaseDataArray) {
            this.arraySet(this._buffer, in_array.getBuffer(), in_offset);
        } else {
            console.error("DataArray set() must be called with Array, TypedArray or DataArray");
        }
    }

    /**
     * Return a range of values in the array.
     * @param in_idxStart - the starting index
     * @param in_idxEnd - the end index - this offset is exclusive
     * @returns the array of values in the range
     */
    getValueRange(in_idxStart: number, in_idxEnd: number) {
        if (in_idxStart >= this.size || in_idxEnd > this.size || in_idxStart < 0 || in_idxEnd < 0) {
            throw new Error("Trying to access out of bounds!");
        }
        return this._buffer.slice(in_idxStart, in_idxEnd);
    }

    /**
     * change the size of a javascript array and keep the content, if possible. Keeps the input buffer.
     * @param in_buffer - input buffer - not changed
     * @param in_newSize - target size
     * @returns an Array of the new size
     */
    private resizeBufferArray(in_buffer, in_newSize) {
        // target buffer with the desired new size
        const newBuffer = new Array(in_newSize);
        const oldSize = in_buffer.length;
        const oldBuffer = in_buffer;
        const isShrinking = oldSize > in_newSize;
        this.arraySet(newBuffer, isShrinking ? oldBuffer.slice(0, in_newSize) : oldBuffer);
        return newBuffer;
    }

    /**
     * allocate memory for the array (for performance reasons, you can allocate more space than the current length,
     * which makes pushes to the array less expensive later)
     * @param size - the target allocated space
     * @returns the DataArray itself
     */
    protected _alloc(size: number): any {
        this._buffer = this.resizeBufferArray(this._buffer, size);
        return this;
    }
}

/**
 * A data container that contains a string
 */
class StringDataArray extends BaseDataArray {
    constructor() {
        super(String, 0);
        this.size = 0;
        this._buffer = "";
    }
    /**
     * insert the content of a string into the StringDataArray
     * @param in_offset - the target index
     * @param in_string - the string to be inserted
     */
    insertRange(in_offset: number, in_string: string) {
        this._buffer = `${this._buffer.substr(0, in_offset)}${in_string}${this._buffer.substr(in_offset)}`;
        this.size = this.size + in_string.length;
    }

    /**
     * remove a range of elements from the string
     * @param in_offset - start of the range
     * @param in_deleteCount - number of elements to be removed
     */
    removeRange(in_offset: number, in_deleteCount: number) {
        if (in_offset + in_deleteCount < (this._buffer.length as number) + 1) {
            this._buffer = `${this._buffer.substr(0, in_offset)}${this._buffer.substr(in_offset + in_deleteCount)}`;
            this.size -= in_deleteCount;
        } else {
            throw Error("DataArray removeRange in_offset + in_deleteCount is out of bounds.");
        }
    }

    /**
     * Set this array values to be equal to in_string values
     * @param in_offset - The offset in this array to begin start
     *                  setting this arrays values to in_string values.
     * @param in_string - the input string
     */
    set(in_offset: number, in_string: string) {
        this._buffer =
            `${this._buffer.substr(0, in_offset)}${in_string}${this._buffer.substr(in_offset + in_string.length)}`;
    }

    /**
     * Return a range of characters in the string.
     * @param in_idxStart - the starting index
     * @param in_idxEnd - the end index - this offset is exclusive
     * @returns the characters in the range
     */
    getValueRange(in_idxStart: number, in_idxEnd: number): string {
        if (in_idxStart >= this.size || in_idxEnd > this.size || in_idxStart < 0 || in_idxEnd < 0) {
            throw new Error("Trying to access out of bounds!");
        }
        return this._buffer.slice(in_idxStart, in_idxEnd);
    }

    get length() { return this._buffer.length; }
}

/**
 * A data container that can contain boolean type
 */
class BoolDataArray extends UniversalDataArray {
    /**
     * @param size - The initial size with which to allocate the array.
     */
    constructor(size: number) {
        super(Array, size);
    }

    /**
     * helper function to write and cast to boolean array values into another array at a given offset
     * @param array - target array
     * @param values - the values we need to write
     * @param offset - starting index in target array
     */
    private arraySetBool(array, values, offset = 0) {
        let index = 0;
        values.forEach(function(value) {
            array[index + offset] = !!(value as boolean);
            index++;
        });
    }

    /**
     * insert the content of an array into the DataArray
     * @param in_offset - the target index
     * @param in_array - the array to be inserted
     */
    insertRange(in_offset: number, in_array: any[]) {
        const toBeAdded: any[] = in_array.map((val) => !!(val as boolean));
        this._buffer.splice.call(this._buffer, ...([in_offset, 0].concat(toBeAdded)));
        this.size = this.size + in_array.length;
    }

    /**
     * Set this array values to be equal to in_array values
     * @param in_offset - An optional offset in this array to begin start
     *                  setting this arrays values to in_array values.
     * @param in_array - the input array
     */
    set(in_offset: number, in_array) {
        if (in_array instanceof ArrayBuffer || in_array instanceof Array || in_array instanceof this.getBufferCtor()) {
            this.arraySetBool(this._buffer, in_array, in_offset);
        } else if (in_array instanceof BaseDataArray) {
            this.arraySetBool(this._buffer, in_array.getBuffer(), in_offset);
        } else {
            console.error("DataArray set() must be called with Array, TypedArray or DataArray");
        }
    }
}

export {
    BaseDataArray,
    Float32DataArray,
    Float64DataArray,
    Int8DataArray,
    Int16DataArray,
    Int32DataArray,
    Uint8DataArray,
    Uint16DataArray,
    Uint32DataArray,
    UniversalDataArray,
    StringDataArray,
    BoolDataArray,
};
