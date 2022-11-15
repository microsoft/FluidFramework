/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Options to be used with {@link DataBinder.registerOnPath}
 */
export interface IRegisterOnPathOptions {
  replaceExisting?: boolean;
  /**
   * If true, the callback is executed after the current ChangeSet processing is complete. The default is false.
   */
  isDeferred?: boolean;
}
