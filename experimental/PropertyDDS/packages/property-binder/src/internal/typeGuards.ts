/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypeIdHelper } from "@fluid-experimental/property-changeset";
import {
	ArrayProperty,
	MapProperty,
	ReferenceProperty,
	SetProperty,
} from "@fluid-experimental/property-properties";
import { Property } from "./propertyElement.js";

export function isReferenceProperty(property: Property): property is ReferenceProperty {
	return TypeIdHelper.isReferenceTypeId(property!.getTypeid());
}

export function isCollection(
	property: Property,
): property is ArrayProperty | MapProperty | SetProperty {
	return property!.getContext() !== "single";
}
