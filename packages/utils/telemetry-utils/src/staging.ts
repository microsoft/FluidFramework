/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// ///////////////////////////////////////////////////////////////////////// //
//        THIS CODE TO BE MOVED TO COMMON-DEFINITIONS AND COMMON-UTILS       //
// ///////////////////////////////////////////////////////////////////////// //

export interface IFluidErrorBase extends Readonly<Error> {
    readonly errorType: string;
    readonly fluidErrorCode: string;
}

export function isFluidError(e: any): e is IFluidErrorBase {
    return typeof e.fluidErrorCode === "string";
}

/** type guard to ensure it has an errorType e.g. via IErrorBase */
export const hasErrorType = (error: any): error is { errorType: string } => {
    return (typeof error?.errorType === "string");
};

/** This type lets you mixin T onto an existing object */
export type Builder<T> = {
    -readonly [Property in keyof T]?: T[Property];
};

/**
 * This type adds Record, and should only be used on a proper Object
 * that can accept additional properties being added */
export type ExtensibleObject<T> = T & Record<string, unknown>;
