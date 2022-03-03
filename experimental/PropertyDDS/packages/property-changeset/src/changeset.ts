/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Serialized representation of the changes in a repository
 */

import isObject from "lodash/isObject";
import isString from "lodash/isString";
import {copy as cloneDeep} from "fastest-json-copy";
import isEmpty from "lodash/isEmpty";
import extend from "lodash/extend";
import each from "lodash/each";

//@ts-ignore
import { ConsoleUtils, joinPaths, constants } from "@fluid-experimental/property-common";

import { TypeIdHelper } from "./helpers/typeidHelper";
import { ChangeSetArrayFunctions } from './changeset_operations/array';

import { ArrayChangeSetIterator } from "./changeset_operations/arrayChangesetIterator";
import { ConflictType } from './changeset_operations/changesetConflictTypes'
// Add the indexed collection functions into the prototype of the ChangeSet
import { ChangeSetIndexedCollectionFunctions } from "./changeset_operations/indexedCollection";
import { isEmptyChangeSet } from "./changeset_operations/isEmptyChangeset";
import { isReservedKeyword } from "./isReservedKeyword";
import { Utils } from "./utils";
import { TemplateValidator } from "./templateValidator";
import { ArrayIteratorOperationTypes } from "./changeset_operations/operationTypes"

const { PROPERTY_PATH_DELIMITER, MSG } = constants;

const { extractContext, isPrimitiveType } = TypeIdHelper;


export interface ApplyChangeSetOptions {
    /**
     * Additional meta information which help later to obtain more compact changeset during the apply operation.
     */
    applyAfterMetaInformation?: Map<any, any>,

    /**
     * Throw error for template definition mismatches.
     */
    throwOnTemplateMismatch?: boolean
}


export interface RebaseChangeSetOptions extends ApplyChangeSetOptions {
    rebaseMetaInformation?: object
}

/**
 * The plain serialization data structure used to encode a ChangeSet.
 */
export type SerializedChangeSet = any; //@TODO Maybe we should add full type for the ChangeSet
export type ChangeSetType = any;
export interface ConflictInfo {
    /**
     * Path to the position where the conflict occurred. If the conflicting change is of type
     * MISMATCH_TEMPLATES then the path will be undefined.
     */
    path?: string | undefined;
    /**
     * Type of the conflict
     */
    type: ConflictType;
    conflictingChange?: SerializedChangeSet;
}

/**
 * The ChangeSet represents an operation to be done (or that was done) on the data. It encapsulate one or
 * many addition/insertion and deletion of properties. The ChangeSetObject also provides functionality
 * to merge and swap change sets.
 */
export class ChangeSet {
    static ConflictType = ConflictType;
    static isEmptyChangeSet = isEmptyChangeSet;
    static isReservedKeyword = isReservedKeyword;

    declare public _cleanIndexedCollectionChangeSet: typeof ChangeSetIndexedCollectionFunctions._cleanIndexedCollectionChangeSet;
    declare public _performApplyAfterOnPropertyArray: typeof ChangeSetArrayFunctions._performApplyAfterOnPropertyArray;
    declare public _rebaseArrayChangeSetForProperty: typeof ChangeSetArrayFunctions._rebaseArrayChangeSetForProperty;
    declare public _rebaseChangeSetForString: typeof ChangeSetArrayFunctions._rebaseChangeSetForString;
    declare public _performApplyAfterOnPropertyIndexedCollection: typeof ChangeSetIndexedCollectionFunctions._performApplyAfterOnPropertyIndexedCollection;
    declare public _rebaseIndexedCollectionChangeSetForProperty: typeof ChangeSetIndexedCollectionFunctions._rebaseIndexedCollectionChangeSetForProperty;


    _changes: SerializedChangeSet;
    _isNormalized: boolean;

    /**
     * @param [in_changes] - The serialized changes to store in this change set if a string is supplied,
     * we assume it to be a serialized JSON representation of the change set. If none is supplied, an empty changeset will be created.
     */
    constructor(in_changes?: ChangeSetType) {
        if (in_changes === undefined || in_changes === null) {
            this._changes = {};
        } else if (isString(in_changes)) { // Stringified Serialized JSON
            this._changes = JSON.parse(in_changes);
        } else if (in_changes instanceof ChangeSet) {
            this._changes = cloneDeep(in_changes._changes);
        } else {
            // Serialized Changeset
            this._changes = in_changes;
        }

        this._isNormalized = false;
    }


    /**
     * Creates a string representation of the change set
     * @returns JSON encoding of the changes in this change set
     */
    toString(): string {
        return JSON.stringify(this._changes);
    };


    /**
     * Returns the serialized changes.
     *
     * @returns The serialized changeset
     */
    getSerializedChangeSet(): SerializedChangeSet {
        return this._changes;
    };

    /**
     * Indicates whether this is a normalized ChangeSet. If this is set to true, squashes will not remove empty entries
     * from the ChangeSet.
     *
     * @param in_isNormalized - is this a normalized ChangeSet?
     */
    setIsNormalized(in_isNormalized: boolean) {
        this._isNormalized = in_isNormalized;
    };

    /**
     * Indicates whether this is a normalized ChangeSet. If this is set to true, squashes will not remove empty entries
     * from the ChangeSet.
     *
     * @returns Is this a normalized ChangeSet?
     */
    getIsNormalized(): boolean {
        return this._isNormalized;
    };

    /**
     * Clones the ChangeSet
     *
     * @returns The cloned ChangeSet
     */
    clone(): ChangeSet {
        return new ChangeSet(cloneDeep(this._changes));
    };


    /**
     * Updates this ChangeSet. The result will be the concatenation of the two ChangeSets. First the changes in this
     * ChangeSet are executed, then the changes in the supplied in_changeSet are applied. The result will be
     * stored in this ChangeSet. This function assumes that the second ChangeSet is relative to the state after
     * application of the first ChangeSet.
     *
     * @param in_changeSet - The changeset to apply
     * @param in_options - Optional additional parameters
     */
    applyChangeSet(in_changeSet: SerializedChangeSet, in_options?: ApplyChangeSetOptions) {
        let changes = in_changeSet;
        if (in_changeSet instanceof ChangeSet) {
            changes = in_changeSet.getSerializedChangeSet();
        }

        if (!isObject(this._changes) || Array.isArray(this._changes)) {
            const oldValue = isObject(changes) && (changes as SerializedChangeSet).value !== undefined ? (changes as SerializedChangeSet).value : changes;
            this._changes = Array.isArray(oldValue) ? oldValue.slice() : oldValue;
        } else {
            this._performApplyAfterOnProperty(this._changes, changes, !this._isNormalized, in_options);
        }
    };

