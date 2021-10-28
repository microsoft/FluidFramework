/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { IFluidHandle } from "./handles";

/**
 * JSON serialized form of an IFluidHandle
 */
export interface ISerializedHandle {
    // Marker to indicate to JSON.parse that the object is a Fluid handle
    type: "__fluid_handle__";

    // URL to the object. Relative URLs are relative to the handle context passed to the stringify.
    url: string;
}

export const IFluidSerializer: keyof IProvideFluidSerializer = "IFluidSerializer";

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
     * Given a fully-jsonable object tree that may have encoded handle objects embedded within, will return an
     * equivalent object tree where any encoded IFluidHandles have been replaced with thier decoded form.
     *
     * The original `input` object is not mutated.  This method will shallowly clones all objects in the path from
     * the root to any replaced handles.  (If no handles are found, returns the original object.)
     *
     * The decoded handles are implicitly bound to the handle context of this serializer.
     */
    decode?(input: any): any;

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
