/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// @ts-ignore
import { ConsoleUtils, constants } from "@fluid-experimental/property-common";
import { eachOfSeries, eachSeries, ErrorCallback, series, timesSeries, whilst } from "async";

import { copy as cloneDeep } from "fastest-json-copy";
import isNumber from "lodash/isNumber";
import isString from "lodash/isString";
import isEmpty from "lodash/isEmpty";
import extend from "lodash/extend";
import each from "lodash/each";
import isEqual from "lodash/isEqual";
import find from "lodash/find";

import { SerializedChangeSet } from "./changeset";
import { ArrayChangeSetIterator } from "./changeset_operations/arrayChangesetIterator";
import { ExtractedContext, TypeIdHelper } from "./helpers/typeidHelper";
import { isReservedKeyword } from "./isReservedKeyword";
import { PathHelper, PathTree } from "./pathHelper";
import { ArrayIteratorOperationTypes } from "./changeset_operations/operationTypes";

const { PROPERTY_PATH_DELIMITER, MSG } = constants;

type NextFn = (err?: Error | null | undefined | string, result?: unknown) => void;

/**
 * Utils
 * @alias property-changeset.Utils
 * @class
*/
export namespace Utils {
    export type OperationType = "modify" | "insert" | "remove";
    export type PropertyContainerType = "array" | "map" | "set" | "root" | "NodeProperty" | "template";

    interface TraversalOptions {
        /**
         * The(pre-order) callback function that is invoked for each property
         */
        preCallback?: (context: TraversalContext) => any,
        /**
         * The (post-order) callback function that is invoked for each property
         */
        postCallback?: (context: TraversalContext) => any,
        /**
         * An optional object that is passed to all invocations of the callback via the
         */
        userData?: { [key: string]: any },
        /**
         *  The operation that has been applied to the root of the ChangeSet (either 'insert' or 'modify')
         */
        rootOperation?: OperationType,
        /**
         *  The full typeid for the Property at the root of the ChangeSet
         */
        rootTypeid?: string,
    }

    /**
        * Traverses a ChangeSet recursively and invokes the callback for each visited property.
        *
        * @param in_preCallback  - The (pre-order) callback function that is invoked for each property
        * @param in_postCallback - The (post-order) callback function that is invoked for each property
        * @param in_context -  The traversal context for the currently processed property
        * @param in_levelCallback - A callback for when a node is reached
        */
    function _traverseChangeSetRecursivelyAsync(
        in_preCallback: (
            context: TraversalContext,
            next: (err?: Error | null | undefined | string, result?: unknown) => void) => any,
        in_postCallback: (
            context: TraversalContext,
            next: (err?: Error | null | undefined | string, result?: unknown) => void) => any,
        in_context: TraversalContext,
        in_levelCallback: (param?: any) => any) {
        let pathSeparator;
        let currentPath;
        let currentPostPath;
        let nestedChangeSet;
        let postOrderContext;

        // Call the callback function for this ChangeSet
        in_context._traversalStopped = false;
        const typeid = in_context.getTypeid();
        let splitTypeId = typeid !== undefined ?
            TypeIdHelper.extractContext(typeid) :
            undefined;
        in_context.setSplitTypeID(splitTypeId!);

        let currentUserData;

        series([

            function(next: NextFn) {
                if (in_preCallback !== undefined) {
                    in_preCallback(in_context, next);
                } else {
                    next();
                }
            },

            function(next: NextFn) {
                pathSeparator = in_context.getFullPath() !== "" ? PROPERTY_PATH_DELIMITER : "";
                currentPath = in_context.getFullPath();
                currentPostPath = in_context.getFullPostPath();
                nestedChangeSet = in_context.getNestedChangeSet();

                const _typeid = in_context.getTypeid();
                // Call the callback function for this ChangeSet
                in_context._traversalStopped = false;
                splitTypeId = _typeid !== undefined ?
                    TypeIdHelper.extractContext(_typeid) :
                    undefined;
                in_context.setSplitTypeID(splitTypeId!);

                if (in_postCallback !== undefined) {
                    // TODO: this duplicates the context object putting stress on the GC.
                    postOrderContext = in_context.clone();
                }
                currentUserData = in_context.getUserData();
                if (!in_context.isTraversing() ||
                    in_context.getOperationType() === "remove" ||
                    TypeIdHelper.isPrimitiveType(in_context.getSplitTypeID().typeid) ||
                    in_context.getSplitTypeID().isEnum) {
                    if (in_postCallback !== undefined) {
                        in_postCallback(postOrderContext, function() {
                            next("break");
                        });
                    } else {
                        next("break");
                    }
                } else {
                    next();
                }
            },

            function(next: NextFn) {
                const currentTypeIdContext = in_context._splitTypeId.context;

                in_context._parentNestedChangeSet = nestedChangeSet;

                // Process an individual change recursively, by preparing the traversal context and invoking
                // _traverseChangeSetRecursively
                const processChange = function(in_segment: string | number,
                    in_subChangeSet: SerializedChangeSet,
                    in_nestedTypeid: string,
                    in_escape: boolean,
                    in_parentPropertyType: PropertyContainerType,
                    in_arrayOperationIndex: number,
                    in_arrayLocalIndex: number,
                    in_arrayOperationOffset: number,
                    in_arrayIteratorOffset: number,
                    in_callback: (param: any) => any) {
                    series([
                        function(n2) {
                            try {
                                // Update the path
                                in_context._lastSegment = in_segment;
                                const escapedSegment = in_escape && isString(in_segment) ? PathHelper.quotePathSegmentIfNeeded(in_segment) : in_segment;
                                let nextSegmentToPushInParentStack = in_context.getLastSegment();
                                // Note: we don't quote the path string here, since the paths
                                // in a ChangeSet are already quoted, if necessary
                                if (currentTypeIdContext === "map" ||
                                    currentTypeIdContext === "array" ||
                                    currentTypeIdContext === "set") {
                                    in_context._lastSegmentString = `[${escapedSegment}]`;
                                } else {
                                    in_context._lastSegmentString = pathSeparator + escapedSegment;
                                }
                                in_context._fullPath = currentPath + in_context.getLastSegmentString();

                                // Store the typeid and nested ChangeSet
                                in_context._typeid = in_nestedTypeid;
                                in_context._nestedChangeSet = in_subChangeSet;
                                in_context._propertyContainerType = in_parentPropertyType;
                                in_context._arrayOperationIndex = in_arrayOperationIndex;
                                in_context._arrayLocalIndex = in_arrayLocalIndex;
                                in_context._arrayOperationOffset = in_arrayOperationOffset;
                                in_context._arrayIteratorOffset = in_arrayIteratorOffset;
                                if (in_arrayIteratorOffset !== undefined && isNumber(in_segment)) {
                                    if (in_context._operationType === "remove") {
                                        nextSegmentToPushInParentStack =
                                            in_context.getLastSegment() as number + in_arrayIteratorOffset - in_arrayLocalIndex;
                                        in_context._fullPostPath =
                                            `${currentPostPath}[${in_segment +
                                            in_arrayIteratorOffset - in_arrayLocalIndex}]`;
                                    } else {
                                        nextSegmentToPushInParentStack = in_context.getLastSegment() as number + in_arrayIteratorOffset;
                                        in_context._fullPostPath = `${currentPostPath}[${in_segment + in_arrayIteratorOffset}]`;
                                    }
                                } else {
                                    nextSegmentToPushInParentStack = in_context._lastSegment;
                                    in_context._fullPostPath = currentPostPath + in_context._lastSegmentString;
                                }

                                // Continue traversal
                                in_context._stackDepth++;
                                in_context._typeStack.push(in_context.getTypeid());
                                in_context._parentStack.push(nextSegmentToPushInParentStack);
                                in_context._containerStack.push(in_context._propertyContainerType);
                                in_context._userStack.push({});
                                _traverseChangeSetRecursivelyAsync(in_preCallback, in_postCallback, in_context, n2);
                            } catch (ex) {
                                n2(ex);
                            }
                        },
                        function(n2) {
                            in_context._stackDepth--;
                            in_context._typeStack.pop();
                            in_context._parentStack.pop();
                            in_context._containerStack.pop();
                            in_context._userStack.pop();
                            in_context._userData = currentUserData;
                            in_context._parentNestedChangeSet = nestedChangeSet;
                            n2();
                        },
                    ], function(err) {
                        in_callback(err);
                    });
                };

                series([
                    function(n3) {
                        // If this property is a collection, we set the correct type, otherwise we assume it is a NodeProperty
                        const propertyContainerType = (splitTypeId.context === "map" ||
                            splitTypeId.context === "set" ||
                            splitTypeId.context === "array") ? splitTypeId.context : "NodeProperty";

                        let oldOperationType = in_context._operationType;
                        if (splitTypeId.context === "array") {
                            // Use the ArrayChangeSetIterator to process the changes in the ChangeSet in the correct order
                            const arrayIterator = new ArrayChangeSetIterator(nestedChangeSet);
                            let insertCounter = 0;
                            let removeCounter = 0;
                            let modifyCounter = 0;

                            whilst(
                                function(callback) {
                                    return callback(null, !arrayIterator.atEnd());
                                },
                                function(n4) {
                                    let operation;
                                    switch (arrayIterator.opDescription.type) {
                                        case ArrayIteratorOperationTypes.INSERT:
                                            in_context._operationType = "insert";
                                            operation = arrayIterator.opDescription.operation;
                                            eachOfSeries(operation[1] as any, function(item: any, i: number, n5) {
                                                // The typeid is stored inline for arrays
                                                const typeid = item.typeid;
                                                ConsoleUtils.assert(typeid, MSG.NON_PRIMITIVE_ARRAY_NO_TYPEID);
                                                processChange(
                                                    operation[0] + i,
                                                    item,
                                                    typeid,
                                                    false,
                                                    propertyContainerType,
                                                    insertCounter,
                                                    i,
                                                    operation[0],
                                                    arrayIterator.opDescription.offset,
                                                    n5,
                                                );
                                            }, function(res) {
                                                insertCounter++;
                                                arrayIterator.next();
                                                n4();
                                            });

                                            break;
                                        case ArrayIteratorOperationTypes.REMOVE:
                                            in_context._operationType = "remove";
                                            operation = arrayIterator.opDescription.operation;
                                            timesSeries(operation[1], function(i: number, n5) {
                                                // For removals, we don't have a typeid and we use the ChangeSet
                                                // of the removal operation as nested
                                                // ChangeSet -- TODO: doing this is maybe not really nice here
                                                processChange(
                                                    operation[0] + i,
                                                    nestedChangeSet.remove,
                                                    undefined,
                                                    false,
                                                    propertyContainerType,
                                                    removeCounter,
                                                    i,
                                                    operation[0],
                                                    arrayIterator.opDescription.offset,
                                                    n5,
                                                );
                                            }, function() {
                                                removeCounter++;
                                                arrayIterator.next();
                                                n4();
                                            });

                                            break;
                                        case ArrayIteratorOperationTypes.MODIFY:
                                            operation = arrayIterator.opDescription.operation;
                                            in_context._operationType = "modify";

                                            timesSeries(operation[1].length, function(i: number, n5) {
                                                // The typeid is stored inline for arrays
                                                const typeid = operation[1][i].typeid;
                                                ConsoleUtils.assert(typeid, MSG.NON_PRIMITIVE_ARRAY_NO_TYPEID);
                                                processChange(
                                                    operation[0] + i,
                                                    operation[1][i],
                                                    typeid,
                                                    false,
                                                    propertyContainerType,
                                                    modifyCounter,
                                                    i,
                                                    operation[0],
                                                    arrayIterator.opDescription.offset,
                                                    n5,
                                                );
                                            }, function() {
                                                modifyCounter++;
                                                arrayIterator.next();
                                                n4();
                                            });

                                            break;
                                        default:
                                            arrayIterator.next();
                                            n4(new Error(MSG.UNKNOWN_OPERATOR + arrayIterator.opDescription.type));
                                    }
                                },
                                function(err) {
                                    in_context._operationType = oldOperationType;
                                    n3(err);
                                },
                            );
                        } else {
                            // Process insertion of dynamic property, maps and sets
                            series([
                                function(n4) {
                                    if (nestedChangeSet.remove) {
                                        oldOperationType = in_context._operationType;
                                        in_context._operationType = "remove";
                                        let paths = nestedChangeSet.remove;
                                        if (Array.isArray(paths)) {
                                            timesSeries(paths.length, function(i, n5) {
                                                // For removals in irreversible CSs, we don't have a typeid and we use the ChangeSet of the
                                                // removal operation as nested ChangeSet
                                                processChange(
                                                    paths[i],
                                                    nestedChangeSet.remove,
                                                    undefined,
                                                    true,
                                                    propertyContainerType,
                                                    undefined,
                                                    undefined,
                                                    undefined,
                                                    undefined,
                                                    n5,
                                                );
                                            }, function(err) {
                                                in_context._operationType = oldOperationType;
                                                n4(err);
                                            });
                                        } else {
                                            // for removals in reversible changesets we have an object containing the types
                                            const typeids = Object.keys(nestedChangeSet.remove);
                                            timesSeries(typeids.length, function(i, n5) {
                                                const typeid = typeids[i];
                                                paths = Object.keys(nestedChangeSet.remove[typeid]);
                                                timesSeries(paths.length, function(j, n6) {
                                                    processChange(
                                                        paths[j],
                                                        nestedChangeSet.remove[typeid][paths[j]],
                                                        typeid,
                                                        true,
                                                        propertyContainerType,
                                                        undefined,
                                                        undefined,
                                                        undefined,
                                                        undefined,
                                                        n6,
                                                    );
                                                }, n5);
                                            }, function(err) {
                                                in_context._operationType = oldOperationType;
                                                n4(err);
                                            });
                                        }
                                    } else {
                                        n4();
                                    }
                                },
                                function(n4) {
                                    if (nestedChangeSet.insert) {
                                        // Once we have reached an insert operation all subsequent operations are inserts
                                        oldOperationType = in_context._operationType;
                                        in_context._operationType = "insert";
                                        // Maps and NodeProperties group the insertions by type
                                        const typeids = Object.keys(nestedChangeSet.insert);

                                        timesSeries(typeids.length, function(i, n5) {
                                            const typeid = typeids[i];
                                            const paths = Object.keys(nestedChangeSet.insert[typeid]);

                                            timesSeries(paths.length, function(j, n6) {
                                                processChange(
                                                    paths[j],
                                                    nestedChangeSet.insert[typeid][paths[j]],
                                                    typeid,
                                                    true,
                                                    propertyContainerType,
                                                    undefined,
                                                    undefined,
                                                    undefined,
                                                    undefined,
                                                    n6,
                                                );
                                            }, n5);
                                        },
                                            function(err) {
                                                in_context._operationType = oldOperationType;
                                                n4(err);
                                            });
                                    } else {
                                        n4();
                                    }
                                },
                                function(n4) {
                                    if (nestedChangeSet.modify) {
                                        // Maps and NodeProperties group modifications by type
                                        const typeids = Object.keys(nestedChangeSet.modify);
                                        timesSeries(typeids.length, function(i, n5) {
                                            const typeid = typeids[i];
                                            const paths = Object.keys(nestedChangeSet.modify[typeid]);

                                            timesSeries(paths.length, function(j, n6) {
                                                processChange(
                                                    paths[j],
                                                    nestedChangeSet.modify[typeid][paths[j]],
                                                    typeid,
                                                    true,
                                                    propertyContainerType,
                                                    undefined,
                                                    undefined,
                                                    undefined,
                                                    undefined,
                                                    n6,
                                                );
                                            }, n5);
                                        }, n4);
                                    } else {
                                        n4();
                                    }
                                },

                                function(n4) {
                                    // Process nested properties
                                    if (splitTypeId.context === "single") {
                                        const typeids = Object.keys(nestedChangeSet);

                                        timesSeries(typeids.length, function(i, n5) {
                                            const typeid = typeids[i];
                                            if (!isReservedKeyword(typeid)) {
                                                const paths = Object.keys(nestedChangeSet[typeid]);

                                                timesSeries(paths.length, function(j, n6) {
                                                    processChange(
                                                        paths[j],
                                                        nestedChangeSet[typeid][paths[j]],
                                                        typeid,
                                                        false,
                                                        "template",
                                                        undefined,
                                                        undefined,
                                                        undefined,
                                                        undefined,
                                                        n6,
                                                    );
                                                }, n5);
                                            } else {
                                                n5();
                                            }
                                        }, n4);
                                    } else {
                                        n4();
                                    }
                                },

                                function(n4) {
                                    if (in_postCallback) {
                                        in_postCallback(postOrderContext, n4);
                                    } else {
                                        n4();
                                    }
                                },
                            ], n3);
                        }
                    },
                ], next);
            },
        ], function(err) {
            if (err === "break") {
                in_levelCallback();
            } else {
                in_levelCallback(err);
            }
        });
    }

