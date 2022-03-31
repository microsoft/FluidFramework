/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper function to check whether a changeset is empty
 */

 import isEmpty from "lodash/isEmpty";
 import has from "lodash/has";
 import isObject from "lodash/isObject";

 import { SerializedChangeSet } from "../changeset";

/**
 * Helper function which checks whether a given serialized changeSet is an empty changeSet.
 *
 * @param in_changeSet - The changeset to test
 * @returns True if it is an empty changeset.
 */
export const isEmptyChangeSet = (in_changeSet: SerializedChangeSet): boolean => in_changeSet === undefined ||
        (isObject(in_changeSet) &&
            (isEmpty(in_changeSet) || (Object.keys(in_changeSet).length === 1 && has(in_changeSet, "typeid"))));
