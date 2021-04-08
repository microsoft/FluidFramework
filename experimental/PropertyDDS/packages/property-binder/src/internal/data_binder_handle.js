/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The handle represents a reversable operation done with the DataBinder. For example,
 * {@link DataBinder.defineDataBinding} returns a handle that permits you to undefine the databinding.
 * By design a DataBinderHandle can be used at (almost) any time to abort/undo the process.
 *
 * For example,
 * if the creation of a data binding is delayed by a {@link DataBinder.pushBindingActivationScope},
 * it can still be removed using destroy() before the final {@link DataBinder.popBindingActivationScope}
 * actually instantiates any bindings.
 *
 * @public
 */
class DataBinderHandle {
  /**
   * Build the registration handle
   * @param {function(handle, userData)} destroyCallback - the callback to call on destroy. it is given the handle
   *  and the userData, if defined
   * @param {*} userData - userdata for the handle
   *
   * @hideconstructor
   * @hidden
   */
  constructor(destroyCallback = undefined, userData = undefined) {
    this._destroyCallback = destroyCallback;
    this._userData = userData;
  }

  /**
   * Return whether the handle represents an active operation, i.e., if destroy
   * can be called.
   *
   * @return {boolean} true if this handle is valid and can be destroyed
   *
   * @public
   */
  valid() {
    return this._destroyCallback !== undefined;
  }

  /**
   * Destroy the handle, and revert the operation this handle represents.
   *
   * @public
   */
  destroy() {
    if (!this._destroyCallback) {
      throw new Error('Destroying an inactive handle');
    }

    // We give the handle rather than set it as the this, because setting it as the this is @#$#@
    // confusing.
    this._destroyCallback(this, this._userData);

    // Releasing these will allow them to be gc'ed even if the caller keeps them
    this._destroyCallback = undefined;
    this._userData = undefined;
  }

  /**
   * Put the handle in the active state, and set the destroy function to the provided callback.
   * @param {function} destroyCallback - the new destroy function
   *
   * @private
   * @hidden
   */
  _setCallback(destroyCallback) {
    this._destroyCallback = destroyCallback;
  }

  /**
   * Change the registration info associated with the handle, overriding what was provided
   * in the constructor.
   *
   * @param {*} in_userData - associate user data with the handle
   *
   * @private
   * @hidden
   */
  setUserData(in_userData) {
    this._userData = in_userData;
  }

  /**
   * Get any data associated with this handle.
   *
   * @return {*} associated data, if there is some.
   * @private
   * @hidden
   */
  getUserData() {
    return this._userData;
  }
}

export { DataBinderHandle };