    /**
     * Copies a change set into an object that is meant to be a placeholder for the next
     * property in the tree.
     * @param in_objectToPopulate - Object to copy the change set into
     * @param in_context - change set traversal context
     * @param in_changeSet - Original change set to copy
     * @param in_isLeaf - Flag indicating that the entire sub tree should be copied over.
     * @returns ChangeSet that will be populated by the next iteration.
     * @throws if the container type is array, set or unknown (should never happen)
     */
    const _filterChangeSetBySegment = function(
        in_objectToPopulate: any,
        in_context: TraversalContext,
        in_changeSet: SerializedChangeSet,
        in_isLeaf: boolean = false): any {
        const nestedChangeSet = {};
        if (in_context.getPropertyContainerType() === "NodeProperty" ||
            in_context.getPropertyContainerType() === "map" ||
            in_context.getPropertyContainerType() === "set") {
            if (in_context.getOperationType() === "remove") {
                if (Array.isArray(in_context.getNestedChangeSet())) {
                    in_objectToPopulate.remove = in_objectToPopulate.remove || [];
                    in_objectToPopulate.remove.push(in_context.getLastSegment());
                } else {
                    // We are in a reversible changeset case
                    in_objectToPopulate.remove = in_objectToPopulate.remove || {};
                    in_objectToPopulate.remove[in_context.getTypeid()] =
                        in_objectToPopulate.remove[in_context.getTypeid()] || {};
                    in_objectToPopulate.remove[in_context.getTypeid()][in_context.getLastSegment()] =
                        cloneDeep(in_context.getNestedChangeSet());
                }
            } else {
                in_objectToPopulate[in_context.getOperationType()] = in_objectToPopulate[in_context.getOperationType()] || {};
                in_objectToPopulate[in_context.getOperationType()][in_context.getTypeid()] =
                    in_objectToPopulate[in_context.getOperationType()][in_context.getTypeid()] || {};

                if (TypeIdHelper.isPrimitiveType(in_context.getTypeid()) || in_isLeaf) {
                    in_objectToPopulate[in_context.getOperationType()][in_context.getTypeid()][in_context.getLastSegment()] =
                        cloneDeep(in_context.getNestedChangeSet());
                } else {
                    in_objectToPopulate[in_context.getOperationType()][in_context.getTypeid()][in_context.getLastSegment()] =
                        nestedChangeSet;
                }
            }
        } else if (in_context.getPropertyContainerType() === "template") {
            in_objectToPopulate[in_context.getTypeid()] = in_objectToPopulate[in_context.getTypeid()] || {};
            if (TypeIdHelper.isPrimitiveType(in_context.getTypeid()) || in_isLeaf) {
                in_objectToPopulate[in_context.getTypeid()][in_context.getLastSegment()] =
                    cloneDeep(in_context.getNestedChangeSet());
            } else {
                in_objectToPopulate[in_context.getTypeid()][in_context.getLastSegment()] =
                    nestedChangeSet;
            }
        } else {
            switch (in_context.getPropertyContainerType()) {
                case "array":
                    throw new Error(MSG.FILTER_PATH_WITHIN_ARRAY);
                default:
                    throw new Error(`Encountered an unknown parent container type ${in_context.getPropertyContainerType()}`,
                    );
            }
        }

        return nestedChangeSet;
    };