    /**
     * Applies a changeset to a given property (recursively). The ChangeSet is assumed to be relative to the same
     * property root and it will be applied behind the base ChangeSet (assuming that the changes are relative to the
     * state after the base ChangeSet has been applied. It will change the base ChangeSet.)
     *
     * @param io_basePropertyChanges    - The ChangeSet describing the initial state
     * @param in_appliedPropertyChanges - The ChangeSet to apply to this state
     * @param in_removeEmpty            - Should empty ChangeSets be removed?
     * @param in_options - Optional additional parameters
     */
    private _performApplyAfterOnProperty(
        io_basePropertyChanges: SerializedChangeSet,
        in_appliedPropertyChanges: SerializedChangeSet,
        in_removeEmpty: boolean,
        in_options?: ApplyChangeSetOptions) {
        // Apply dynamic property operations
        if (in_appliedPropertyChanges.insert ||
            in_appliedPropertyChanges.modify ||
            in_appliedPropertyChanges.remove) {
            this._performApplyAfterOnPropertyIndexedCollection(io_basePropertyChanges,
                in_appliedPropertyChanges,
                "NodeProperty",
                in_options); // TODO: recursively propagate the typeid?
        }

        if (!isEmpty(in_appliedPropertyChanges.insertTemplates)) {
            io_basePropertyChanges.insertTemplates = io_basePropertyChanges.insertTemplates || {};
            extend(io_basePropertyChanges.insertTemplates, in_appliedPropertyChanges.insertTemplates);
        }

        // Apply ChangeSet to the properties
        const modifiedTypeids = Object.keys(in_appliedPropertyChanges);
        for (let i = 0; i < modifiedTypeids.length; i++) {
            const typeid = modifiedTypeids[i];
            // The reserved keywords have already been handled above
            if (ChangeSet.isReservedKeyword(typeid)) {
                continue;
            }

            io_basePropertyChanges[typeid] = io_basePropertyChanges[typeid] || {};
            const baseChanges = io_basePropertyChanges[typeid];
            const changedKeys = Object.keys(in_appliedPropertyChanges[typeid]);
            for (let j = 0; j < changedKeys.length; j++) {
                this.performApplyAfterOnPropertyWithTypeid(changedKeys[j],
                    baseChanges,
                    in_appliedPropertyChanges[typeid],
                    typeid,
                    in_removeEmpty,
                    in_options);
            }
            // Remove the type when it no longer contains any changed keys
            if (in_removeEmpty && isEmpty(io_basePropertyChanges[typeid])) {
                delete io_basePropertyChanges[typeid];
            }
        }
    };

    /**
     * Helper function used to apply a new value to a given ChangeSet.
     * It is used to handle setting a primitive value, which might either be represented
     * via a literal or an object with a member value.
     * applies in_appliedValue to the io_baseChanges at the given in_baseKey
     * @param io_baseChanges - base changes (modified)
     * @param in_baseKey - key
     * @param in_appliedValue - applied changes to be applied
     */
    private _applyValue(io_baseChanges: SerializedChangeSet, in_baseKey: string, in_appliedValue: SerializedChangeSet) {
        const newValue = (in_appliedValue && in_appliedValue.hasOwnProperty("value")) ?
            in_appliedValue.value : in_appliedValue;
        if (io_baseChanges[in_baseKey] && io_baseChanges[in_baseKey].hasOwnProperty("value")) {
            io_baseChanges[in_baseKey].value = newValue;
        } else {
            if (io_baseChanges[in_baseKey] === undefined &&
                in_appliedValue && in_appliedValue.hasOwnProperty("oldValue")) {
                io_baseChanges[in_baseKey] = {
                    value: newValue,
                    oldValue: in_appliedValue.oldValue,
                };
            } else {
                io_baseChanges[in_baseKey] = newValue;
            }
        }
    };

