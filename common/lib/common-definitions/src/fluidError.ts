/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryProperties } from "./logger";

 /**
 * Can be decl merged to add stuff like packagename, odspErrorResponse, etc
 * The logger impl can choose to log anything in here as appropriate, but by default it's not
 */
export interface ISensitiveDebugData {
    innerError?: any;
}

export interface IFluidError {
    errorType: string;
    message: string;
    getFluidTelemetryProps: () => ITelemetryProperties;  //* use property getters?
    getSensitiveDebugData: () => ISensitiveDebugData & { stack: string };
    addDetails: (props: ITelemetryProperties, debugData: ISensitiveDebugData) => void;
}

export const isIFluidError = (err: any): err is IFluidError =>
    typeof(err?.getFluidTelemetryProps) === "function";