    /**
     * Traverses a ChangeSet recursively and invokes the callback for each visited property.
     *
     * @param in_preCallback  - The (pre-order) callback function that is invoked for each property
     * @param in_postCallback - The (post-order) callback function that is invoked for each property
     * @param in_context -  The traversal context for the currently processed property
     */
    const _traverseChangeSetRecursively = function(
        in_preCallback: (context: TraversalContext) => any | undefined,
        in_postCallback: (context: TraversalContext) => any | undefined,
        in_context: TraversalContext) {
        const pathSeparator = in_context.getFullPath() !== "" ? PROPERTY_PATH_DELIMITER : "";
        const currentPath = in_context.getFullPath();
        const currentPostPath = in_context.getFullPostPath();
        const nestedChangeSet = in_context.getNestedChangeSet();

        // Call the callback function for this ChangeSet
        in_context._traversalStopped = false;
        const splitTypeId = in_context.getTypeid() !== undefined ?
            TypeIdHelper.extractContext(in_context.getTypeid()) :
            undefined;
        in_context._splitTypeId = splitTypeId;

        // TODO: this duplicates the context object putting stress on the GC.
        let postOrderContext;
        if (in_preCallback !== undefined) {
            in_preCallback(in_context);
        }
        if (in_postCallback !== undefined) {
            postOrderContext = in_context.clone();
        }
        const currentUserData = in_context.getUserData();

        if (!in_context.isTraversing() ||
            in_context._operationType === "remove" ||
            TypeIdHelper.isPrimitiveType(in_context._splitTypeId.typeid) ||
            in_context.getSplitTypeID().isEnum) {
            if (in_postCallback !== undefined) {
                in_postCallback(postOrderContext);
            }
            return;
        }
        const currentTypeIdContext = in_context._splitTypeId.context;

        in_context._parentNestedChangeSet = nestedChangeSet;

        // Process an individual change recursively, by preparing the traversal context and invoking
        // _traverseChangeSetRecursively
        const processChange = function(
            in_segment: string | number,
            in_subChangeSet: SerializedChangeSet,
            in_nestedTypeid: string,
            in_escape: boolean,
            in_parentPropertyType: PropertyContainerType,
            in_arrayOperationIndex?: number,
            in_arrayLocalIndex?: number,
            in_arrayOperationOffset?: number,
            in_arrayIteratorOffset?: number) {
            // Update the path
            in_context._lastSegment = in_segment;
            const escapedSegment = in_escape && isString(in_segment) ? PathHelper.quotePathSegmentIfNeeded(in_segment) : in_segment;
            let nextSegmentToPushInParentStack = in_context._lastSegment;
            // Note: we don't quote the path string here, since the paths in a ChangeSet are already quoted, if necessary
            if (currentTypeIdContext === "map" ||
                currentTypeIdContext === "array" ||
                currentTypeIdContext === "set") {
                in_context._lastSegmentString = `[${escapedSegment}]`;
            } else {
                in_context._lastSegmentString = pathSeparator + escapedSegment;
            }
            in_context._fullPath = currentPath + in_context._lastSegmentString;

            // Store the typeid and nested ChangeSet
            in_context._typeid = in_nestedTypeid;
            in_context._nestedChangeSet = in_subChangeSet;
            in_context._propertyContainerType = in_parentPropertyType;
            in_context._arrayOperationIndex = in_arrayOperationIndex;
            in_context._arrayLocalIndex = in_arrayLocalIndex;
            in_context._arrayOperationOffset = in_arrayOperationOffset;
            in_context._arrayIteratorOffset = in_arrayIteratorOffset;
            if (in_arrayIteratorOffset !== undefined) {
                if (in_context._operationType === "remove") {
                    nextSegmentToPushInParentStack = in_context._lastSegment as number + in_arrayIteratorOffset - in_arrayLocalIndex;
                    in_context._fullPostPath = `${currentPostPath}[${in_segment as number +
                        in_arrayIteratorOffset - in_arrayLocalIndex}]`;
                } else {
                    nextSegmentToPushInParentStack = in_context._lastSegment as number + in_arrayIteratorOffset;
                    in_context._fullPostPath = `${currentPostPath}[${in_segment as number + in_arrayIteratorOffset}]`;
                }
            } else {
                nextSegmentToPushInParentStack = in_context._lastSegment;
                in_context._fullPostPath = currentPostPath + in_context._lastSegmentString;
            }

            // Continue traversal
            in_context._stackDepth++;
            in_context._typeStack.push(in_context.getTypeid());
            in_context._parentStack.push(nextSegmentToPushInParentStack);
            in_context._containerStack.push(in_context._propertyContainerType);
            in_context._userStack.push({});
            _traverseChangeSetRecursively(in_preCallback, in_postCallback, in_context);
            in_context._stackDepth--;
            in_context._typeStack.pop();
            in_context._parentStack.pop();
            in_context._containerStack.pop();
            in_context._userStack.pop();

            in_context._userData = currentUserData;
            in_context._parentNestedChangeSet = nestedChangeSet;
        };

        // If this property is a collection, we set the correct type, otherwise we assume it is a NodeProperty
        const propertyContainerType = (splitTypeId.context === "map" ||
            splitTypeId.context === "set" ||
            splitTypeId.context === "array") ? splitTypeId.context : "NodeProperty";

        let oldOperationType = in_context._operationType;
        let paths: string[];
        let typeids: string[];
        let typeid: string;
        let i: number;
        let j: number;
        if (splitTypeId.context === "array") {
            // Use the ArrayChangeSetIterator to process the changes in the ChangeSet in the correct order
            const arrayIterator = new ArrayChangeSetIterator(nestedChangeSet);
            let insertCounter = 0;
            let removeCounter = 0;
            let modifyCounter = 0;
            while (!arrayIterator.atEnd()) {
                switch (arrayIterator.opDescription.type) {
                    case ArrayIteratorOperationTypes.INSERT:
                        in_context._operationType = "insert";
                        for (i = 0; i < arrayIterator.opDescription.operation[1].length; ++i) {
                            // The typeid is stored inline for arrays
                            typeid = (arrayIterator.opDescription.operation[1][i] as any).typeid;
                            ConsoleUtils.assert(typeid, MSG.NON_PRIMITIVE_ARRAY_NO_TYPEID);
                            processChange(arrayIterator.opDescription.operation[0] + i, arrayIterator.opDescription.operation[1][i], typeid, false,
                                propertyContainerType, insertCounter, i, arrayIterator.opDescription.operation[0], arrayIterator.opDescription.offset);
                        }
                        insertCounter++;
                        break;
                    case ArrayIteratorOperationTypes.REMOVE:
                        in_context._operationType = "remove";
                        for (i = 0; i < arrayIterator.opDescription.operation[1]; ++i) {
                            // For removals, we don't have a typeid and we use the ChangeSet of the removal operation as nested
                            // ChangeSet -- TODO: doing this is maybe not really nice here
                            processChange(arrayIterator.opDescription.operation[0] + i, nestedChangeSet.remove, undefined, false,
                                propertyContainerType, removeCounter, i, arrayIterator.opDescription.operation[0], arrayIterator.opDescription.offset);
                        }
                        removeCounter++;
                        break;
                    case ArrayIteratorOperationTypes.MODIFY:
                        in_context._operationType = "modify";
                        for (i = 0; i < arrayIterator.opDescription.operation[1].length; ++i) {
                            // The typeid is stored inline for arrays
                            typeid = (arrayIterator.opDescription.operation[1][i] as any).typeid;
                            ConsoleUtils.assert(typeid, MSG.NON_PRIMITIVE_ARRAY_NO_TYPEID);
                            processChange(arrayIterator.opDescription.operation[0] + i, arrayIterator.opDescription.operation[1][i], typeid, false,
                                propertyContainerType, modifyCounter, i, arrayIterator.opDescription.operation[0], arrayIterator.opDescription.offset);
                        }
                        modifyCounter++;
                        break;
                    default:
                        throw new Error(MSG.UNKNOWN_OPERATOR + arrayIterator.opDescription.type);
                }
                arrayIterator.next();
            }
            in_context._operationType = oldOperationType;
        } else {
            // Bug fix: if we insert & remove/modify the same key in the same ChangeSet,
            // we need to process remove first, followed by insert & modify
            if (nestedChangeSet.remove) {
                oldOperationType = in_context._operationType;
                in_context._operationType = "remove";
                paths = nestedChangeSet.remove;
                if (Array.isArray(paths)) {
                    for (i = 0; i < paths.length; i++) {
                        // For removals in irreversible CSs, we don't have a typeid and we use the ChangeSet of the
                        // removal operation as nested ChangeSet
                        processChange(paths[i], nestedChangeSet.remove, undefined, true, propertyContainerType);
                    }
                } else {
                    // for removals in reversible changesets we have an object containing the types
                    typeids = Object.keys(nestedChangeSet.remove);
                    for (i = 0; i < typeids.length; i++) {
                        typeid = typeids[i];
                        paths = Object.keys(nestedChangeSet.remove[typeid]);
                        for (j = 0; j < paths.length; j++) {
                            processChange(paths[j], nestedChangeSet.remove[typeid][paths[j]], typeid, true, propertyContainerType);
                        }
                    }
                }
                in_context._operationType = oldOperationType;
            }

            // Process insertion of dynamic property, maps and sets
            if (nestedChangeSet.insert) {
                // Once we have reached an insert operation all subsequent operations are inserts
                oldOperationType = in_context._operationType;
                in_context._operationType = "insert";
                // Maps and NodeProperties group the insertions by type
                typeids = Object.keys(nestedChangeSet.insert);
                for (i = 0; i < typeids.length; i++) {
                    typeid = typeids[i];
                    paths = Object.keys(nestedChangeSet.insert[typeid]);
                    for (j = 0; j < paths.length; j++) {
                        processChange(paths[j], nestedChangeSet.insert[typeid][paths[j]], typeid, true, propertyContainerType);
                    }
                }
                in_context._operationType = oldOperationType;
            }

            if (nestedChangeSet.modify) {
                // Maps and NodeProperties group modifications by type
                typeids = Object.keys(nestedChangeSet.modify);
                for (i = 0; i < typeids.length; i++) {
                    typeid = typeids[i];
                    paths = Object.keys(nestedChangeSet.modify[typeid]);
                    for (j = 0; j < paths.length; j++) {
                        processChange(paths[j], nestedChangeSet.modify[typeid][paths[j]], typeid, true, propertyContainerType);
                    }
                }
            }
        }

        // Process nested properties
        if (splitTypeId.context === "single") {
            typeids = Object.keys(nestedChangeSet);
            for (i = 0; i < typeids.length; i++) {
                typeid = typeids[i];
                if (!isReservedKeyword(typeid)) {
                    paths = Object.keys(nestedChangeSet[typeid]);
                    for (j = 0; j < paths.length; j++) {
                        processChange(paths[j], nestedChangeSet[typeid][paths[j]], typeid, false, "template");
                    }
                }
            }
        }
        if (in_postCallback) {
            in_postCallback(postOrderContext);
        }
    };