    /**
     * Decides based on the given Typeid which applyAfter operation to perform.
     * Note: This function is not directly called on the ChangeSet but on the object containing it together with a key
     *       since it needs to be able to overwrite this entry
     *
     * @param in_changedKey             - The key of the entry in the object
     * @param in_baseChanges            - The object containing the state before the applyAfter
     * @param in_appliedPropertyChanges - The object containing the ChangeSet with the modification
     * @param in_typeid                 - The typeid of the property to modify
     * @param in_removeEmpty            - Should empty ChangeSets be removed?
     * @param in_options - Optional additional parameters
     */
    public performApplyAfterOnPropertyWithTypeid(
        in_changedKey: string,
        in_baseChanges: SerializedChangeSet,
        in_appliedPropertyChanges: { [x: string]: any; },
        in_typeid: string,
        in_removeEmpty: boolean,
        in_options?: ApplyChangeSetOptions) {
        const splitTypeid = extractContext(in_typeid);

        if (splitTypeid.context === "set" ||
            splitTypeid.context === "map") {
            in_baseChanges[in_changedKey] = in_baseChanges[in_changedKey] || {};
            this._performApplyAfterOnPropertyIndexedCollection(in_baseChanges[in_changedKey],
                in_appliedPropertyChanges[in_changedKey],
                splitTypeid.typeid,
                in_options);

            // Remove the key, when it no longer contains a changeset
            if (in_removeEmpty && isEmpty(in_baseChanges[in_changedKey])) {
                delete in_baseChanges[in_changedKey];
            }
        } else if (splitTypeid.context === "array" || splitTypeid.typeid === "String") {
            in_baseChanges[in_changedKey] = in_baseChanges[in_changedKey] !== undefined ? in_baseChanges[in_changedKey] : {};
            let baseIsSetChange = false;
            let oldValue;
            if (splitTypeid.typeid === "String" &&
                (isString(in_baseChanges[in_changedKey]) ||
                    (in_baseChanges[in_changedKey] && in_baseChanges[in_changedKey].hasOwnProperty("value")))) {
                oldValue = in_baseChanges[in_changedKey].oldValue;
                // we need to convert the format to allow the application of the changes
                // since _performApplyAfterOnPropertyArray only understands insert/modify/remove commands
                if (in_baseChanges[in_changedKey] && in_baseChanges[in_changedKey].hasOwnProperty("value")) {
                    in_baseChanges[in_changedKey] = {
                        insert: [
                            [0, in_baseChanges[in_changedKey].value],
                        ],
                    };
                } else {
                    in_baseChanges[in_changedKey] = {
                        insert: [
                            [0, in_baseChanges[in_changedKey]],
                        ],
                    };
                }
                baseIsSetChange = true;
            }
            let appliedChanges = in_appliedPropertyChanges[in_changedKey];
            if (isObject(appliedChanges) && appliedChanges.hasOwnProperty("value")) {
                appliedChanges = (appliedChanges as SerializedChangeSet).value;
            }

            if (splitTypeid.typeid === "String" && isString(appliedChanges)) {
                // we've got a 'set' command and just overwrite the changes
                if (baseIsSetChange && oldValue !== undefined) {
                    in_baseChanges[in_changedKey] = {
                        value: appliedChanges,
                        oldValue,
                    };
                } else {
                    in_baseChanges[in_changedKey] = appliedChanges;
                }
            } else {
                // we have incremental changes (or a standard array)
                this._performApplyAfterOnPropertyArray(in_baseChanges[in_changedKey],
                    in_appliedPropertyChanges[in_changedKey],
                    splitTypeid.typeid,
                    in_options);
                if (baseIsSetChange) {
                    // we have to convert back to a string, if it had been converted before
                    let newValue;
                    if (isEmpty(in_baseChanges[in_changedKey])) {
                        newValue = "";
                    } else {
                        newValue = in_baseChanges[in_changedKey].insert[0][1];
                    }
                    if (oldValue !== undefined) {
                        in_baseChanges[in_changedKey] = {
                            value: newValue,
                            oldValue,
                        };
                    } else {
                        in_baseChanges[in_changedKey] = newValue;
                    }
                }
            }

            // Remove the key, when it no longer contains a changeset
            if (in_removeEmpty && ChangeSet.isEmptyChangeSet(in_baseChanges[in_changedKey])) {
                delete in_baseChanges[in_changedKey];
            }
        } else if (splitTypeid.isEnum) {
            // Enum types can simply be overwritten
            this._applyValue(in_baseChanges, in_changedKey, in_appliedPropertyChanges[in_changedKey]);
        } else if (splitTypeid.context === "single") {
            if (isPrimitiveType(splitTypeid.typeid)) {
                // Primitive types can simply be overwritten, however we have an exception for
                // 64 bit integers (until javascript natively supports them)
                if (splitTypeid.typeid === "Int64" || splitTypeid.typeid === "Uint64") {
                    let appliedVal = in_appliedPropertyChanges[in_changedKey];
                    if (appliedVal && appliedVal.hasOwnProperty("value")) {
                        appliedVal = appliedVal.value;
                    }
                    this._applyValue(in_baseChanges, in_changedKey, appliedVal.slice());
                } else {
                    this._applyValue(in_baseChanges, in_changedKey, in_appliedPropertyChanges[in_changedKey]);
                }
            } else {
                if (in_baseChanges[in_changedKey]) {
                    // Otherwise we have to continue the merging recursively
                    this._performApplyAfterOnProperty(in_baseChanges[in_changedKey],
                        in_appliedPropertyChanges[in_changedKey],
                        false,
                        in_options);
                } else {
                    // If the key doesn't exist, yet, we can just copy it
                    in_baseChanges[in_changedKey] = cloneDeep(in_appliedPropertyChanges[in_changedKey]);
                }
            }
        } else {
            throw new Error(MSG.UNKNOWN_CONTEXT + splitTypeid.context);
        }
    };

    /**
     * Rebases a given ChangeSet behind the current ChangeSet.
     *
     * This function takes a ChangeSet which is assumed to be relative to the same base state as the ChangeSet stored in
     * this class and transforms it in such a way that it can be applied after this ChangeSet. The function will modify
     * the supplied ChangeSet
     *
     * @param io_changeSet   -
     *     The ChangeSet that is rebased behind the state obtained by application of this ChangeSet
     * @param out_conflicts A list of paths that resulted in conflicts together with the type of the conflict
     * @param in_options - Optional additional parameters
     * @returns The rebased ChangeSet (the same object as io_changeSet, it will be
     *     modified in place)
     */
    public _rebaseChangeSet(io_changeSet: SerializedChangeSet, out_conflicts: ConflictInfo[],
        in_options?: RebaseChangeSetOptions): SerializedChangeSet {
        // We actually only pass this request to the recursive internal function
        return this._rebaseChangeSetForProperty(this._changes, io_changeSet, "", out_conflicts, in_options);
    };

