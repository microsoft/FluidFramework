/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// when merging declarations the module path must match exactly. Because of this we need to explicitly export
// IFluidObject as opposed to an export *
export { IFluidObject } from "./fluidObject";

export * from "./fluidLoadable";
// Typescript forgets the index signature when customers augment IRequestHeader if we export *.
// So we export the explicit members as a workaround:
// https://github.com/microsoft/TypeScript/issues/18877#issuecomment-476921038
export {
    IRequest,
    IRequestHeader,
    IResponse,
    IProvideFluidRouter,
    IFluidRouter,
} from "./fluidRouter";
export * from "./handles";
export * from "./fluidPackage";
export * from "./provider";