    interface TraversalContextParams {
        fullPostPath?: string;
        fullPath?: string;
        propertyContainerType?: PropertyContainerType;
        operationType?: OperationType;
    }

    /**
     * Provides traversal information when parsing ChangeSets via the traverseChangeSetRecursively function.
     */
    export class TraversalContext {
        public _fullPath: string;
        public _lastSegment: string | number;
        public _lastSegmentString: string;
        public _typeid: string | undefined;
        public _splitTypeId: any;
        public _userData: any;
        public _traversalStopped: boolean;
        public _nestedChangeSet: SerializedChangeSet;
        public _parentNestedChangeSet: SerializedChangeSet;
        public _propertyContainerType: PropertyContainerType;
        public _arrayLocalIndex: number | undefined;
        public _arrayOperationIndex: number | undefined;
        public _arrayOperationOffset: number | undefined;
        public _arrayIteratorOffset: number | undefined;
        public _fullPostPath: string;
        public _stackDepth: number;
        public _typeStack: string[];
        public _parentStack: (string | number)[];
        public _containerStack: string[];
        public _userStack: any[];
        public _operationType: OperationType;
        constructor(params: TraversalContextParams = {}) {
            this._fullPath = params.fullPath || "";
            this._lastSegment = "";
            this._lastSegmentString = "";
            this._typeid = undefined;
            this._splitTypeId = undefined;
            this._userData = undefined;
            this._traversalStopped = false;
            this._nestedChangeSet = undefined;
            this._parentNestedChangeSet = undefined;
            this._propertyContainerType = params.propertyContainerType || "root";
            this._arrayLocalIndex = undefined;
            this._arrayOperationIndex = undefined;
            this._arrayOperationOffset = undefined;
            this._arrayIteratorOffset = undefined;
            this._fullPostPath = params.fullPostPath || "";
            this._stackDepth = 0;
            this._typeStack = [];
            this._parentStack = [];
            this._containerStack = [];
            this._userStack = [];

            // By default, operations are modify operations
            this._operationType = params.operationType || "modify";
        }
        /**
         * @returns Whether it's traversing or not
         */
        isTraversing(): boolean {
            return !this._traversalStopped;
        }

        /**
         * Stop the traversal for all nodes below the currently processed one
         */
        stopTraversal() {
            this._traversalStopped = true;
        }

        /**
         * Start the traversal for all nodes below the currently processed one
         */
        startTraversal() {
            this._traversalStopped = false;
        }

        /**
         * Returns the operation type
         * @returns one of 'insert', 'modify' or 'remove'
         */
        getOperationType(): OperationType {
            return this._operationType;
        }

        /**
         * Returns the full path to the currently visited ChangeSet
         * (from the root of the ChangeSet)
         * @returns The full path
         */
        getFullPath(): string {
            return this._fullPath;
        }

        /**
         * Returns the last segment of the path, either a string with the key or a number with the position in the array.
         * If the path is part of a templated property with nested properties, this string can contain multiple path
         * segments, separated by dots. The segment is returned here in the form it appears in the changeSet. For a
         * templated property, it is an escaped (if necessary) path with dots. For a map/NodeProperty,
         * it is an unescaped path segment.
         *
         * @returns The last segment index
         */
        getLastSegment(): string | number {
            return this._lastSegment;
        }

        /**
         * Returns the last segment of the path escaped to be compatible for use in a path.
         *
         * This returns the same segment as getLastSegment, but always performs escaping in such a way that this segment can
         * be used in a path
         *
         * @returns The last segment index
         */
        getLastSegmentEscaped(): string | number {
            if (this._propertyContainerType === "NodeProperty" ||
                this._propertyContainerType === "map" ||
                this._propertyContainerType === "set" ||
                this._propertyContainerType === "root") {
                return PathHelper.quotePathSegmentIfNeeded(this._lastSegment as string);
            }
            return this._lastSegment;
        }

        /**
         * Returns true if the passed context is an empty object
         * @private
         * @param in_context change set traversal context
         * @returns Wether the object is empty
         */
        _isEmptyObject(in_context: TraversalContext) {
            return Object(in_context._nestedChangeSet) && isEmpty(in_context._nestedChangeSet);
        }

        /**
         * Returns true if we're at the tip of a path
         * @returns Wether the context is at a leaf
         */
        //
        // @ts-ignore currently it's not needed
        private isLeafNode(): boolean {
            return TypeIdHelper.isPrimitiveType(this._typeid) ||
                this._isEmptyObject(this) ||
                this.getOperationType() === "remove";
        }

        /**
         * Returns the index of the last segment, either a string with the key or a number with the position in the array
         * @private
         * @returns The last segment index
         */
        getPostLastSegment(): number | string {
            if (this._propertyContainerType === "array" && isNumber(this._lastSegment) && this._arrayIteratorOffset !== undefined) {
                if (this._operationType === "remove") {
                    return this._lastSegment + this._arrayIteratorOffset - this._arrayLocalIndex;
                } else {
                    return this._lastSegment + this._arrayIteratorOffset;
                }
            } else {
                return this._lastSegment;
            }
        }

        /**
         * Returns the typeid of the currently visited Property
         * @returns typeid or undefined, if the current operation type is 'remove'
         */
        getTypeid(): string | undefined {
            return this._typeid;
        }

        /**
         * The ChangeSet that should be applied to the currently visited node.
         *
         * If this is a remove operation, it is the whole ChangeSet of the removal operation
         * @returns The ChangeSet
         */
        getNestedChangeSet(): SerializedChangeSet {
            return this._nestedChangeSet;
        }

        /**
         * Replace the current nested ChangeSet by another one
         *
         * @param in_newNestedChangeset The new content
         */
        replaceNestedChangeSet(in_newNestedChangeset: SerializedChangeSet) {
            let parent = this.getParentNestedChangeSet();
            if (this.getPropertyContainerType() === "template") {
                parent = parent[this.getTypeid()!];
                if (parent) {
                    parent[this.getLastSegment()] = in_newNestedChangeset;
                } else {
                    throw new Error(`TEMPORARY - INTERNAL: Was expected to replace a nested ChangeSet
                 under "${this.getLastSegment()}" by "${JSON.stringify(in_newNestedChangeset)}",
                 but could not find "${this.getTypeid()}" in "${JSON.stringify(this.getParentNestedChangeSet())}"`);
                }
            } else if (this.getPropertyContainerType() === "NodeProperty" || this.getPropertyContainerType() === "map") {
                parent[this.getOperationType()][this.getTypeid()!][this.getLastSegment()] = in_newNestedChangeset;
            } else {
                console.warn("replaceNestedChangeSet: not implemented. type: ", this.getPropertyContainerType());
            }
        }

        /**
         * Get the ChangeSet of the parent that contains the currently visited node.
         *
         * @returns The parent ChangeSet
         */
        getParentNestedChangeSet(): SerializedChangeSet {
            return this._parentNestedChangeSet;
        }

        /**
         * Returns the split Typeid as returned by TypeIdHelper.TypeIdHelper.extractContext
         * @returns The split typeid
         */
        getSplitTypeID(): ExtractedContext {
            return this._splitTypeId;
        }

        /**
         * Sets the split typeid.
         */
        setSplitTypeID(splitTypeid: ExtractedContext) {
            this._splitTypeId = splitTypeid;
        }