    /**
     * Internal helper function that performs a rebase on a single property
     *
     * @param in_ownPropertyChangeSet -
     *     The ChangeSet for the property stored in this class
     * @param io_rebasePropertyChangeSet -
     *     The ChangeSet for the property to be rebased
     * @param in_basePath -
     *     Base path to get to the property processed by this function
     * @param out_conflicts -
     *     A list of paths that resulted in conflicts together with the type of the conflict
     * @param in_options - Optional additional parameters
     * @returns The rebased ChangeSet for this property
     */
    private _rebaseChangeSetForProperty(
        in_ownPropertyChangeSet: SerializedChangeSet,
        io_rebasePropertyChangeSet: SerializedChangeSet,
        in_basePath: string,
        out_conflicts: ConflictInfo[],
        in_options: ApplyChangeSetOptions): SerializedChangeSet {
        // Process the children in this ChangeSet
        if ((in_ownPropertyChangeSet.insert ||
            in_ownPropertyChangeSet.modify ||
            in_ownPropertyChangeSet.remove) &&
            (io_rebasePropertyChangeSet.insert ||
                io_rebasePropertyChangeSet.modify ||
                io_rebasePropertyChangeSet.remove)) {
            this._rebaseIndexedCollectionChangeSetForProperty(in_ownPropertyChangeSet,
                io_rebasePropertyChangeSet,
                in_basePath,
                "NodeProperty", // TODO: recursively propagate the typeid?
                false, // don't use square brackets (use dots instead)
                out_conflicts,
                in_options);
        }
        if (!isEmpty(io_rebasePropertyChangeSet.insertTemplates)) {
            const typeids = Object.keys(io_rebasePropertyChangeSet.insertTemplates);

            const templateMismatchChangeSet = { insertTemplates: {} };

            const templateMismatchConflict = {
                type: ChangeSet.ConflictType.MISMATCH_TEMPLATES,
                conflictingChange: templateMismatchChangeSet,
            };

            each(typeids, function(typeid) {
                const template = io_rebasePropertyChangeSet.insertTemplates[typeid];
                if (in_ownPropertyChangeSet.insertTemplates &&
                    in_ownPropertyChangeSet.insertTemplates[typeid]) {
                    const isEqual = TemplateValidator.Utils.psetDeepEquals(
                        template,
                        in_ownPropertyChangeSet.insertTemplates[template.typeid],
                    );

                    if (!isEqual) {
                        if (in_options && in_options.throwOnTemplateMismatch) {
                            throw new Error(MSG.TEMPLATE_MISMATCH + typeid);
                        }

                        templateMismatchChangeSet.insertTemplates[typeid] =
                            in_ownPropertyChangeSet.insertTemplates[template.typeid];
                        // TODO: Remove this warning message once we offer a conflict resolution API
                        console.warn(MSG.TEMPLATE_MISMATCH + typeid);
                    }

                    delete io_rebasePropertyChangeSet.insertTemplates[typeid];
                }
            });

            // Remove insertTemplates key if it is empty
            if (isEmpty(io_rebasePropertyChangeSet.insertTemplates)) {
                delete io_rebasePropertyChangeSet.insertTemplates;
            }

            if (!isEmpty(templateMismatchConflict.conflictingChange.insertTemplates)) {
                out_conflicts.push(templateMismatchConflict);
            }
        }

        // Check for collisions in the property assignments
        const changedTypeids = Object.keys(in_ownPropertyChangeSet);

        // We currently do not yet have any
        const changeSet = {};
        for (let i = 0; i < changedTypeids.length; i++) {
            const typeid = changedTypeids[i];
            const paths = Object.keys(in_ownPropertyChangeSet[typeid]);

            // Update the oldValue of primitive property of a changeset
            // for simple changeset with 'modify', property type, name, value
            // find the oldValue of the property and update it
            if (typeid === "modify" && "modify" in io_rebasePropertyChangeSet) {
                for (let j = 0; j < paths.length; j++) {
                    const tempTypeid = paths[i];
                    if ((isPrimitiveType(tempTypeid)) &&
                        tempTypeid in io_rebasePropertyChangeSet.modify) {
                        const tempPaths = Object.keys(in_ownPropertyChangeSet.modify[tempTypeid]);
                        for (let z = 0; z < tempPaths.length; z++) {
                            if (tempPaths[z] in io_rebasePropertyChangeSet.modify[tempTypeid]) {
                                let rebasedPropContent = io_rebasePropertyChangeSet.modify[tempTypeid][tempPaths[z]];
                                if (isObject(rebasedPropContent) && "oldValue" in rebasedPropContent) {
                                    (rebasedPropContent as SerializedChangeSet).oldValue = in_ownPropertyChangeSet.modify[tempTypeid][tempPaths[z]].value;
                                }
                            }
                        }
                    }
                }
            } else if (isPrimitiveType(typeid)) {
                // for complex changeset, the function will be called recursively, when the function is at the level where
                // io_rebasePropertyChangeSet && in_ownPropertyChangeSet contain only property type, name and value, we update
                // oldValue of io_rebasePropertyChangeSet.
                for (let j = 0; j < paths.length; j++) {
                    if (typeid in io_rebasePropertyChangeSet && paths[j] in io_rebasePropertyChangeSet[typeid]) {
                        let rebasedPropContent = io_rebasePropertyChangeSet[typeid][paths[j]];
                        if (isObject(rebasedPropContent) && "oldValue" in rebasedPropContent) {
                            // if oldValue already be update above, we don't need to update
                            if (io_rebasePropertyChangeSet[typeid][paths[j]].oldValue !==
                                in_ownPropertyChangeSet[typeid][paths[j]].value) {
                                io_rebasePropertyChangeSet[typeid][paths[j]].oldValue = in_ownPropertyChangeSet[typeid][paths[j]].value;
                            }
                        }
                    }
                }
            }

            // The reserved keywords have already been handled above and changes which are not present in
            // the other ChangeSet can be ignored
            if (ChangeSet.isReservedKeyword(typeid) ||
                !io_rebasePropertyChangeSet[typeid]) {
                continue;
            }

            // Check, whether we have a collision in a path update
            for (let j = 0; j < paths.length; j++) {
                if (io_rebasePropertyChangeSet[typeid][paths[j]] !== undefined) {
                    in_ownPropertyChangeSet[typeid] = in_ownPropertyChangeSet[typeid] || {};

                    const newPath = joinPaths(in_basePath,
                        paths[j],
                        PROPERTY_PATH_DELIMITER);
                    // Perform the rebase operation on the ChangeSet for this entry
                    const setConflict = this.rebaseChangeSetForPropertyEntryWithTypeid(paths[j],
                        in_ownPropertyChangeSet[typeid],
                        io_rebasePropertyChangeSet[typeid],
                        typeid,
                        newPath,
                        true,
                        out_conflicts,
                        in_options);

                    // If there has been a non-recursive set collision we handle it here separately
                    if (setConflict) {
                        // If we have two writes to primitive types, this is a conflict
                        changeSet[typeid] = changeSet[typeid] || {};

                        // Store the change. Note: We make a deep copy here, as this is a reference into our
                        // own internal ChangeSet and we want to be sure, nobody changes our internal data-structures
                        changeSet[typeid][paths[j]] = cloneDeep(in_ownPropertyChangeSet[typeid][paths[j]]);
                    }

                    // Remove the typeid, when it no longer contains any keys
                    if (isEmpty(io_rebasePropertyChangeSet[typeid])) {
                        delete io_rebasePropertyChangeSet[typeid];
                    }
                }
            }
        }

        // If there were conflicts in the set operations, report them
        if (!isEmpty(changeSet)) {
            const conflict = {
                path: in_basePath,
                type: ChangeSet.ConflictType.COLLIDING_SET,
                conflictingChange: changeSet,
            };
            out_conflicts.push(conflict);
        }

        return io_rebasePropertyChangeSet;
    };

