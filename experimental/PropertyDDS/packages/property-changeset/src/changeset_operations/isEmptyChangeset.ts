/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Helper function to check whether a changeset is empty
 */
import _ from "lodash"
import { SerializedChangeSet } from "../changeset";

/**
 * Helper function which checks whether a given serialized changeSet is an empty changeSet.
 *
 * @param in_changeSet - The changeset to test
 * @returns True if it is an empty changeset.
 */
export const isEmptyChangeSet = (in_changeSet: SerializedChangeSet): boolean => in_changeSet === undefined ||
        (_.isObject(in_changeSet) &&
            (_.isEmpty(in_changeSet) || (_.size(in_changeSet) === 1 && _.has(in_changeSet, "typeid"))));

