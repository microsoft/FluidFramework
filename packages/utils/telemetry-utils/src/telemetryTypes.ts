/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Property types that can be logged.
 *
 * @remarks Logging entire objects is considered extremely dangerous from a telemetry point of view because people can
 * easily add fields to objects that shouldn't be logged and not realize it's going to be logged.
 * General best practice is to explicitly log the fields you care about from objects.
 */
export type TelemetryEventPropertyTypeExt = string
    | string
    | number
    | boolean
    | undefined
    | null
    | (string | number | boolean)[];

 /**
  * A property to be logged to telemetry containing both the value and a tag. Tags are generic strings that can be used
  * to mark pieces of information that should be organized or handled differently by loggers in various first or third
  * party scenarios. For example, tags are used to mark PII that should not be stored in logs.
  */
export interface ITaggedTelemetryPropertyTypeExt {
    value: TelemetryEventPropertyTypeExt;
    tag: string;
}

/**
 * JSON-serializable properties, which will be logged with telemetry.
 */
export interface ITelemetryPropertiesExt {
    [index: string]: TelemetryEventPropertyTypeExt | ITaggedTelemetryPropertyTypeExt;
}
