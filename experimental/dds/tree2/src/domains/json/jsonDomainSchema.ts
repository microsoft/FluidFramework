/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AllowedTypes, FieldKinds, FieldSchema, SchemaBuilder } from "../../feature-libraries";
import { requireAssignableTo } from "../../util";
import * as leaf from "../leafDomain";

const builder = new SchemaBuilder({ scope: "Json", libraries: [leaf.library] });

/**
 * @alpha
 * @deprecated Use leaf.number
 */
export const jsonNumber = leaf.number;

/**
 * @alpha
 * @deprecated Use leaf.string
 */
export const jsonString = leaf.string;

/**
 * @alpha
 */
export const jsonNull = builder.struct("Null", {});

/**
 * @alpha
 * @deprecated Use leaf.boolean
 */
export const jsonBoolean = leaf.boolean;

const jsonPrimitives = [...leaf.primitives, jsonNull] as const;

/**
 * Types allowed as roots of Json content.
 * @alpha
 */
export const jsonRoot = [() => jsonObject, () => jsonArray, ...jsonPrimitives] as const;

{
	// Recursive objects don't get this type checking automatically, so confirm it
	type _check = requireAssignableTo<typeof jsonRoot, AllowedTypes>;
}

/**
 * @alpha
 */
export const jsonObject = builder.mapRecursive(
	"Object",
	new FieldSchema(FieldKinds.optional, jsonRoot),
);

/**
 * @alpha
 */
export const jsonArray = builder.fieldNodeRecursive(
	"Array",
	new FieldSchema(FieldKinds.sequence, jsonRoot),
);

/**
 * @alpha
 */
export const jsonSchema = builder.finalize();