        /**
         * Sets user data, which will be passed to the recursive calls within this scope
         *
         * @param in_userData - The user data
         */
        setUserData(in_userData: any) {
            this._userData = in_userData;
        }

        /**
         * Returns the user data set by the calling function
         *
         * @returns The user data
         */
        getUserData(): any {
            return this._userData;
        }

        /**
         * Clones the current Traversal Object
         * @returns The cloned object
         */
        clone(): TraversalContext {
            const result = new TraversalContext();
            result._fullPath = this._fullPath;
            result._lastSegment = this._lastSegment;
            result._lastSegmentString = this._lastSegmentString;
            result._typeid = this._typeid;
            result._splitTypeId = this._splitTypeId; // it's OK that it's not a deep copy as it's not modified partially
            result._userData = this._userData;
            result._traversalStopped = this._traversalStopped;
            result._nestedChangeSet = this._nestedChangeSet;
            result._parentNestedChangeSet = this._parentNestedChangeSet;
            result._propertyContainerType = this._propertyContainerType;
            result._arrayLocalIndex = this._arrayLocalIndex;
            result._arrayOperationIndex = this._arrayOperationIndex;
            result._arrayOperationOffset = this._arrayOperationOffset;
            result._arrayIteratorOffset = this._arrayIteratorOffset;
            result._fullPostPath = this._fullPostPath;
            result._operationType = this._operationType;
            result._stackDepth = this._stackDepth;
            result._typeStack = this._typeStack.slice();
            result._parentStack = this._parentStack.slice();
            result._containerStack = this._containerStack.slice();
            result._userStack = this._userStack.slice();

            return result;
        }

        /**
         * Returns the type of the property this property is contained within.
         * It can be one of ['NodeProperty', 'map', 'array', 'set', 'template', 'root']
         *
         * @returns The type of the property container
         */
        getPropertyContainerType(): PropertyContainerType {
            return this._propertyContainerType;
        }

        /**
         * If this is an array operation, it returns the index of this operations
         *
         * @returns The index
         */
        getArrayOperationIndex(): number | undefined {
            return this._arrayOperationIndex;
        }

        /**
         * If this is an array operation, it returns the offset of this operations
         *
         * @returns The index
         */
        getArrayOperationOffset(): number | undefined {
            return this._arrayOperationOffset;
        }

        /**
         * If this is an array operation, it returns the local index of this entry within the array of entries
         * of the currently processed operation
         *
         * @returns {Number} The index
         * @private
         */
        getArrayLocalIndex() {
            return this._arrayLocalIndex;
        }

        /**
         * If this is an array operation, it returns the offset of this operation as defined by the internal
         * ArrayIteratorOffset of the currently processed operation
         * @returns The offset
         */
        getArrayIteratorOffset(): number | undefined {
            return this._arrayIteratorOffset;
        }

        /**
         * If this is an array operation, it returns the valid path post this operation. For example if the original
         * path is foo.bar[0] and we insert one element at position 0, then the valid post path will be foo.bar[1].
         * In the case of array remove operations, the path returned by this function is only valid during the traversal
         * itself, since the elements get deleted. Array entries are deleted element by element.
         * @returns The path
         */
        getFullPostPath(): string {
            return this._fullPostPath;
        }

        /**
         * Returns the depth level of the current traversal state
         * @returns The Depth
         */
        getStackDepth(): number {
            return this._stackDepth;
        }

        /**
         * Returns stack of all types traversed to this node
         * @returns The types traversed
         */
        getTypeStack(): string[] {
            return this._typeStack;
        }

        /**
         * Returns stack of all property names traversed to this node
         * @returns The names traversed
         */
        getParentStack(): (string | number)[] {
            return this._parentStack;
        }

        /**
         * Returns stack of all container types traversed to this node
         * @returns The container types traversed
         */
        getContainerStack(): string[] {
            return this._containerStack;
        }

        /**
         * Returns stack of all validation checks traversed to this node
         * @returns The validation checks traversed
         */
        getUserStack(): string[] {
            return this._userStack;
        }

        /**
         * @returns Last segment string.
         */
        getLastSegmentString(): string {
            return this._lastSegmentString;
        }
    }

    /**
     * Traverses a ChangeSet recursively and invokes either a pre- or a post-order callback for each visited property.
     *
     * At least one of the pre- or post-order callbacks must be specified. Both may be specified as well.
     *
     * @param in_changeSet - The ChangeSet to process
     */
    export function traverseChangeSetRecursively(in_changeSet: SerializedChangeSet, in_params?: TraversalOptions) {
        ConsoleUtils.assert(in_params.preCallback || in_params.postCallback, MSG.MISSING_PRE_POST_CALLBACK);
        // Initialize the traversal context
        const context = new Utils.TraversalContext();
        if (in_changeSet.typeid) {
            context._typeid = in_changeSet.typeid;
        } else {
            // if we're given an extra rootTypeId, use that
            if (in_params.rootTypeid) {
                context._typeid = in_params.rootTypeid;
            } else {
                // By default, we assume that a ChangeSet without a typeid affects a NodeProperty, since that is the default
                // for a repository root
                context._typeid = "NodeProperty";
            }
        }
        context._nestedChangeSet = in_changeSet;
        context._parentNestedChangeSet = in_changeSet;
        context._splitTypeId = TypeIdHelper.extractContext(context._typeid);
        context._userData = in_params.userData;

        if (in_params.rootOperation) {
            context._operationType = in_params.rootOperation;
        }

        // Start the traversal
        _traverseChangeSetRecursively(in_params.preCallback, in_params.postCallback, context);
    }

    /**
     * Traverses a ChangeSet recursively and invokes either a pre- or a post-order callback for each visited property.
     *
     * At least one of the pre- or post-order callbacks must be specified. Both may be specified as well.
     *
     * @param in_changeSet - The ChangeSet to process
     * @param in_finalizer - A callback when traversal is completed
     *
     */
    export function traverseChangeSetRecursivelyAsync(in_changeSet: SerializedChangeSet, in_params?: TraversalOptions, in_finalizer?: (any) => any) {
        ConsoleUtils.assert(in_params.preCallback || in_params.postCallback, MSG.MISSING_PRE_POST_CALLBACK);
        // Initialize the traversal context
        const context = new Utils.TraversalContext();
        if (in_changeSet.typeid) {
            context._typeid = in_changeSet.typeid;
        } else {
            // if we're given an extra rootTypeId, use that
            if (in_params.rootTypeid) {
                context._typeid = in_params.rootTypeid;
            } else {
                // By default, we assume that a ChangeSet without a typeid affects a NodeProperty, since that is the default
                // for a repository root
                context._typeid = "NodeProperty";
            }
        }
        context._nestedChangeSet = in_changeSet;
        context._parentNestedChangeSet = in_changeSet;
        context._splitTypeId = TypeIdHelper.extractContext(context._typeid);
        context._userData = in_params.userData;

        if (in_params.rootOperation) {
            context._operationType = in_params.rootOperation;
        }

        // Start the traversal
        _traverseChangeSetRecursivelyAsync(in_params.preCallback, in_params.postCallback, context, in_finalizer);
    }

    /**
     * Extracts all typeIds from the given ChangeSet
     *
     * @param in_changeSet - The ChangeSet to process
     *
     * @returns All typeids that appear in the ChangeSet
     */
    export function extractTypeids(in_changeSet: SerializedChangeSet): string[] {
        const result = {};
        Utils.traverseChangeSetRecursively(in_changeSet, {
            preCallback(in_context) {
                if (in_context.getOperationType() === "insert" ||
                    in_context.getOperationType() === "modify") {
                    in_context.getUserData()[in_context.getTypeid()] = true;
                }
            },
            userData: result,
        });
        return Object.keys(result);
    }

    /**
     * Enumerates all template from a given ChangeSet
     *
     * @param in_changeSet - The ChangeSet to process
     * @param in_callback - A callback that is used to emit every template
     * @param in_finalizer - A callback that is called when enumeration is completed
     *
     * @returns  All templates that appear in the ChangeSet
     *   The returned object has members key (string), corresponding to the type and value with the
     *   definition (object)
     */
    export function enumerateSchemas(in_changeSet: SerializedChangeSet, in_callback: (arg0: { key: string; value: any; }, arg1: ErrorCallback<Error>) => void, in_finalizer: ErrorCallback<Error>): string[] {
        const result = [];

        if (in_changeSet.insertTemplates) {
            const keys = Object.keys(in_changeSet.insertTemplates);
            eachSeries(keys, function(k, next) {
                in_callback({
                    key: k,
                    value: in_changeSet.insertTemplates[k],
                }, next);
            }, in_finalizer);
        } else {
            in_finalizer();
        }

        return result;
    }

