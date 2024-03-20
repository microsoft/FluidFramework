/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-deprecated
import { ISerializableValue } from "./interfaces.js";
import { ILocalValue } from "./localValues.js";

/**
 * Operation indicating a value should be set for a key.
 */
export interface IMapSetOperation {
	/**
	 * String identifier of the operation type.
	 */
	type: "set";

	/**
	 * Map key being modified.
	 */
	key: string;

	/**
	 * Value to be set on the key.
	 */
	// eslint-disable-next-line import/no-deprecated
	value: ISerializableValue;
}

/**
 * Operation indicating the map should be cleared.
 */
export interface IMapClearOperation {
	/**
	 * String identifier of the operation type.
	 */
	type: "clear";
}

/**
 * Operation indicating a key should be deleted from the map.
 */
export interface IMapDeleteOperation {
	/**
	 * String identifier of the operation type.
	 */
	type: "delete";

	/**
	 * Map key being modified.
	 */
	key: string;
}

/**
 * Metadata for an local `edit` operation.
 */
export interface IMapKeyEditLocalOpMetadata {
	/**
	 * String identifier of the operation type.
	 */
	type: "edit";

	/**
	 * Unique identifier for the local operation.
	 */
	pendingMessageId: number;

	/**
	 * Local value prior to the edit.
	 */
	previousValue: ILocalValue;
}

/**
 * Metadata for an local `add` operation.
 */
export interface IMapKeyAddLocalOpMetadata {
	/**
	 * String identifier of the operation type.
	 */
	type: "add";

	/**
	 * Unique identifier for the local operation.
	 */
	pendingMessageId: number;
}

/**
 * Metadata for an local `clear` operation.
 */
export interface IMapClearLocalOpMetadata {
	/**
	 * String identifier of the operation type.
	 */
	type: "clear";

	/**
	 * Unique identifier for the local operation.
	 */
	pendingMessageId: number;

	/**
	 * Local map contents prior to clearing it.
	 */
	previousMap?: Map<string, ILocalValue>;
}

/**
 * Metadata for a local operation associated with a specific key entry in the map.
 */
export type MapKeyLocalOpMetadata = IMapKeyEditLocalOpMetadata | IMapKeyAddLocalOpMetadata;

/**
 * Metadata for a local operation.
 */
export type MapLocalOpMetadata = IMapClearLocalOpMetadata | MapKeyLocalOpMetadata;
