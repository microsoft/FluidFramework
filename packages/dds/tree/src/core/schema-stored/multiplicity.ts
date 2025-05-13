/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Describes how a particular field functions.
 *
 * This determine its reading and editing APIs, multiplicity, and what merge resolution policies it will use.
 */
export enum Multiplicity {
	/**
	 * Exactly one item.
	 */
	Single,
	/**
	 * 0 or 1 items.
	 */
	Optional,
	/**
	 * 0 or more items.
	 */
	Sequence,
	/**
	 * Exactly 0 items.
	 *
	 * Using Forbidden makes what types are listed for allowed in a field irrelevant
	 * since the field will never have values in it.
	 *
	 * Using Forbidden is equivalent to picking a kind that permits empty (like sequence or optional)
	 * and having no allowed types (or only never types).
	 * Because of this, its possible to express everything constraint wise without Forbidden,
	 * but using Forbidden can be more semantically clear than optional with no allowed types.
	 *
	 * For view schema, this can be useful if you need to:
	 * - run a specific out of schema handler when a field is present,
	 * but otherwise are ignoring or tolerating (ex: via extra fields) unmentioned fields.
	 * - prevent a specific field from being used as an extra field
	 * (perhaps for some past of future compatibility reason)
	 * - keep a field in a schema for metadata purposes
	 * (ex: for improved error messaging, error handling or documentation)
	 * that is not used in this specific version of the schema (ex: to document what it was or will be used for).
	 *
	 * For stored schema, this can be useful if you need to:
	 * - have a field which can have its schema updated to Optional or Sequence of any type.
	 * - to exclude a field from extra fields
	 * - for the schema system to use as a default for fields which aren't declared
	 * (ex: when updating a field that did not exist into one that does)
	 *
	 * @privateRemarks
	 * See storedEmptyFieldSchema for a constant, reusable field using Forbidden.
	 */
	Forbidden,
}
