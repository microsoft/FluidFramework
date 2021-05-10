/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Defines the base class for a stateless data binding. A stateless data binding is created once
 * by the client, but is called back for onPreModify, onModify etc. for all instances of a type.
 */

import { DataBinding } from './data_binding';
import { DataBinder } from './data_binder'; /* eslint-disable-line no-unused-vars */
import { BaseProperty } from '@fluid-experimental/property-properties'; /* eslint-disable-line no-unused-vars */
import { IStatelessDataBindingOptions } from './IStatelessDataBindingOptions'; /* eslint-disable-line no-unused-vars */

/**
 * The StatelessDataBinding class. When creating a stateless databinding class ```D``` to be
 * registered with the DataBinder (see {@link DataBinder.registerStateless}), ```D``` needs to inherit from
 * this class. Only one instance of ```D``` will be created.
 *
 * @extends DataBinding
 */
class StatelessDataBinding extends DataBinding {
  /**
   * Constructor
   *
   * @param {IStatelessDataBindingOptions} params - An object containing the initialization parameters.
   */
  constructor(params) {
    super(params || {});
    // we'll need this for the DataBinder instance & the databinding type set by the wrapper
    this._activationInfo = {};
    // if we got user data, we have to save it ourselves because our "wrapper" will have its own user data
    if (params && params.userData) {
      this._activationInfo.userData = params.userData;
    }
    console.assert(!params || !params.property, 'Not expecting a property to be defined for a stateless data binding');
  }

  /**
   * @inheritdoc
   * @package
   * @hidden
   */
  static registerOnProperty() {
    console.error('registerOnProperty() not supported for stateless Bindings');
  }

  /**
   * @inheritdoc
   * @package
   * @hidden
   */
  static registerOnPath() {
    console.error('registerOnPath() not supported for stateless Bindings');
  }

  /**
   * @inheritdoc
   * @package
   * @hidden
   */
  static registerOnValues() {
    console.error('registerOnValues() not supported for stateless Bindings');
  }

  /**
   * Returns the corresponding property set. Only valid during a callback to the singleton data binding; it
   * will return the property for the current property instance being considered.
   *
   * @return {BaseProperty} The corresponding property.
   */
  getProperty() {
    console.assert(this._property, 'Calling getProperty while not in a onPostCreate, onModify etc. callback');
    return this._property;
  }

  /**
   * Setup to do before a callback is called
   *
   * @param {BaseProperty} in_property - the property to use during the callback
   * @private
   * @hidden
   */
  _preCall(in_property) {
    this._property = in_property;
  }

  /**
   * Teardown after a callback is called
   *
   * @param {LYNX.Property.BaseProperty} in_property - the property used during the callback
   * @private
   * @hidden
   */
  _postCall(in_property) {
    this._property = undefined;
  }

  /**
   * Handler that is called during the initial creation of the entity, once all its children have been created
   * Will be called by the StatelessDataBindingWrapper.
   *
   * @private
   * @hidden
   * @param {LYNX.Property.BaseProperty} in_property - the property we just created
   * @param {Array.<LYNX.AppFramework.ModificationContext>} in_modificationContext - The modifications
   */
  _internalOnPostCreate(in_property, in_modificationContext) {
    this._preCall(in_property);
    this.onPostCreate(in_modificationContext);
    this._postCall(in_property);
  }

  /**
   * Handler that is called when this entity's corresponding property or any of its child properties are modified.
   * This function will be called before any of the children's onPreModify and onModify handlers.
   * Will be called by the StatelessDataBindingWrapper.
   *
   * @private
   * @hidden
   * @param {LYNX.Property.BaseProperty} in_property - the property we just created
   * @param {LYNX.AppFramework.ModificationContext} in_modificationContext - The modifications
   */
  _internalOnPreModify(in_property, in_modificationContext) {
    this._preCall(in_property);
    this.onPreModify(in_modificationContext);
    this._postCall(in_property);
  }

  /**
   * Handler that is called when this entity's corresponding property or any of its child properties are modified.
   * This function will be called after all of the children's onPreModify and onModify handlers.
   * Will be called by the StatelessDataBindingWrapper.
   *
   * @private
   * @hidden
   * @param {LYNX.Property.BaseProperty} in_property - the property we just created
   * @param {LYNX.AppFramework.ModificationContext} in_modificationContext - The modifications
   */
  _internalOnModify(in_property, in_modificationContext) {
    this._preCall(in_property);
    this.onModify(in_modificationContext);
    this._postCall(in_property);
  }

  /**
   * Handler that is called when the entity is removed.
   * This is called before any of the children's onRemove and onPreRemove handlers are called.
   * Will be called by the StatelessDataBindingWrapper.
   *
   * @private
   * @hidden
   * @param {LYNX.Property.BaseProperty} in_property - the property we just created
   * @param {LYNX.AppFramework.RemovalContext} in_removalContext - The removal context
   */
  _internalOnPreRemove(in_property, in_removalContext) {
    this._preCall(in_property);
    this.onPreRemove(in_removalContext);
    this._postCall(in_property);
  }

  /**
   * Handler that is called when the entity is removed
   * This is called after all the children's onRemove and onPreRemove handlers are called.
   * Will be called by the StatelessDataBindingWrapper.
   *
   * @private
   * @hidden
   * @param {LYNX.Property.BaseProperty} in_property - the property we just created
   * @param {LYNX.AppFramework.RemovalContext} in_removalContext - The removal context
   */
  _internalOnRemove(in_property, in_removalContext) {
    this._preCall(in_property);
    this.onRemove(in_removalContext);
    this._postCall(in_property);
  }
}

export { StatelessDataBinding as SingletonDataBinding,
  StatelessDataBinding
};
