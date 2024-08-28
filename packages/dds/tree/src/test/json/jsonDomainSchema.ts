/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory } from "../../simple-tree/index.js";

const sf = new SchemaFactory("com.fluidframework.json");

export const jsonPrimitiveSchema = [sf.null, sf.boolean, sf.number, sf.string] as const;
export const JsonUnion = [() => JsonObject, () => JsonArray, ...jsonPrimitiveSchema] as const;
export class JsonObject extends sf.mapRecursive("object", JsonUnion) {}
export class JsonArray extends sf.arrayRecursive("array", JsonUnion) {}
