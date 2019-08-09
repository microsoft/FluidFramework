/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle, IComponentHandleContext } from "./handles";

/**
 * JSON serialized form of an IComponentHandle
 */
export interface ISerializedHandle {
    // marker to indicate to JSON.parse that the object is a Fluid handle
    type: "__fluid_handle__";

    // URL to the object. Relative URLs are relative to the handle context passed to the stringify.
    url: string;
}

export interface IComponentSerializer {
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