    /**
     * Removes all typeids from a ChangeSet
     * This is a private functions, it is only exported for the tests.
     *
     * @param io_changeSet - The ChangeSet to process
     */
    export function _stripTypeids(io_changeSet: SerializedChangeSet) {
        const result = {};
        Utils.traverseChangeSetRecursively(io_changeSet, {
            preCallback(in_context) {
                if (in_context.getFullPath() === "") {
                    // We do nothing for the root
                    return;
                }

                const userData = in_context.getUserData();

                if (in_context.getOperationType() === "remove") {
                    if (!userData[in_context.getOperationType()]) {
                        userData[in_context.getOperationType()] = cloneDeep(in_context.getNestedChangeSet());
                    }
                    return;
                }

                let operationScope;
                if (in_context.getPropertyContainerType() !== "template") {
                    operationScope = userData[in_context.getOperationType()] = userData[in_context.getOperationType()] ||
                        (in_context.getPropertyContainerType() === "array" ? [] : {});
                } else {
                    operationScope = userData;
                }

                if (TypeIdHelper.isPrimitiveType(in_context.getTypeid())) {
                    // This is a primitive type, we store it under its name in the result
                    operationScope[in_context.getLastSegment()] = in_context.getNestedChangeSet();
                } else {
                    const nestedUserData = {};
                    if (in_context.getPropertyContainerType() === "array") {
                        if (!operationScope[in_context.getArrayOperationIndex()]) {
                            operationScope[in_context.getArrayOperationIndex()] = [in_context.getArrayOperationOffset(), []];
                        }
                        const arrayOperation = operationScope[in_context.getArrayOperationIndex()];

                        arrayOperation[1][in_context.getArrayLocalIndex()] = nestedUserData;
                    } else {
                        // If it is a collection, we have to continue recursively
                        operationScope[in_context.getLastSegment()] = nestedUserData;
                    }

                    in_context.setUserData(nestedUserData);
                }
            },
            userData: result,
        });

        // Remove all existing keys from the ChangeSet
        Object.keys(io_changeSet).forEach(function(key) { delete io_changeSet[key]; });

        // Assign from the result user data
        extend(io_changeSet, result);
    }

    /**
     * Searches through a ChangeSet and returns all Changes to a properties with a given typeid
     *
     * @param in_typeid    - The typeid of the property to look for
     * @param in_changeSet - The ChangeSet to process
     * @param in_excludeTypeids - Exclude all typeids from the returned ChangeSet
     * @returns Returns the applied operations to entries of the given typeid. The returned maps for insert and modify map paths to ChangeSets
     */
    export function getChangesByType(in_typeid: string, in_changeSet: SerializedChangeSet, in_excludeTypeids: boolean): { insert?: object; modify?: object; } {
        const result: SerializedChangeSet = {};

        // We search for the typeid by traversing the whole ChangeSet recursively
        Utils.traverseChangeSetRecursively(in_changeSet, {
            preCallback(in_context) {
                // If we found and instance of the requested typeid, we store it under its path
                if (in_context.getTypeid() === in_typeid) {
                    const userData = in_context.getUserData();
                    userData[in_context.getOperationType()] = userData[in_context.getOperationType()] || {};
                    userData[in_context.getOperationType()][in_context.getFullPath()] = in_context.getNestedChangeSet();
                }
            },
            userData: result,
        });

        // Exclude typeids if requested by the caller
        if (in_excludeTypeids) {
            const insertKeys = Object.keys(result.insert);
            for (let i = 0; i < insertKeys.length; i++) {
                result.insert[insertKeys[i]] = cloneDeep(result.insert[insertKeys[i]]);
                Utils._stripTypeids(result.insert[insertKeys[i]]);
            }

            const modifyKeys = Object.keys(result.modify);
            for (let i = 0; i < modifyKeys.length; i++) {
                result.modify[modifyKeys[i]] = cloneDeep(result.modify[modifyKeys[i]]);
                Utils._stripTypeids(result.modify[modifyKeys[i]]);
            }
        }

        return result;
    }

    /**
     * Filter the serialized ChangeSet returning a subset of serialized ChangeSet which has been performed
     * on the given path. Returns an empty serialized ChangeSet if the path has not been affected.
     *
     * @param in_path - The path to process
     * @param in_root - The root node to which the ChangeSet has been applied
     * @param in_changeSet - The ChangeSet to process
     * @param in_excludetypeids - Exclude all typeids from the returned ChangeSet
     * @throws if path is invalid.
     * @returns The changes that are applied to the given path
     * <pre>
     * {insert: Object|undefined, modify: Object|undefined, remove: boolean|undefined}
     * </pre>
     */
    export function getChangesByPath(in_path: string, in_root, in_changeSet: SerializedChangeSet, in_excludetypeids: boolean): object {
        // if we're asked for the root, just return the root (in a modify)
        if (in_path === "") {
            return { modify: in_changeSet };
        }

        // tokenize the path we are searching for
        const pathSegments = PathHelper.tokenizePathString(in_path);

        // Recursively traverse the ChangeSet and search for the path
        const result: SerializedChangeSet = {};
        Utils.traverseChangeSetRecursively(in_changeSet, {
            preCallback(in_context) {
                // We ignore the root
                if (in_context.getFullPath() === "") {
                    return;
                }

                const userData = in_context.getUserData();

                const currentSegment = pathSegments[userData.currentLevel];
                const changesetSegment = in_context.getLastSegmentEscaped().toString();
                let level = userData.currentLevel;

                // We have to handle the case that a path contains nested properties. In that case we concatenate the
                // properties in the path, as long as they are a prefix of the segment we are currently looking at
                let mergedSegment = PathHelper.quotePathSegmentIfNeeded(currentSegment);
                while (changesetSegment.length > mergedSegment.length &&
                    changesetSegment.substr(0, mergedSegment.length) === mergedSegment &&
                    level < pathSegments.length - 1) {
                    level++;
                    mergedSegment = mergedSegment + PROPERTY_PATH_DELIMITER +
                        PathHelper.quotePathSegmentIfNeeded(pathSegments[level]);
                }

                // Have we found the right entry in the ChangeSet?
                // TODO: This could be done more efficiently
                if (changesetSegment === mergedSegment) {
                    if (in_context.getOperationType() === "remove") {
                        // If this is a removal operation, we mark the path as removed, even if we haven't reached the end of the
                        // path
                        result.removed = true;
                        in_context._traversalStopped = true;
                    } else {
                        // Did we find the last segment in the path?
                        if (level === pathSegments.length - 1) {
                            // In that case, we return the result
                            result[in_context.getOperationType()] = {};

                            let currentChangeSet = in_context.getNestedChangeSet();
                            if (in_excludetypeids) {
                                currentChangeSet = cloneDeep(currentChangeSet);
                                Utils._stripTypeids(currentChangeSet);
                            }
                            result[in_context.getOperationType()][in_context.getFullPath()] = currentChangeSet;
                            in_context._traversalStopped = true;
                        } else {
                            // Otherwise, we continue recursively with the next level
                            in_context.setUserData({ currentLevel: level + 1 });
                        }
                    }
                } else {
                    // Stop the traversal, if this is the wrong segment
                    in_context._traversalStopped = true;
                }
            },
            userData: { currentLevel: 0 },
        });

        return result;
    }

