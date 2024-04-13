/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable import/no-internal-modules */

export { ContainerErrorTypes } from "@fluidframework/container-definitions/legacy";

export { DriverErrorTypes } from "@fluidframework/driver-definitions/legacy";

export type {
	IDirectory,
	IDirectoryEvents,
	IDirectoryValueChanged,
	ISharedDirectory,
	ISharedDirectoryEvents,
	ISharedMap,
	ISharedMapEvents,
	IValueChanged,
} from "@fluidframework/map/legacy";

export {
	DirectoryFactory,
	MapFactory,
	SharedDirectory,
	SharedMap,
} from "@fluidframework/map/legacy";

export type {
	DeserializeCallback,
	IInterval,
	IIntervalCollectionEvent,
	IIntervalCollection,
	ISequenceDeltaRange,
	ISerializableInterval,
	ISerializedInterval,
	ISharedIntervalCollection,
	ISharedSegmentSequenceEvents,
	ISharedString,
	SharedStringSegment,
} from "@fluidframework/sequence/legacy";

export {
	IntervalType,
	SequenceDeltaEvent,
	SequenceEvent,
	SequenceInterval,
	SequenceMaintenanceEvent,
	SharedSegmentSequence,
	SharedString,
	SharedStringFactory,
} from "@fluidframework/sequence/legacy";

/* eslint-enable import/no-internal-modules */
