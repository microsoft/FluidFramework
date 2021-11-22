/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataBinding } from "..";
import { ModificationContext } from "../data_binder/modificationContext";

declare type DataBindingHandle = any; // TODO declare handle type
declare type DestroyCallbackType = (handle: DataBindingHandle, userData: any) => any

type PathCallback = {
    call: (arg0: DataBinding, arg1: string | number, arg2: ModificationContext) => void;
};

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
export class DataBinderHandle {
    _destroyCallback: DestroyCallbackType | undefined;

    _userData: any;

    pathCallback: PathCallback | undefined;

    /**
     * Build the registration handle
     * @param destroyCallback - the callback to call on destroy. it is given the handle
     *  and the userData, if defined
     * @param userData - userdata for the handle
     */
    constructor(destroyCallback: DestroyCallbackType | undefined = undefined, userData: any = undefined) {
      this._destroyCallback = destroyCallback;
      this._userData = userData;
    }

    /**
     * Return whether the handle represents an active operation, i.e., if destroy
     * can be called.
     *
     * @returns true if this handle is valid and can be destroyed
     *
     */
    valid(): boolean {
      return this._destroyCallback !== undefined;
    }

    /**
     * Destroy the handle, and revert the operation this handle represents.
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
     * @param destroyCallback - the new destroy function
     *
     */
    _setCallback(destroyCallback: DestroyCallbackType) {
      this._destroyCallback = destroyCallback;
    }

    /**
     * Change the registration info associated with the handle, overriding what was provided
     * in the constructor.
     *
     * @param in_userData - associate user data with the handle
     *
     * @private
     * @hidden
     */
    setUserData(in_userData: any) {
      this._userData = in_userData;
    }

    /**
     * Get any data associated with this handle.
     *
     * @returns associated data, if there is some.
     * @private
     * @hidden
     */
    getUserData(): any {
      return this._userData;
    }
}