    /**
     * Decides based on the given Typeid which rebase operation to perform
     * Note: This function is not directly called on the ChangeSet but on the object containing it together with a key
     *       since it needs to be able to overwrite this entry
     *
     * @param in_key                          - The key of the entry in the object
     * @param in_ownPropertyChangeSet         - The object containing the ChangeSet for the property
     *                                                   stored in this class
     * @param io_rebasePropertyChangeSet      - The object containing the ChangeSet for the property to
     *                                                   be rebased
     * @param in_typeid                       - The typeid of the property to rebase
     * @param in_basePath                     - Base path to get to the property processed by this function
     * @param in_removeEmpty                 - Should empty ChangeSets be removed?
     * @param out_conflicts - A list of paths that resulted in
     *                                                   conflicts together with the type of the conflict
     *
     * @returns Has there been a simple set collision? Those have to be handled separately
     *                   TODO: We should unify the handling of set collisions
     * @private
     */
    private rebaseChangeSetForPropertyEntryWithTypeid(
        in_key: string,
        in_ownPropertyChangeSet: SerializedChangeSet,
        io_rebasePropertyChangeSet: SerializedChangeSet,
        in_typeid: string,
        in_basePath: string,
        in_removeEmpty: boolean,
        out_conflicts: any,
        in_options: ApplyChangeSetOptions): boolean {
        const splitTypeid = extractContext(in_typeid);

        if (splitTypeid.context === "set" ||
            splitTypeid.context === "map") {
            this._rebaseIndexedCollectionChangeSetForProperty(in_ownPropertyChangeSet[in_key],
                io_rebasePropertyChangeSet[in_key],
                in_basePath,
                splitTypeid.typeid,
                true, // use square brackets
                out_conflicts,
                in_options);

            // Remove the key, when it no longer contains a changeset
            if (in_removeEmpty && isEmpty(io_rebasePropertyChangeSet[in_key])) {
                delete io_rebasePropertyChangeSet[in_key];
            }
        } else if (splitTypeid.context === "array") {
            this._rebaseArrayChangeSetForProperty(in_ownPropertyChangeSet[in_key],
                io_rebasePropertyChangeSet[in_key],
                in_basePath,
                out_conflicts,
                splitTypeid.typeid,
                in_options);
            // Remove the key, when it no longer contains a changeset
            if (in_removeEmpty && isEmpty(io_rebasePropertyChangeSet[in_key])) {
                delete io_rebasePropertyChangeSet[in_key];
            }
        } else if (splitTypeid.typeid === "String") {
            this._rebaseChangeSetForString(in_ownPropertyChangeSet[in_key],
                io_rebasePropertyChangeSet, in_key,
                in_basePath,
                out_conflicts,
                in_options);
            // Remove the key, when it no longer contains a changeset
            if (in_removeEmpty && isEmpty(io_rebasePropertyChangeSet[in_key])) {
                delete io_rebasePropertyChangeSet[in_key];
            }
        } else if (splitTypeid.context === "single") {
            // We only can have a conflict when the path exists in both ChangeSets
            if (in_ownPropertyChangeSet[in_key] !== undefined) {
                if (isPrimitiveType(splitTypeid.typeid) || splitTypeid.isEnum) {
                    return true;
                } else {
                    // Otherwise, we have to continue recursively

                    // Make sure the paths exist
                    in_ownPropertyChangeSet[in_key] = in_ownPropertyChangeSet[in_key] || {};

                    // And then perform the recursive rebase
                    this._rebaseChangeSetForProperty(in_ownPropertyChangeSet[in_key],
                        io_rebasePropertyChangeSet[in_key],
                        in_basePath,
                        out_conflicts,
                        in_options);
                }
            }
        } else {
            throw new Error(MSG.UNKNOWN_CONTEXT + splitTypeid.context);
        }

        return false;
    };

