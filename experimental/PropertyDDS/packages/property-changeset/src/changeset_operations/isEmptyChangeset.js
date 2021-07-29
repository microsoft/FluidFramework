/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper function to check whether a changeset is empty
 */
import { isObject, isEmpty, size, has } from "lodash";

/**
 * Helper function which checks whether a given serialized changeSet is an empty changeSet.
 *
 * @param {property-changeset.SerializedChangeSet} in_changeSet - The changeset to test
 * @return {boolean} True if it is an empty changeset.
 */
const isEmptyChangeSet = (in_changeSet) => in_changeSet === undefined ||
        (isObject(in_changeSet) &&
            (isEmpty(in_changeSet) || (size(in_changeSet) === 1 && has(in_changeSet, "typeid"))));

module.exports = isEmptyChangeSet;
