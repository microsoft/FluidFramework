/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// @ts-expect-error The implementation base class is not a supported export.
export { SharedObject } from "@fluidframework/shared-object-base";
// @ts-expect-error The implementation base class is not a supported export.
export { SharedObjectCore } from "@fluidframework/shared-object-base";
// @ts-expect-error The implementation base class is not a supported export.
export { SharedObject as LegacySharedObject } from "@fluidframework/shared-object-base/legacy";
// @ts-expect-error The implementation base class is not a supported export.
export { SharedObjectCore as LegacySharedObjectCore } from "@fluidframework/shared-object-base/legacy";

// @ts-expect-error The implementation base type is not a supported export.
export type { SharedObject as PublicSharedObjectType } from "@fluidframework/shared-object-base";
// @ts-expect-error The implementation base type is not a supported export.
export type { SharedObjectCore as PublicSharedObjectCoreType } from "@fluidframework/shared-object-base";
// @ts-expect-error The implementation base type is not a supported export.
export type { SharedObject as LegacySharedObjectType } from "@fluidframework/shared-object-base/legacy";
// @ts-expect-error The implementation base type is not a supported export.
export type { SharedObjectCore as LegacySharedObjectCoreType } from "@fluidframework/shared-object-base/legacy";

export {
	SharedObject as InternalSharedObject,
	SharedObjectCore as InternalSharedObjectCore,
} from "@fluidframework/shared-object-base/internal";

export type {
	ISharedObject,
	ISharedObjectEvents,
	ISharedObjectKind,
} from "@fluidframework/shared-object-base/legacy";
export type { SharedObjectKind } from "@fluidframework/shared-object-base";