    /**
     * recursive helper function for ChangeSet.prototype._toReversibleChangeSet
     * which converts a irreversible changeset to a reversible changeset
     * or updates the former state of a reversible changeset
     * @param in_context the traversal context
     */
    private _recursivelyBuildReversibleChangeSet(in_context: Utils.TraversalContext) {
        const opType = in_context.getOperationType();
        if (opType === "modify") {
            const type = in_context.getTypeid();
            const splitType = in_context.getSplitTypeID();
            let nestedChangeset = in_context.getNestedChangeSet();

            let current = in_context.getUserData().parallelState;
            if (in_context.getPropertyContainerType() === "root") {
                current = in_context.getUserData().oldState;
            } else if (current) {
                if (in_context.getPropertyContainerType() !== "template") {
                    current = current.insert;
                }

                if (in_context.getPropertyContainerType() !== "array") {
                    current = current && current[in_context.getTypeid()];
                    current = current && current[in_context.getLastSegment()];
                } else {
                    current = current && current[0][1][in_context.getLastSegment()];
                }
            }

            in_context.setUserData({
                parallelState: current,
                oldState: in_context.getUserData().oldState,
            });

            if (isPrimitiveType(type)) {
                if (current === undefined) {
                    throw new Error(`${MSG.INVALID_PATH + in_context.getFullPath()}. Making primitive value reversible.`);
                }
                let oldValue = current;

                // store it in reversibleChangeSet
                if (type === "String" && !isString(nestedChangeset)) {
                    // String is a special case
                    let oldString;
                    if (isString(oldValue)) {
                        oldString = oldValue;
                    }
                    if (nestedChangeset.modify) {
                        for (let i = 0; i < nestedChangeset.modify.length; i++) {
                            let entry = nestedChangeset.modify[i];
                            let entryOffset = entry[0];
                            const entryLength = entry[1].length;
                            entry[2] = oldString.slice(entryOffset, entryOffset + entryLength);
                        }
                    }
                    if (nestedChangeset.remove) {
                        for (let i = 0; i < nestedChangeset.remove.length; i++) {
                            let entry = nestedChangeset.remove[i];
                            let entryOffset = entry[0];

                            let removeRangeLength = entry[1];
                            if (isString(removeRangeLength)) {
                                removeRangeLength = entry[1].length;
                            }
                            entry[1] = oldString.slice(entryOffset, entryOffset + removeRangeLength);
                        }
                    }
                } else {
                    if (nestedChangeset && nestedChangeset.hasOwnProperty("value")) {
                        nestedChangeset.oldValue = oldValue;
                    } else {
                        const newChangeSet = {
                            value: nestedChangeset,
                            oldValue,
                        };
                        in_context.replaceNestedChangeSet(newChangeSet);
                    }
                }
            } else if (splitType.context === "array") {
                if (current === undefined) {
                    throw new Error(`${MSG.INVALID_PATH + in_context.getFullPath()}. Making array value reversible.`);
                }
                let oldValue = current.insert ? current.insert[0][1] : [];

                let nestedChangeset = in_context.getNestedChangeSet();
                if (nestedChangeset.modify) {
                    if (isPrimitiveType(splitType.typeid)) {
                        for (let i = 0; i < nestedChangeset.modify.length; i++) {
                            let entry = nestedChangeset.modify[i];
                            let entryOffset = entry[0];
                            let oldEntries = [];
                            for (let j = 0; j < entry[1].length; j++) {
                                oldEntries.push(cloneDeep(oldValue[entryOffset + j]));
                            }
                            entry[2] = oldEntries;
                        }
                    }
                }
                if (nestedChangeset.remove) {
                    for (let i = 0; i < nestedChangeset.remove.length; i++) {
                        let entry = nestedChangeset.remove[i];
                        let entryOffset = entry[0];
                        let oldEntries = [];

                        let removeRangeLength = entry[1];
                        if (Array.isArray(removeRangeLength)) {
                            removeRangeLength = entry[1].length;
                        }

                        for (let j = 0; j < removeRangeLength; j++) {
                            oldEntries.push(cloneDeep(oldValue[entryOffset + j]));
                        }
                        entry[1] = oldEntries;
                    }
                }
            } else if (splitType.context === "map" ||
                // node property test: (we have to do the test this way, because of inheritance)
                (nestedChangeset.insert ||
                    nestedChangeset.modify ||
                    nestedChangeset.remove)) {
                // This prevents an error, if the changeset only contains an insert operation. In that case
                // we don't actually need the corresponding old state and thus do not need to throw an error
                // This type of situation can occur in the materialized history, if an insert happens right at a chunk boundary.
                if (Object.keys(nestedChangeset).length === 1 &&
                    nestedChangeset.insert) {
                    in_context._traversalStopped = true;
                    return;
                }
                if (current === undefined) {
                    throw new Error(`${MSG.INVALID_PATH + in_context.getFullPath()}. Making map value reversible.`);
                }
                let oldValue = current.insert;

                if (isPrimitiveType(splitType.typeid)) {
                    if (nestedChangeset.modify) {
                        const modifiedKeys = Object.keys(nestedChangeset.modify);
                        for (let i = 0; i < modifiedKeys.length; i++) {
                            let entry = nestedChangeset.modify[modifiedKeys[i]];
                            if (typeof entry === "object" && entry.hasOwnProperty("value")) {
                                entry = entry.value;
                            }
                            nestedChangeset.modify[modifiedKeys[i]] = {
                                value: entry,
                                oldValue: cloneDeep(oldValue[modifiedKeys[i]]),
                            };
                        }
                    }
                    let newRemove = {};
                    if (nestedChangeset.remove) {
                        let removedKeys = nestedChangeset.remove;
                        if (!Array.isArray(removedKeys)) {
                            removedKeys = Object.keys(removedKeys);
                        }
                        for (let i = 0; i < removedKeys.length; i++) {
                            newRemove[removedKeys[i]] = cloneDeep(oldValue[removedKeys[i]]);
                        }
                        nestedChangeset.remove = newRemove;
                    }
                } else {
                    let nestedChangeset = in_context.getNestedChangeSet();
                    if (nestedChangeset.modify) {
                        // this case is handeled recursively
                    }
                    let newRemove = {};
                    if (nestedChangeset.remove) {
                        if (Array.isArray(nestedChangeset.remove)) {
                            let removedKeys = nestedChangeset.remove;
                            for (let i = 0; i < removedKeys.length; i++) {
                                let searchedKey = removedKeys[i];
                                // search for this key in the old keys:
                                const oldTypeKeys = Object.keys(oldValue);
                                for (let k = 0; k < oldTypeKeys.length; k++) {
                                    if (oldValue[oldTypeKeys[k]].hasOwnProperty(searchedKey)) {
                                        let entry = oldValue[oldTypeKeys[k]][searchedKey];
                                        if (!newRemove[oldTypeKeys[k]]) {
                                            newRemove[oldTypeKeys[k]] = {};
                                        }
                                        newRemove[oldTypeKeys[k]][removedKeys[i]] = cloneDeep(entry);
                                    }
                                }
                            }
                            nestedChangeset.remove = newRemove;
                        } else {
                            // we already have a reversibleChangeSet and need to update the oldValues
                            const removedTypes = Object.keys(nestedChangeset.remove);
                            for (let t = 0; t < removedTypes.length; t++) {
                                let removedKeys = Object.keys(nestedChangeset.remove[removedTypes[t]]);
                                for (let i = 0; i < removedKeys.length; i++) {
                                    let searchedKey = removedKeys[i];
                                    let entry = oldValue[removedTypes[t]][searchedKey];
                                    nestedChangeset.remove[removedTypes[t]][removedKeys[i]] = entry;
                                }
                            }
                        }
                    }
                }
            }
        }
    };

    /**
     * Converts an irreversible changeset to a reversible changeset
     * or updates the former state of a reversible changeset
     * WARNING: This function is still experimental and needs more testing
     * and it's set to private for now. It will be converted to a public API function
     * in a later release.
     * @param in_oldSerializedState the old state
     */
    public _toReversibleChangeSet(in_oldSerializedState: SerializedChangeSet) {
        ConsoleUtils.assert(in_oldSerializedState !== undefined,
            `${MSG.ASSERTION_FAILED}Missing function parameter "in_oldSerializedState" of "_toReversibleChangeSet".`);

        if (!isObject(in_oldSerializedState) || Array.isArray(in_oldSerializedState)) {
            if (!isObject(this._changes) || Array.isArray(this._changes)) {
                this._changes = {
                    oldValue: Array.isArray(in_oldSerializedState) ? in_oldSerializedState.slice() : in_oldSerializedState,
                    value: this._changes,
                };
            } else {
                (this._changes as SerializedChangeSet).oldValue = Array.isArray(in_oldSerializedState) ? in_oldSerializedState.slice() :
                    in_oldSerializedState;
            }
        } else {
            const workspace = { oldState: in_oldSerializedState };
            Utils.traverseChangeSetRecursively(this._changes, {
                preCallback: this._recursivelyBuildReversibleChangeSet,
                userData: workspace,
            });
        }
    };

