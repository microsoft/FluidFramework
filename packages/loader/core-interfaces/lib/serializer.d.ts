/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidHandle } from "./handles";
/**
 * JSON serialized form of an IFluidHandle
 */
export interface ISerializedHandle {
    type: "__fluid_handle__";
    url: string;
}
export declare const IFluidSerializer: keyof IProvideFluidSerializer;
export interface IProvideFluidSerializer {
    readonly IFluidSerializer: IFluidSerializer;
}
export interface IFluidSerializer extends IProvideFluidSerializer {
    /**
     * Given a mostly-plain object that may have handle objects embedded within, will return a fully-plain object
     * where any embedded IFluidHandles have been replaced with a serializable form.
     *
     * The original `input` object is not mutated.  This method will shallowly clones all objects in the path from
     * the root to any replaced handles.  (If no handles are found, returns the original object.)
     */
    replaceHandles(value: any, bind: IFluidHandle): any;
    /**
     * Stringifies a given value. Converts any IFluidHandle to its stringified equivalent.
     */
    stringify(value: any, bind: IFluidHandle): string;
    /**
     * Parses the given JSON input string and returns the JavaScript object defined by it. Any Fluid
     * handles will be realized as part of the parse
     */
    parse(value: string): any;
}
//# sourceMappingURL=serializer.d.ts.map