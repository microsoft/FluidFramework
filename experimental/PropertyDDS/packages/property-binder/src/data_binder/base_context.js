/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataBinding } from './data_binding'; /* eslint-disable-line no-unused-vars */
import { BaseProperty } from '@fluid-experimental/property-properties'; /* eslint-disable-line no-unused-vars */

/**
 * Provides the abstract base class for all contexts passed to data binding callbacks.
 *
 * @alias BaseContext
 * @private
 * @hidden
 */
class BaseContext {
  /**
   * Default constructor.
   *
   * @param {string} in_operationType -
   *     The operation type that has been applied to the root of the ChangeSet. It can take one of the following values:
   *     of 'insert', 'modify' or 'remove'
   * @param {string} in_context -
   *     The context in which this ChangeSet is applied. It can take one of the following values:
   *     'single', 'map', 'set', 'array', 'template' or 'root' or '' (for remove operations)
   * @param {string} in_path - The full path to the property that is affected by this operation
   * @param {DataBinding} in_baseDataBinding -
   *     The data binding which triggered the event this modification context refers to. Used when this
   *     context is created for a sub-path notification.
   * @param {external:SerializedChangeSet} in_nestedChangeSet -
   *     The ChangeSet represented by this context (may be undefined)
   * @param {Boolean} in_simulated - if true, the modification is being done retroactively on properties
   *     that were previously added to the workspace. Default is false.
   *
   * @constructor
   * @hideconstructor
   * @hidden
   */
  constructor(in_operationType,
    in_context,
    in_path,
    in_baseDataBinding = undefined,
    in_nestedChangeSet = undefined,
    in_simulated = false) {
    this._operationType = in_operationType;
    this._context = in_context;
    this._path = in_path;
    this._baseDataBinding = in_baseDataBinding;
    this._nestedChangeSet = in_nestedChangeSet;
    this._simulated = !!in_simulated;
  }

  /**
   * Returns the nested ChangeSet for this modification.
   * @return {SerializedChangeSet} The HFDM ChangeSet that corresponds to this modification.
   * @public
   */
  getNestedChangeSet() {
    return this._nestedChangeSet;
  }

  /**
   * Returns the operation type of the event being handled.
   *
   * @return {string} one of 'insert', 'modify' or 'remove'
   * @public
   */
  getOperationType() {
    return this._operationType;
  }

  /**
   * Returns the type of the property's container, if defined (it's not defined for remove operations)
   *
   * @return {string} one of 'single', 'map', 'set', 'array', 'template', 'root', or ''
   * @public
   */
  getContext() {
    return this._context;
  }

  /**
   * Returns the absolute (full) path from the root of the workspace to the modification.
   *
   * @return {string} the path
   * @public
   */
  getAbsolutePath() {
    // TODO: Should this function have a different name?
    //       Do we report absolute or relative paths?
    return this._path;
  }

  /**
   * Returns the data binding (if it exists) at the path associated with this the modification.
   * If the optional binding type is supplied, data bindings that correspond to that type are returned, otherwise data
   * bindings which have the same type as the binding that triggered the event of this modificationContext are returned.
   *
   * @param {string} in_bindingType - The requested data binding type. If none has been given, data bindings with
   *   the same data binding type as the DataBinding that triggered this modification context are returned
   * @return {DataBinding|undefined} A data binding (of the given
   * type) which may be empty, if no data binding of the given type is present at the path associated
   * with this modification.
   * @public
   */
  getDataBinding(in_bindingType = undefined) {
    // the default implementation will just return undefined
    return undefined;
  }

  /**
   * Returns the Property at the root of the modification (if it exists).
   *
   * @return {BaseProperty|undefined} the property at the root of this modification
   * @public
   */
  getProperty() {
    // the default implementation will just return undefined
    return undefined;
  }

  /**
   * Insertion and removal events are normally fired when the state of the HFDM workspace changes,
   * _i.e._, when properties are added and removed.
   * In the case where DataBindings are added that apply to properties that already exist in the
   * workspace, the databindings are said to be created retroactively. In this case, the DataBinder
   * will _simulate_ the insertion callbacks, as if the properties were just inserted at this point
   * in time. Similarly, if a DataBinding is removed while properties still exist in the workspace,
   * removals of the property are simulated.
   * This flag gives callbacks the ability to know whether the callbacks are being simulated or not.
   *
   * @return {boolean} true if this modification is simulating a property being added or removed.
   * @public
   */
  isSimulated() {
    return this._simulated;
  }

  /**
   * clones the context object
   *
   * @return {BaseContext} the cloned context
   * @package
   * @private
   * @hidden
   */
  _clone() {
    const clone = new BaseContext();
    clone._operationType = this._operationType;
    clone._context = this._context;
    clone._path = this._path;
    clone._baseDataBinding = this._baseDataBinding;
    clone._nestedChangeSet = this._nestedChangeSet;
    clone._simulated = this._simulated;
    return clone;
  }

}

export { BaseContext };