    /**
     * Converts a reversible changeset to an irreversible changeset
     * WARNING: This function is still experimental and needs more testing
     * and it's set to private for now. It will be converted to a public API function
     * in a later release.
     * @param in_withoutRoot - Bypass a fix where the root of a changeset is cleaned
     */
    public _stripReversibleChangeSet(in_withoutRoot: boolean) {
        const callback = function(in_context) {
            const opType = in_context.getOperationType();
            if (opType === "remove" || opType === "modify") {
                const type = in_context.getTypeid();
                if (!type) {
                    return;
                }
                const splitType = in_context.getSplitTypeID();

                if (isPrimitiveType(type)) {
                    // remove old state
                    let nestedChangeset = in_context.getNestedChangeSet();
                    if (type === "String" && !isString(nestedChangeset)) {
                        // String is a special case

                        if (nestedChangeset.modify) {
                            for (let i = 0; i < nestedChangeset.modify.length; i++) {
                                let entry = nestedChangeset.modify[i];
                                entry.splice(2, 1);
                            }
                        }
                        if (nestedChangeset.remove) {
                            for (let i = 0; i < nestedChangeset.remove.length; i++) {
                                let entry = nestedChangeset.remove[i];

                                let removeRangeLength = entry[1];
                                if (isString(removeRangeLength)) {
                                    removeRangeLength = entry[1].length;
                                }
                                entry[1] = removeRangeLength;
                            }
                        }
                        if (nestedChangeset && nestedChangeset.hasOwnProperty("value")) {
                            in_context.replaceNestedChangeSet(nestedChangeset.value);
                        }
                    } else if (nestedChangeset && nestedChangeset.hasOwnProperty("value")) {
                        in_context.replaceNestedChangeSet(nestedChangeset.value);
                    }
                } else if (splitType.context === "array") {
                    let nestedChangeset = in_context.getNestedChangeSet();
                    if (nestedChangeset.modify) {
                        for (let i = 0; i < nestedChangeset.modify.length; i++) {
                            let entry = nestedChangeset.modify[i];
                            entry.splice(2, 1);
                        }
                    }
                    if (nestedChangeset.remove) {
                        for (let i = 0; i < nestedChangeset.remove.length; i++) {
                            let entry = nestedChangeset.remove[i];
                            let removeRangeLength = entry[1];
                            if (Array.isArray(removeRangeLength)) {
                                removeRangeLength = entry[1].length;
                            }
                            entry[1] = removeRangeLength;
                        }
                    }
                    // TODO: Remove in_withoutRoot when it will not be used anymore
                } else if (splitType.context === "map" ||
                    (!in_withoutRoot && splitType.context === "single")) { // For NodeProperty / inserts at the root
                    let nestedChangeset = in_context.getNestedChangeSet();
                    if (isPrimitiveType(splitType.typeid)) {
                        if (nestedChangeset.modify) {
                            const modifiedKeys = Object.keys(nestedChangeset.modify);
                            for (let i = 0; i < modifiedKeys.length; i++) {
                                let entry = nestedChangeset.modify[modifiedKeys[i]];
                                if (typeof entry === "object" && entry.hasOwnProperty("value")) {
                                    entry = entry.value;
                                }
                                nestedChangeset.modify[modifiedKeys[i]] = entry;
                            }
                        }
                        if (nestedChangeset.remove) {
                            let removedKeys = nestedChangeset.remove;
                            if (!Array.isArray(removedKeys)) {
                                removedKeys = Object.keys(removedKeys);
                                nestedChangeset.remove = removedKeys;
                            }
                        }
                    } else {
                        let nestedChangeset = in_context.getNestedChangeSet();
                        if (nestedChangeset.modify) {
                            // this case is handeled recursively
                        }
                        if (nestedChangeset.remove) {
                            if (!Array.isArray(nestedChangeset.remove)) {
                                // we have a reversibleChangeSet and need to convert
                                let newRemove = [];
                                const removedTypes = Object.keys(nestedChangeset.remove);
                                for (let t = 0; t < removedTypes.length; t++) {
                                    let removedKeys = Object.keys(nestedChangeset.remove[removedTypes[t]]);
                                    for (let i = 0; i < removedKeys.length; i++) {
                                        newRemove.push(removedKeys[i]);
                                    }
                                }
                                nestedChangeset.remove = newRemove;
                            }
                        }
                    }
                }
            }
        };

        if (isObject(this._changes) &&
            (this._changes as SerializedChangeSet).oldValue !== undefined &&
            (this._changes as SerializedChangeSet).value !== undefined) {
            this._changes = (this._changes as SerializedChangeSet).value;
            return;
        }

        Utils.traverseChangeSetRecursively(this._changes, {
            preCallback: callback,
        });
    };

    /**
     * Helper function to extract the first level paths from a given change set
     * @param in_changeSet The ChangeSet to extract paths from
     * @param isPrimitiveCollection Is this a primitive type collection?
     *
     * @returns List of paths found at the first level of the change set
     */
    private _extractFirstLevelPaths(in_changeSet: SerializedChangeSet, isPrimitiveCollection: boolean): string[] {
        let paths;
        if (isPrimitiveCollection) {
            paths = Object.keys(in_changeSet);
        } else {
            paths = [];
            each(in_changeSet, function(nestedChangeSet) {
                each(nestedChangeSet, function(nestedChangeSet2, path) {
                    paths.push(path);
                });
            });
        }

        return paths;
    };

