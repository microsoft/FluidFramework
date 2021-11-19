/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseProperty, NodeProperty } from ".";

export class PropertyUtils {

    /**
     * Gather all properties that pass an arbitrary predicate function
     * @param in_rootProperty - The root property to traverse from
     * @param in_predicate - The predicate function
     * @returns The map of properties that passed the predicate and their corresponding paths
     * function
     */
    static gatherProperties = function(
        in_rootProperty: NodeProperty,
        in_predicate: (x: BaseProperty) => boolean
    ): Record<string, BaseProperty> {
        var gatheredProperties = {};
        in_rootProperty.traverseDown(function(property, path) {
            if (in_predicate(property)) {
                gatheredProperties[path] = property;
            }
        });

        return gatheredProperties;
    };

}
