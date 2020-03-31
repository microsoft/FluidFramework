/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle, IComponentHandleContext } from "./handles";

/**
 * JSON serialized form of an IComponentHandle
 */
export interface ISerializedHandle {
    // Marker to indicate to JSON.parse that the object is a Fluid handle
    type: "__fluid_handle__";

    // URL to the object. Relative URLs are relative to the handle context passed to the stringify.
    url: string;
}

export const IComponentSerializer = "IComponentSerializer";

export interface IProvideComponentSerializer {
    readonly [IComponentSerializer]: IComponentSerializer;
}

export interface IComponentSerializer extends IProvideComponentSerializer {
    /**
     * Given a mostly-plain object that may have handle objects embedded within, will return a fully-plain object
     * where any embedded IComponentHandles have been replaced with a serializable form.
     *
     * The original `input` object is not mutated.  This method will shallowly clones all objects in the path from
     * the root to any replaced handles.  (If no handles are found, returns the original object.)
     */
    replaceHandles(value: any, context: IComponentHandleContext, bind: IComponentHandle): any;

    /**
     * Stringifies a given value. Converts any IComponentHandle to its stringified equivalent.
     */
    stringify(value: any, context: IComponentHandleContext, bind: IComponentHandle): string;

    /**
     * Parses the given JSON input string and returns the JavaScript object defined by it. Any component
     * handles will be realized as part of the parse
     */
    parse(value: string, context: IComponentHandleContext): any;
}
