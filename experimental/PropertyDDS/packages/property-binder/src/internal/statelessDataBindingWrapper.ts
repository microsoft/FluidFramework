/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Defines a helper class for wrapping the use of stateless data bindings
 */
import { DataBinding } from '../data_binder/data_binding';
import { ModificationContext } from '../data_binder/modification_context';
import { RemovalContext } from '../data_binder/removal_context';


export interface StatelessParams {

}

/**
 * A wrapper class for StatelessDataBinding that's used during registering a StatelessDataBinding.
 *
 * @alias StatelessDataBindingWrapper
 * @private
 * @hidden
 */
class StatelessDataBindingWrapper extends DataBinding {
  private _singleton: any;

  /**
   * Constructor
   *
   * @param params - An object containing the initialization parameters.
   * @TODO Update params type when introducing comprehensive one in DataBinding class
   */
  constructor(params: any) {
    super(params);
    this._singleton = this.getUserData().singleton;
    // these should be filled by the parent ctor, we'll need it for the DataBinder instance & DataBindingType
    // note that we won't overwrite the userData which is stored in the stateless instance!
    this._singleton._activationInfo.bindingType = this._activationInfo.bindingType;
    this._singleton._activationInfo.dataBinder = this._activationInfo.dataBinder;
  }

  /**
   * Handler that is called during the initial creation of the entity, once all its children have been created
   *
   * @param in_modificationContext - The modifications
   */
  onPostCreate(in_modificationContext: ModificationContext) {
    this._singleton._internalOnPostCreate(this.getProperty(), in_modificationContext);
  }

  /**
   * Handler that is called when this entity's corresponding property or any of its child properties are modified.
   * This function will be called before any of the children's onPreModify and onModify handlers.
   *
   * @param in_modificationContext - The modifications
   */
  onPreModify(in_modificationContext: ModificationContext) {
    this._singleton._internalOnPreModify(this.getProperty(), in_modificationContext);
  }

  /**
   * Handler that is called when this entity's corresponding property or any of its child properties are modified.
   * This function will be called after all of the children's onPreModify and onModify handlers.
   *
   * @param in_modificationContext - The modifications
   */
  onModify(in_modificationContext: ModificationContext) {
    this._singleton._internalOnModify(this.getProperty(), in_modificationContext);
  }

  /**
   * Handler that is called when the entity is removed.
   * This is called before any of the children's onRemove and onPreRemove handlers are called.
   *
   * @param in_removalContext - The removal context
   */
  onPreRemove(in_removalContext: RemovalContext) {
    this._singleton._internalOnPreRemove(this.getProperty(), in_removalContext);
  }

  /**
   * Handler that is called when the entity is removed
   * This is called after all the children's onRemove and onPreRemove handlers are called.
   *
   * @param in_removalContext - The removal context
   */
  onRemove(in_removalContext: RemovalContext) {
    this._singleton._internalOnRemove(this.getProperty(), in_removalContext);
  }
}

export default StatelessDataBindingWrapper;
