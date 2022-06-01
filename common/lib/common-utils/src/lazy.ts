/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
  * Helper class for lazy initialized values. Ensures the value is only generated once, and remain immutable
  */
export class Lazy<T> {
    private _value: T | undefined;
    private _evaluated: boolean = false;
    /**
     * Instantiates an instance of Lazy<T>
     * @param valueGenerator - the function that will generate the value when value is accessed the first time
     */
    constructor(private readonly valueGenerator: () => T) { }

    /**
     * Return true if the value as been generated, otherwise false
     */
    public get evaluated(): boolean {
        return this._evaluated;
    }

    /**
     * Get the value. If this is the first call the value will be generated
     */
    public get value(): T {
        if (!this._evaluated) {
            this._evaluated = true;
            this._value = this.valueGenerator();
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this._value!;
    }
}
