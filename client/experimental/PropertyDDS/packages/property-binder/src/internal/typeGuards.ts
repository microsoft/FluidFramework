/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ArrayProperty, MapProperty, ReferenceProperty, SetProperty } from '@fluid-experimental/property-properties';
import { TypeIdHelper } from '@fluid-experimental/property-changeset';
import { Property } from './propertyElement';

export function isReferenceProperty(property: Property): property is ReferenceProperty {
    return TypeIdHelper.isReferenceTypeId(property!.getTypeid());
}

export function isCollection(property: Property): property is ArrayProperty | MapProperty | SetProperty {
    return property!.getContext() !== 'single';
}

