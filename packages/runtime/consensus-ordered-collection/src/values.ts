/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Internal enum and interface describing the value serialization
 *
 * TODO: Refactor this to be common across how distributed data type handle values.
 */

/**
 * The type of serialized object, used describe values in snapshot or operation
 */
export enum ConsensusValueType {
    // The value is another shared object
    Shared,

    // The value is a plain JavaScript object
    Plain,
}

/**
 * Describe values in snapshot or operation
 */
export interface IConsensusOrderedCollectionValue {
    // The type of the value
    type: string;

    // The actual value
    value: any;
}
