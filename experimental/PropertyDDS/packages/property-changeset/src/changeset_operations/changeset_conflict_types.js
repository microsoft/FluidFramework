/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Conflict types that can occur during changeset operations
 */

const ConflictType = {
  /** We had two incompatible ChangeSets, they probably were with respect to different base commits */
  INVALID_CHANGESET_BASE: 1,
  /** A value was changed in both ChangeSets */
  COLLIDING_SET: 2,
  /** A deleted child node was modified */
  ENTRY_MODIFIED_AFTER_REMOVE: 3,
  /** A child was modified after it had been removed and added.
   *
   * The modification can no longer be applied, since the affected object has changed and thus
   * the ChangeSet is no longer compatible.
   */
  ENTRY_MODIFICATION_AFTER_REMOVE_INSERT: 4,
  /** An entry with the same key was inserted into the collection */
  INSERTED_ENTRY_WITH_SAME_KEY: 5,
  /** A property was removed after a modify, this should mostly be safe, be we report it for completeness sake */
  REMOVE_AFTER_MODIFY: 6,
  // Templates do not match from one commit to another
  MISMATCH_TEMPLATES: 7,
  // Tried to insert inside a removed array range
  INSERT_IN_REMOVED_RANGE: 8
};
module.exports = ConflictType;
