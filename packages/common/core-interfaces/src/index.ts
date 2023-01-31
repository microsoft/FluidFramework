/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

export {
	IFluidLoadable,
	IProvideFluidLoadable,
	IFluidRunnable,
	IProvideFluidRunnable,
} from "./fluidLoadable";

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

export {
	IFluidHandleContext,
	IProvideFluidHandleContext,
	IFluidHandle,
	IProvideFluidHandle,
} from "./handles";

export {
	IFluidPackageEnvironment,
	IFluidPackage,
	isFluidPackage,
	IFluidCodeDetailsConfig,
	IFluidCodeDetails,
	isFluidCodeDetails,
	IFluidCodeDetailsComparer,
	IProvideFluidCodeDetailsComparer,
} from "./fluidPackage";

export { FluidObjectProviderKeys, FluidObject, FluidObjectKeys } from "./provider";