    /**
     * recursive helper function for ChangeSet.prototype._toInverseChangeSet
     * @param in_context the traversal context
     */
    private _recursivelyInvertReversibleChangeset(in_context: Utils.TraversalContext) {
        in_context.setUserData(in_context.getUserData() || {});

        // Figure out if we have already visited this path by verifying that the full path
        // is contained within the list of processed deleted or inserted paths
        const isWithinInsertOrDelete = in_context.getUserData()[in_context.getFullPath()];

        if (isWithinInsertOrDelete && in_context.getOperationType() !== "modify") {
            // We are within an insert or remove sub tree. Skip this iteration.
            in_context._traversalStopped = true;
            return;
        }

        if (in_context.getOperationType() === "remove" ||
            in_context.getOperationType() === "modify") {
            const type = in_context.getTypeid();
            const splitType = in_context.getSplitTypeID();

            if (!splitType) {
                ConsoleUtils.assert(false,
                    `${MSG.ASSERTION_FAILED}Missing "splitType" in "in_context":${JSON.stringify(in_context)}`);
            }

            const nestedChangeset = in_context.getNestedChangeSet();

            if ((isPrimitiveType(type) && type !== "String") ||
                (type === "String" && isString(nestedChangeset.oldValue))) {
                // check if we were called with an irreversible changeset
                if (in_context.getOperationType() === "modify" &&
                    (!isObject(nestedChangeset) || typeof (nestedChangeset as SerializedChangeSet).oldValue === "undefined")) {
                    throw new Error(MSG.OLD_VALUE_NOT_FOUND);
                }

                // switch oldValue and value
                let tmp = nestedChangeset.oldValue;
                nestedChangeset.oldValue = nestedChangeset.value;
                nestedChangeset.value = tmp;
            } else if ((type === "String" && !isString(nestedChangeset.oldValue)) || splitType.context === "array") {
                // String and Arrays need special treatment:
                const arrayIterator = new ArrayChangeSetIterator(nestedChangeset);
                const resultChangeset: SerializedChangeSet = {};
                if (nestedChangeset.modify) {
                    resultChangeset.modify = [];
                }
                if (nestedChangeset.insert) {
                    resultChangeset.remove = [];
                }
                if (nestedChangeset.remove) {
                    resultChangeset.insert = [];
                }
                // Successively invert the changes from the changeSet
                while (!arrayIterator.atEnd()) {
                    switch (arrayIterator.opDescription.type) {
                        case ArrayIteratorOperationTypes.INSERT:
                            // Handle inserts
                            resultChangeset.remove.push([
                                arrayIterator.opDescription.operation[0] + arrayIterator.opDescription.offset,
                                arrayIterator.opDescription.operation[1],
                            ]);
                            break;
                        case ArrayIteratorOperationTypes.REMOVE:
                            // Handle removes
                            resultChangeset.insert.push([
                                arrayIterator.opDescription.operation[0] + arrayIterator.opDescription.offset,
                                arrayIterator.opDescription.operation[1],
                            ]);
                            break;
                        case ArrayIteratorOperationTypes.MODIFY:
                            // Handle modifies
                            if (isPrimitiveType(splitType.typeid)) {
                                resultChangeset.modify.push([
                                    arrayIterator.opDescription.operation[0] + arrayIterator.opDescription.offset,
                                    arrayIterator.opDescription.operation[2],
                                    arrayIterator.opDescription.operation[1],
                                ]);
                            } else {
                                resultChangeset.modify.push([
                                    arrayIterator.opDescription.operation[0] + arrayIterator.opDescription.offset,
                                    arrayIterator.opDescription.operation[1],
                                ]);
                            }
                            break;
                        default:
                            console.error(`applyChangeset: ${MSG.UNKNOWN_OPERATION}${arrayIterator.opDescription.type}`);
                    }
                    arrayIterator.next();
                }
                in_context.replaceNestedChangeSet(resultChangeset);
            } else {
                // Covers NodeProperty, Map and Set
                if (nestedChangeset.modify) {
                    if (isPrimitiveType(splitType.typeid) && splitType.context === "map") {
                        const modifiedKeys = Object.keys(nestedChangeset.modify);
                        for (let i = 0; i < modifiedKeys.length; i++) {
                            const entry = nestedChangeset.modify[modifiedKeys[i]];
                            let tmp = entry.value;
                            entry.value = entry.oldValue;
                            entry.oldValue = tmp;
                        }
                    }
                }
                const oldInsert = nestedChangeset.insert;
                let replacedInsert = false;
                if (nestedChangeset.remove) {
                    nestedChangeset.insert = nestedChangeset.remove;
                    replacedInsert = true;
                    nestedChangeset.remove = undefined;
                    delete nestedChangeset.remove;
                    const isPrimitiveTypeid = isPrimitiveType(in_context.getSplitTypeID().typeid);
                    each(this._extractFirstLevelPaths(nestedChangeset.insert, isPrimitiveTypeid), function(path) {
                        const fullPath = joinPaths(in_context.getFullPath(), path, PROPERTY_PATH_DELIMITER);
                        in_context.getUserData()[fullPath] = true;
                    });
                }
                if (oldInsert) {
                    if (replacedInsert) {
                        nestedChangeset.remove = cloneDeep(oldInsert);
                    } else {
                        nestedChangeset.remove = oldInsert;
                        nestedChangeset.insert = undefined;
                        delete nestedChangeset.insert;
                    }
                    const isPrimitiveTypeid = isPrimitiveType(in_context.getSplitTypeID().typeid);
                    each(this._extractFirstLevelPaths(nestedChangeset.remove, isPrimitiveTypeid), function(path) {
                        const fullPath = joinPaths(in_context.getFullPath(), path, PROPERTY_PATH_DELIMITER);
                        in_context.getUserData()[fullPath] = true;
                    });
                }
            }
        }
    };

    /**
     * Inverts a reversible ChangeSets
     * WARNING: This function is still experimental and needs more testing
     * and it's set to private for now. It will be converted to a public API function
     * in a later release
     */
    public toInverseChangeSet() {
        if (this._changes.value !== undefined &&
            this._changes.oldValue !== undefined) {
            const tmp = this._changes.value;
            this._changes.value = this._changes.oldValue;
            this._changes.oldValue = tmp;
        } else {
            Utils.traverseChangeSetRecursively(this._changes, {
                preCallback: this._recursivelyInvertReversibleChangeset.bind(this),
            });
        }
    }
}


ChangeSet.prototype._performApplyAfterOnPropertyArray = ChangeSetArrayFunctions._performApplyAfterOnPropertyArray;
ChangeSet.prototype._rebaseArrayChangeSetForProperty = ChangeSetArrayFunctions._rebaseArrayChangeSetForProperty;
ChangeSet.prototype._rebaseChangeSetForString = ChangeSetArrayFunctions._rebaseChangeSetForString;

// Add the indexed collection functions into the prototype of the ChangeSet
ChangeSet.prototype._performApplyAfterOnPropertyIndexedCollection =
    ChangeSetIndexedCollectionFunctions._performApplyAfterOnPropertyIndexedCollection;
ChangeSet.prototype._cleanIndexedCollectionChangeSet =
    ChangeSetIndexedCollectionFunctions._cleanIndexedCollectionChangeSet;
ChangeSet.prototype._rebaseIndexedCollectionChangeSetForProperty =
    ChangeSetIndexedCollectionFunctions._rebaseIndexedCollectionChangeSetForProperty;
