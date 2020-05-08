/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
  * Helper class for lazy initialized values. Ensures the value is only generated once, and remain immutable
  */
export class Lazy<T> {
    private pValue: T | undefined;
    private pEvaluated: boolean = false;
    /**
     * Instantiates an instance of Lazy<T>
     * @param valueGenerator - the function that will generate the value when value is accessed the first time
     */
    constructor(private readonly valueGenerator: () => T) {}

    /**
     * Return true if the value as been generated, otherwise false
     */
    public get evaluated(): boolean {
        return this.pEvaluated;
    }

    /**
     * Get the value. If this is the first call the value will be generated
     */
    public get value(): T {
        if (!this.pEvaluated) {
            this.pEvaluated = true;
            this.pValue = this.valueGenerator();
        }
        return this.pValue!;
    }
}