    /**
     * Invoke a callback for all nested ChangeSets that correspond to a set of user supplied tokenized paths.
     *
     * @param in_paths -
     *     A map or object which contains the tokenized paths as nested elements. Common path segment are thus shared.
     *     NOTE: It is recommended to use Map as it provides better performance.
     *     For example, for these three paths:
     *     'entry1'
     *     'nested.entry2'
     *     'nested.entry3'
     *
     *     Using a map for paths would look like this:
     *     new Map([
     *       ['entry', new Map()],
     *       ['nested', new Map([
     *         ['entry2', new Map()],
     *         ['entry3', new Map()]
     *       ])]
     *     ])
     *
     *     While using objects for paths would look like this:
     *     {
     *       entry: {},
     *       nested: {
     *         entry2: {}
     *         entry3: {}
     *       }
     *     }
     *
     *     The element under the path, will be provided to the callback. If you have to pass additional data
     *     to the callback, you can add private data by prefixing it with __ and setting
     *     in_options.escapeLeadingDoubleUnderscore to true.
     *     In case you do that, bear in mind that paths that refer to changeSet properties that have at least
     *     two underscores as prefix in its id, should contain an extra underscore character as prefix:
     *     | Path in changeSet | Path in paths |
     *     |       path0       |      path0    | (unescaped)
     *     |      _path1       |     _path1    | (unescaoed)
     *     |     __path2       |   ___path2    | (escaped with one extra leading underscore)
     *     |    ___path3       |  ____path3    | (also escaped, the same applies to N underscores where N >= 2)
     * @param in_changeSet -
     *     The ChangeSet to process
     * @param in_callback -
     *     The function to invoke at the registered paths (it is called both for the interior and the leaf nodes). The
     *     callback will be called for each node with the following parameters:
     *     context - The current TraversalContext as returned by Utils.traverseChangeSetRecursively. Can be used for
     *               querying the current Property type, operation, etc.
     *     currentSubPaths - a subset of the tokenized paths passed in as input to this
     *                       function that still need to be processed from the current node
     *     currentTokenizedPath - the tokenized path leading to the current node
     *     contractedPathSegment - True if the current node is inside a contracted path segment
    *                              (e.g. currentTokenizedPath is ['foo'], coming from the
    *                              changeset segment 'foo.bar'), false otherwise. If true, the
    *                              typeid from the context parameter may not be valid at the
    *                              current node. Callbacks may ignore this if they are not
    *                              concerned with the type.
     * @param in_options -
     * @param in_options.rootOperation - The operation that has been applied to the root of the ChangeSet (either 'insert' or 'modify')
     * @param in_options.rootTypeid - The full type of the root Property of the ChangeSet
     * @param in_options.escapeLeadingDoubleUnderscore -
     *     If this is set to true, keys which start with '__' will be escaped (by adding an additional '_') before the
     *     lookup into the paths map. This frees the keyspace with duplicated underscores for the use by the calling
     *     application.
     */
    export function getChangesToTokenizedPaths(
        in_paths: Map<string, Map<string, any>> | { [key: string]: any },
        in_changeSet: any,
        in_callback: { (context: TraversalContext, nestedObj: any, tokenizedPath: string[], contractedPathSegment: boolean): void; (arg0: TraversalContext, arg1: any, arg2: any[], arg3: boolean): void; },
        in_options: { escapeLeadingDoubleUnderscore?: boolean; rootOperation?: OperationType; rootTypeid?: string; } = { escapeLeadingDoubleUnderscore: false, rootOperation: 'modify' }) {
        const currentTokenizedPath = [];

        let paths;
        let legacyPaths;

        const _isUserData = (k) => {
            // We only support storing user data "as is" if the in_options.escapeLeadingUnderscore is enabled.
            // We assume user data is anything that begins with exactly two underscores.
            // If the third character is also an underscore it is either an escaped changeSet segment or something that the
            // calling application escaped so we don't consider this user data.
            // Note that if the calling application sets the in_options.escapeLeadingDoubleUnderscore option, it is responsible
            // for escaping input path segments that begin with a double underscore,
            // otherwise such segments will be considered as user data!
            return in_options.escapeLeadingDoubleUnderscore && k && k.length > 2 && k[0] === "_" && k[1] === "_" &&
                k[2] !== "_";
        };

        let _convertLevelToMap = function(obj) {
            const thisLevel = new Map();
            Object.entries(obj).forEach(([k, v]) => {
                if (_isUserData(k)) {
                    // We do not want to convert user provided data into maps so we store this subtree as is
                    thisLevel.set(k, v);
                } else {
                    thisLevel.set(k, _convertLevelToMap(v));
                }
            });
            return thisLevel;
        };

        let _convertMapToLevel = function(map) {
            const thisLevel = {};
            for (const [k, v] of map) {
                if (_isUserData(k)) {
                    thisLevel[k] = v;
                } else {
                    if (v instanceof Map) {
                        thisLevel[k] = _convertMapToLevel(v);
                    } else {
                        thisLevel[k] = v;
                    }
                }
            }
            return thisLevel;
        };

        const _toCallbackParam = (pathLevels) => {
            if (legacyPaths) {
                // If a user provided objects as paths, they would expect objects in their callbacks as well.
                // So, we transform the parameter to an object, which is not very performant but is backwards compatible.
                return _convertMapToLevel(pathLevels);
            } else {
                return pathLevels;
            }
        };

        if (!(in_paths instanceof Map)) {
            legacyPaths = true;
            paths = _convertLevelToMap(in_paths);
        } else {
            legacyPaths = false;
            paths = in_paths;
        }

        // Recursively traverse the ChangeSet and search for the path
        Utils.traverseChangeSetRecursively(in_changeSet, {
            preCallback(in_context) {
                const userData = in_context.getUserData();
                const currentSubPaths = userData.currentSubPaths;

                // We ignore the root
                if (in_context.getFullPath() === "") {
                    in_callback(in_context, _toCallbackParam(currentSubPaths), currentTokenizedPath, false);
                    return;
                }

                let changesetSegment = in_context.getLastSegmentEscaped().toString();
                let numberOfSegments = 1;
                let nestedSubPath;
                if (changesetSegment.indexOf(".") !== -1 ||
                    (changesetSegment.length > 0 && changesetSegment[0] === '"')) {
                    nestedSubPath = currentSubPaths;
                    const tokenized = PathHelper.tokenizePathString(changesetSegment);
                    numberOfSegments = tokenized.length;
                    for (let i = 0; i < tokenized.length; i++) {
                        let segment = tokenized[i];
                        currentTokenizedPath.push(segment);
                        if (in_options.escapeLeadingDoubleUnderscore &&
                            segment[0] === "_" &&
                            segment[1] === "_") {
                            segment = `_${segment}`;
                        }
                        nestedSubPath = nestedSubPath.get(segment);
                        if (nestedSubPath === undefined) {
                            numberOfSegments = i + 1;
                            break;
                        }
                        if (i !== tokenized.length - 1) {
                            // Bug fix: signal the callback that we're inside a contracted path segment
                            in_callback(in_context, _toCallbackParam(nestedSubPath), currentTokenizedPath, true);
                        }
                    }
                } else {
                    currentTokenizedPath.push(changesetSegment);
                    if (in_options.escapeLeadingDoubleUnderscore &&
                        changesetSegment[0] === "_" &&
                        changesetSegment[1] === "_") {
                        changesetSegment = `_${changesetSegment}`;
                    }
                    nestedSubPath = currentSubPaths.get(changesetSegment);
                }

                // Have we found the right entry in the ChangeSet?
                // TODO: This could be done more efficiently
                if (nestedSubPath) {
                    // Otherwise, we continue recursively with the next level
                    in_context.setUserData({ currentSubPaths: nestedSubPath, numberOfSegments });
                    if (in_context.getOperationType() === "remove") {
                        // If this is a removal operation, we mark the path as removed, even if we haven't reached the end of the
                        // path
                        in_callback(in_context, _toCallbackParam(nestedSubPath), currentTokenizedPath, false);

                        in_context._traversalStopped = true;
                    } else {
                        in_callback(in_context, _toCallbackParam(nestedSubPath), currentTokenizedPath, false);
                    }
                } else {
                    // Stop the traversal, if this is the wrong segment
                    in_context.setUserData({ currentSubPaths: undefined, numberOfSegments });
                    in_context._traversalStopped = true;
                }
            },
            postCallback(in_context) {
                for (let i = 0; i < in_context.getUserData().numberOfSegments; i++) {
                    currentTokenizedPath.pop();
                }
            },
            userData: {
                currentSubPaths: paths,
                numberOfSegments: 0,
            },
            rootOperation: in_options.rootOperation,
            rootTypeid: in_options.rootTypeid,
        });
    }

    type PathsType = string[] | PathTree;

