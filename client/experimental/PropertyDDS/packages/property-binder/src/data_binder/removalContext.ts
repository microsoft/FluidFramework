/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @fileoverview Context which describes a remove operation.
 */
import { BaseContext } from './baseContext';
import { DataBinding } from './dataBinding';
import { NodeType } from './dataBindingTree';

/**
 * Context which describes a remove operation
 * @extends BaseContext
 * @alias RemovalContext
 * @public
 */
export class RemovalContext extends BaseContext {
  private _subTree: NodeType;

  /**
   * @param in_subTree - The entity tree that was removed by this operation
   * @param in_baseDataBinding - The base data binding to which this event has been bound
   * @param in_path - The full path to the property that is removed
   * @param in_simulated - if true, the modification is being done due to removing a binding
   *   for properties that are still in the workspace, i.e., we are simulating the removal of the property.
   *
   * @constructor
   * @hideconstructor
   * @hidden
   * @package
   */
  constructor(in_subTree: NodeType, in_baseDataBinding?: DataBinding, in_path?: string, in_simulated: boolean = false) {
    super('remove', '', in_path, in_baseDataBinding, undefined, in_simulated);
    this._subTree = in_subTree;
  }

  /**
   * Returns the Data Bindings (if it exists) at the root of the removal. If an optional binding type is supplied,
   * Bindings that correspond to that type are returned, otherwise Bindings which have the same type as the
   * Binding that triggered the event of this this RemovalContext are returned.
   *
   * @param in_bindingType - The requested bindingType. If none has been given, data bindings with the same
   *     bindingType as the DataBinding that triggered this removal context.
   * @returns A data binding (defined for the given bindingType
   *     or the one associated with the data binding) or undefined if no binding is present.
   * @public
   */
  getDataBinding(in_bindingType: string = ''): DataBinding | undefined {
    var originalDataBindingType = this._baseDataBinding ? this._baseDataBinding.getDataBindingType() : undefined;
    return this._subTree!.getDataBindingByType(in_bindingType || originalDataBindingType!) || undefined;
  }

  /**
   * clones the context object
   *
   * @returns the cloned context
   * @package
   * @hidden
   */
  _clone(): RemovalContext {
    return new RemovalContext(
      this._subTree,
      this._baseDataBinding!,
      this._path!,
      this._simulated);
  }

  /**
   * The DataBinder responds to changes in the PropertyTree _after_ they have already been applied to the in-memory
   * representation. The implication is that at the time of a removal callback, the property that is being
   * removed no longer exists in the in-memory representation of the PropertyTree. As such, this callback can only
   * return undefined.
   *
   * @returns Will always return undefined.
   */
  getProperty(): undefined {
    return undefined;
  }
}

