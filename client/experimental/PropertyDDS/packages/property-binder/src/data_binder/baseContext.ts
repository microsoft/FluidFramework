/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataBinding } from './dataBinding';
import { BaseProperty } from '@fluid-experimental/property-properties';
import { SerializedChangeSet, Utils } from '@fluid-experimental/property-changeset';

/**
 * Provides the abstract base class for all contexts passed to data binding callbacks.
 *
 * @alias BaseContext
 * @private
 * @hidden
 */
export abstract class BaseContext {
    _operationType: Utils.OperationType | undefined;

    _context: string;

    _path: string | undefined;

    _baseDataBinding: DataBinding | undefined;

    _nestedChangeSet: SerializedChangeSet;

    _simulated: boolean;

    /**
     * Default constructor.
     *
     * @param in_operationType -
     *     The operation type that has been applied to the root of the ChangeSet. It can take one of the following values:
     *     of 'insert', 'modify' or 'remove'
     * @param in_context -
     *     The context in which this ChangeSet is applied. It can take one of the following values:
     *     'single', 'map', 'set', 'array', 'template' or 'root' or '' (for remove operations)
     * @param in_path - The full path to the property that is affected by this operation
     * @param in_baseDataBinding -
     *     The data binding which triggered the event this modification context refers to. Used when this
     *     context is created for a sub-path notification.
     * @param in_nestedChangeSet -
     *     The ChangeSet represented by this context (may be undefined)
     * @param in_simulated - if true, the modification is being done retroactively on properties
     *     that were previously added to the workspace. Default is false.
     *
     * @constructor
     * @hideconstructor
     * @hidden
     */
    constructor(in_operationType?: Utils.OperationType,
        in_context = '',
        in_path?: string,
        in_baseDataBinding?: DataBinding,
        in_nestedChangeSet = undefined,
        in_simulated: boolean = false) {

        this._operationType = in_operationType;
        this._context = in_context;
        this._path = in_path;
        this._baseDataBinding = in_baseDataBinding;
        this._nestedChangeSet = in_nestedChangeSet;
        this._simulated = !!in_simulated;
    }

    /**
     * Returns the nested ChangeSet for this modification.
     * @returns The Property ChangeSet that corresponds to this modification.
     * @public
     */
    getNestedChangeSet(): SerializedChangeSet {
        return this._nestedChangeSet;
    }

    /**
     * Returns the operation type of the event being handled.
     *
     * @returns one of 'insert', 'modify' or 'remove'
     * @public
     */
    getOperationType(): Utils.OperationType | undefined {
        return this._operationType;
    }

    /**
     * Returns the type of the property's container, if defined (it's not defined for remove operations)
     *
     * @returns  one of 'single', 'map', 'set', 'array', 'template', 'root', or ''
     * @public
     */
    getContext(): string {
        return this._context;
    }

    /**
     * Returns the absolute (full) path from the root of the workspace to the modification.
     *
     * @returns the path
     * @public
     */
    getAbsolutePath(): string {
        // TODO: Should this function have a different name?
        //       Do we report absolute or relative paths?
        return this._path!;
    }

    /**
     * Returns the data binding (if it exists) at the path associated with this the modification.
     * If the optional binding type is supplied, data bindings that correspond to that type are returned, otherwise data
     * bindings which have the same type as the binding that triggered the event of this modificationContext are returned.
     *
     * @param _in_bindingType - The requested data binding type. If none has been given, data bindings with
     *   the same data binding type as the DataBinding that triggered this modification context are returned
     * @returns A data binding (of the given
     * type) which may be empty, if no data binding of the given type is present at the path associated
     * with this modification.
     * @public
     */
    getDataBinding(_in_bindingType?: string): DataBinding | undefined {
        // the default implementation will just return undefined
        return undefined;
    }

    /**
     * Returns the Property at the root of the modification (if it exists).
     *
     * @returns the property at the root of this modification
     * @public
     */
    abstract getProperty(): BaseProperty | undefined;

    /**
     * Insertion and removal events are normally fired when the state of the Property changes,
     * _i.e._, when properties are added and removed.
     * In the case where DataBindings are added that apply to properties that already exist in the
     * workspace, the databindings are said to be created retroactively. In this case, the DataBinder
     * will _simulate_ the insertion callbacks, as if the properties were just inserted at this point
     * in time. Similarly, if a DataBinding is removed while properties still exist in the workspace,
     * removals of the property are simulated.
     * This flag gives callbacks the ability to know whether the callbacks are being simulated or not.
     *
     * @returns true if this modification is simulating a property being added or removed.
     * @public
     */
    isSimulated(): boolean {
        return this._simulated;
    }

    /**
     * clones the context object
     *
     * @returns the cloned context
     * @package
     * @private
     * @hidden
     */
    abstract _clone(): BaseContext;

}