    /**
     * Filter change sets by paths.
     * Given a change set, this function will filter it based on a series of paths.
     * The final ChangeSet will only include the paths in question starting from the root of
     * the ChangeSet.
     * For Example,
     *   Given the following change set
     *      'insert': {
     *        'String': {
     *          'string1': 'hello',
     *          'string2': 'world
     *        }
     *      }
     *   And the path
     *     ['string1']
     *   the resulting ChangeSet will be
     *     'insert': {
     *       'String': {
     *         'string1': 'hello'
     *       }
     *     }
     *
     * NOTE: Paths that traverse through sets and arrays are not supported.
     *
     * @param in_changeSet - The changeset to parse
     * @param - List of paths to filter by. This can either be passed
     *     as a flat array of paths or as a Map with the tokenized, tree structured paths, see the
     *     documentation of getChangesToTokenizedPaths for an example.
     *     Note: duplicate paths will be ignored including ones that encompasse other paths
     *
     * @throws if a path given resolves into an array or set
     * @returns - Filtered ChangeSet
     */
    export function getFilteredChangeSetByPaths(in_changeSet: SerializedChangeSet, in_paths: PathsType): SerializedChangeSet {
        let pathsToObj;

        if (Array.isArray(in_paths)) {
            pathsToObj = Utils.convertPathArrayToTree(in_paths);
        } else if (in_paths instanceof Map) {
            pathsToObj = in_paths;
        } else {
            throw new Error("in_paths must be a list of paths or a map of the tokenized paths");
        }

        const rootChangeSet = {};

        const pathToChangeSet = {};

        const toPurge: SerializedChangeSet = {};

        const redundantPaths = new Map();
        Utils.getChangesToTokenizedPaths(pathsToObj, in_changeSet, function(
            context: TraversalContext, nestedObj: { size: number; }, tokenizedPath: string[], contractedPathSegment: any,
        ) {
            if (context.getFullPath() === "") {
                // skip the root
                return;
            }

            const parentNestedChangeSet = context.getParentNestedChangeSet();
            let changeSetToPopulate;

            let pathHasBeenFound = false;
            let fullPath;
            if (tokenizedPath.length === 1) {
                // first depth
                changeSetToPopulate = rootChangeSet;
                fullPath = PathHelper.quotePathSegmentIfNeeded(tokenizedPath[0]);
                const pathEntry = pathsToObj.get(tokenizedPath[0]);
                if (pathEntry) {
                    pathHasBeenFound = true;
                }
            } else {
                let parentPath = "";
                fullPath = "";
                let currentEntryInPathsToObj = pathsToObj;

                const pathsToDelete = [];
                tokenizedPath.forEach((segment, index) => {
                    if (index === 0) {
                        parentPath += PathHelper.quotePathSegmentIfNeeded(segment);
                        changeSetToPopulate = pathToChangeSet[parentPath] || changeSetToPopulate;
                    } else if (index < tokenizedPath.length - 1) {
                        if (context.getContainerStack()[index] !== "set" && context.getContainerStack()[index] !== "map") {
                            parentPath += `.${PathHelper.quotePathSegmentIfNeeded(segment)}`;
                        } else {
                            parentPath += `[${PathHelper.quotePathSegmentIfNeeded(segment)}]`;
                        }
                        changeSetToPopulate = pathToChangeSet[parentPath] || changeSetToPopulate;
                    } else {
                        if (context.getContainerStack()[index] !== "set" && context.getContainerStack()[index] !== "map") {
                            parentPath += `.${PathHelper.quotePathSegmentIfNeeded(segment)}`;
                        } else {
                            parentPath += `[${PathHelper.quotePathSegmentIfNeeded(segment)}]`;
                        }
                        fullPath = parentPath;
                    }
                    pathsToDelete.push(parentPath);

                    if (currentEntryInPathsToObj) {
                        currentEntryInPathsToObj = currentEntryInPathsToObj.get(segment);

                        if (currentEntryInPathsToObj) {
                            if (currentEntryInPathsToObj.size === 0) {
                                // Handle the case where we do not want to remove paths that should be included
                                // when filtering by a parent path. The case in particular that is of interest are
                                // paths that are folded into a single path for custom templates I.e.
                                // E.g.
                                // Given the following nested change set
                                // {String: {'a.b.c.d.f' : '...'}}
                                // we want to include it as part of the result when filtering by 'a.b.c'
                                delete toPurge[context.getFullPath()];
                            }

                            // We matched a path from the list of paths the user has passed in_context
                            // In that case, we can remove all prefix paths from the list of redundant paths,
                            // since we now know for sure, that they are needed in the final changeset
                            pathHasBeenFound = true;
                            for (let i = 0; i < pathsToDelete.length; i++) {
                                redundantPaths.delete(pathsToDelete[i]);
                            }
                        }
                    }
                });

                if (fullPath !== context.getFullPath() && pathToChangeSet[context.getFullPath()]) {
                    // Here we are in the case where we have a changeset that
                    // contains a property with path a.b.c.d as the key.
                    // In that case, getChangesToTokenizedPaths will be called
                    // at each level but will be ignored on every path leading up
                    // to the leaf node
                    // i.e. for a path "a.b.c.d", "a" "b" and "c" will be ignored.
                    return;
                }
            }

            if (!pathHasBeenFound) {
                redundantPaths.set(fullPath, {
                    changeSetToPopulate,
                    operation: context.getOperationType(),
                    typeid: context.getTypeid(),
                    lastSegment: context.getLastSegment(),
                    containerType: context.getPropertyContainerType(),
                });
            }

            // Here we override the fullPath to be the full path of the context
            // For anything that is not a set or a map. This is due to the fact that
            // on the next iteration of the child of a set, we lose the context of
            // property container which means that our fullPath will actually contain
            // dots for sets. This is OK because we build the fullpath ourselves in such a
            // case and it will be consistent with the way we search for a valid changeSetToPopulate
            if (context.getPropertyContainerType() !== "set" && context.getPropertyContainerType() !== "map") {
                fullPath = context.getFullPath();
            }

            // keep a reference to the underlying change set of the current path.
            // This will speed up the process to know which object representing
            // the nested change set needs to be populated on the subsequent iterations
            pathToChangeSet[fullPath] = _filterChangeSetBySegment(
                changeSetToPopulate,
                context,
                parentNestedChangeSet,
                nestedObj.size === 0,
            );

            // Since some hierarchies are folded into a single path, there is a case where
            // we end up with entries in the change set that we did not want. For instance,
            // if the change set contains two sibling paths "a.b.c" and "a.b.d", getChangesToTokenizedPaths
            // will invoke the callback for both paths at each level and we'll end up including both
            // paths in the filtered change set even if we didn't ask for both.
            // In that case, we keep track of change sets that we will later purge if we did not ask for them.
            //
            // NOTE: A common pitfal is to check against the presence of a "dot" in the segment to detect such a case
            // we instead check against the tokenized paths.
            // Otherwise, the function will behave incorrectly if a segment contains a dot
            // i.e.
            const lastSegment = context.getLastSegmentEscaped() as string;
            if (contractedPathSegment &&
                ((lastSegment.indexOf(".") !== -1 ||
                    (lastSegment.length > 0 && lastSegment[0] === '"')) &&
                    PathHelper.tokenizePathString(lastSegment).length > 1)
            ) {
                toPurge[context.getFullPath()] = {
                    changeSet: changeSetToPopulate,
                    typeid: context.getTypeid(),
                    pathToPurge: lastSegment,
                };
            } else {
                delete toPurge[context.getFullPath()];
            }
        });

        // Delete entries from the change set that we do not want.
        // We can enter this case when dealing with folded paths.
        each(toPurge, function(item, fullPath) {
            delete item.changeSet[item.typeid][item.pathToPurge];
            if (isEmpty(item.changeSet[item.typeid])) {
                delete item.changeSet[item.typeid];
            }
        });

        // Remove paths from the changeset that have been inserted during the traversal, but later
        // did not match any of the passed paths.
        for (const key of redundantPaths.keys()) {
            const removalInformation = redundantPaths.get(key);
            const CS = removalInformation.changeSetToPopulate;
            if (removalInformation.containerType !== "template") {
                const operation = removalInformation.operation;
                if (operation === "remove") {
                    // Removes will recursively continue and don't need to be filtered
                    continue;
                } else {
                    const operationCS = CS[operation];
                    let typeidCS = CS[operation][removalInformation.typeid];
                    delete typeidCS[removalInformation.lastSegment];
                    if (isEmpty(typeidCS)) {
                        delete operationCS[removalInformation.typeid];
                    }
                    if (isEmpty(CS[operation])) {
                        delete CS[operation];
                    }
                }
            } else {
                let typeidCS = CS[removalInformation.typeid];
                delete typeidCS[removalInformation.lastSegment];
                if (isEmpty(typeidCS)) {
                    delete CS[removalInformation.typeid];
                }
            }
        }
        return rootChangeSet;
    }

    /**
     * Converts an array of paths to the tree structured representation that is needed
     * as input for the function getChangesToTokenizedPaths.
     *
     * @param  in_paths - An array with paths
     * @returns {Map} A tree structured representation of the tokenized paths that can be
     *     passed to getChangesToTokenizedPaths and getFilteredChangeSetByPaths.
     */
    export function convertPathArrayToTree(in_paths: string[]): PathTree {
        in_paths = Array.isArray(in_paths) ? in_paths : [in_paths];
        const pathsToProcess = new Set(in_paths);

        // create an array of arrays splitting by .
        const tokenizedPaths = in_paths.map((path) => PathHelper.tokenizePathString(path));

        // Create a tree representation of the paths that are passed as an input so that
        // we can leverage getChangesToTokenizedPaths and only be notified on paths
        // that we care about.
        const pathsToObj = tokenizedPaths.reduce(function(memo, tokenizedPath) {
            let obj = memo;
            let path = "";
            let segment;

            for (let index = 0; index < tokenizedPath.length; index++) {
                segment = tokenizedPath[index];

                if (index === 0) {
                    path = PathHelper.quotePathSegmentIfNeeded(segment);
                } else {
                    path += `.${PathHelper.quotePathSegmentIfNeeded(segment)}`;
                }

                if (pathsToProcess.has(path) && index < tokenizedPath.length - 1) {
                    return memo;
                }

                if (!obj.has(segment)) {
                    obj.set(segment, new Map());
                }

                obj = obj.get(segment);
            }

            return memo;
        }, new Map());

        return pathsToObj;
    }

    /**
     * Exclude path from change set.
     * Given a change set, this function will filter it based on a series of paths.
     * The final ChangeSet will exclude the paths in question starting from the root of
     * the ChangeSet.
     * For Example,
     *   Given the following change set
     *      'insert': {
     *        'String': {
     *          'string1': 'hello',
     *          'string2': 'world
     *        }
     *      }
     *   And the path
     *     ['string1']
     *   the resulting ChangeSet will be
     *     'insert': {
     *       'String': {
     *         'string2': 'world'
     *       }
     *     }
     *
     * NOTE: Paths that traverse through sets and arrays are not supported.
     *
     * @param in_changeSet - The changeset to parse
     * @param in_paths - List of paths to exclude. Note: duplicate paths will be ignored
     * including ones that encompasse other paths
     * @throws if a path given resolves into an array or set
     * @returns - Filtered ChangeSet
     */
    export function excludePathsFromChangeSet(in_changeSet: SerializedChangeSet, in_paths: string[]): SerializedChangeSet {
        if (!in_changeSet || !in_paths || isEmpty(in_paths)) {
            return in_changeSet;
        }

        in_paths = Array.isArray(in_paths) ? in_paths : [in_paths];
        // create an array of arrays splitting by .
        const tokenizedPaths = in_paths.map((path) => PathHelper.tokenizePathString(path));

        const rootChangeSet = cloneDeep(in_changeSet);

        Utils.traverseChangeSetRecursively(rootChangeSet, {
            preCallback: (in_context) => {
                const shouldExclude = find(tokenizedPaths, (val) => { return isEqual(val, in_context.getParentStack()); });
                if (shouldExclude) {
                    const operationType = in_context.getOperationType();
                    const typeId = in_context.getTypeid();
                    const lastSegment = in_context.getLastSegment();
                    delete in_context.getParentNestedChangeSet()[operationType][typeId][lastSegment];
                    in_context._traversalStopped = true;
                }
            },
        });

        return rootChangeSet;
    }

    /**
     * Extract all paths from the ChangeSet in a flattened list and include the operations and typeid information.
     * NOTE: The paths returned also include the parent. i.e. the path 'nodeProp.subproperty' will result in
     * {
     *   nodeProp: {
     *    operation: 'modify',
     *    typeid: { typeid: 'NodeProperty', context: 'single', isEnum: false }
     *   },
     *   nodeProp.subProperty: {
     *    operation: 'insert',
     *    typeid: { typeid: 'Float32', context: 'single', isEnum: false }
     *   }
     * }
     * @param in_changeSet - The changeset to extract paths from
     * @param in_options] - Set of options
     * @param in_options.includeOperation - Flag to include the operation
     * @param in_options.includeTypeidInfo - Flag to include the typeid info
     * @returns - Flat list of paths
     */
    export function extractPathsFromChangeSet(in_changeSet: SerializedChangeSet, in_options?: { includeOperation?: boolean; includeTypeidInfo?: boolean; }): { [key: string]: { operation: string, typeInfo: string } } {
        const paths = {};
        Utils.traverseChangeSetRecursively(in_changeSet, {
            preCallback(context) {
                const fullPath = context.getFullPath();
                paths[fullPath] = paths[fullPath] || {};
                if (in_options.includeOperation) {
                    paths[fullPath].operation = context.getOperationType();
                }

                if (in_options.includeTypeidInfo) {
                    paths[fullPath].typeidInfo = context.getSplitTypeID();
                }
            },
        });

        return paths;
    }
}
