/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview This namespace is used to resolve cycles between the PropertyFactory and the property objects.
 * It will return an empty namespace, which then once the PropertyFactory has been created will be initialized with the
 * PropertyFactory and the property classes, so that the PropertyObjects themselves can access the PropertyFactory at
 * runtime.
 */

export const LazyLoadedProperties = {
    PropertyFactory: undefined,
    AbstractStaticCollectionProperty: undefined,
    ArrayProperty: undefined,
    EnumArrayProperty: undefined,
    ReferenceProperty: undefined,
    StringProperty: undefined,
    ValueProperty: undefined,
    ValueMapProperty: undefined,
    ReferenceMapProperty: undefined,
    NodeProperty: undefined,
    IndexedCollectionBaseProperty: undefined,
};
