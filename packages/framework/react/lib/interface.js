export const instanceOfIFluidLoadable = (object) => object === Object(object) && "IFluidLoadable" in object;
export const instanceOfEffectFunction = (object) => object === Object(object) && "function" in object;
export const instanceOfAsyncEffectFunction = (object) => object === Object(object) && "asyncFunction" in object;
export const instanceOfStateUpdateFunction = (object) => object === Object(object) && "function" in object;
export const instanceOfAsyncStateUpdateFunction = (object) => object === Object(object) && "asyncFunction" in object;
export const instanceOfSelectorFunction = (object) => object === Object(object) && "function" in object;
export const instanceOfFluidObjectSelectorFunction = (object) => object === Object(object) && "function" in object;
//# sourceMappingURL=interface.js.map