/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IProvideFluidConfiguration, IProvideFluidLoadable, IProvideFluidRunnable } from "./fluidLoadable";
import { IProvideFluidRouter } from "./fluidRouter";
import { IProvideFluidHandle, IProvideFluidHandleContext } from "./handles";
import { IProvideFluidSerializer } from "./serializer";
export interface IFluidObject extends Readonly<Partial<IProvideFluidLoadable & IProvideFluidRunnable & IProvideFluidRouter & IProvideFluidHandleContext & IProvideFluidConfiguration & IProvideFluidHandle & IProvideFluidSerializer>> {
}
//# sourceMappingURL=fluidObject.d.ts.map