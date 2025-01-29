/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IChannel } from "@fluidframework/datastore-definitions/internal";
import type { ISharedObjectKind } from "@fluidframework/shared-object-base/internal";

import type { GetCommon } from "./shimFactory.js";

/**
 * Design constraints:
 *
 * There may be multiple DDSes of the same type in a single DataStore which need different migration paths.
 *
 * Handles to DDSes must dereference to the object after adaption not before.
 *
 *
 * Alternative: conversion data object layer. Migrates the DDSes inside of it, not in place (changes type, replaces DDSes).
 *
 */

/**
 * Special adapter that just returns its input.
 * @remarks
 * Using this adapter instead of some other identity function allows {@link migrate} to recognize it and perform optimizations.
 */
export function identityAdapter<T>(value: T): T {
	return value;
}

/**
 * Special adapter that indicates such an operation is unsupported.
 * @remarks
 * Using this adapter allows {@link migrate} to recognize it and avoid attempting to perform unsupported operations.
 */
export function unsupportedAdapter<T>(value: T): never {
	throw new Error("Unsupported migration");
}

/**
 *
 */
export interface MigrationOptions<in Before, out After, out Common> {
	/**
	 * Unique identifier for this migration.
	 */
	readonly migrationIdentifier: string;
	readonly to: ISharedObjectKind<After>;
	beforeAdapter(from: Before): Common & IChannel;
	afterAdapter(from: After): Common & IChannel;
	migrate(from: Before, to: After);
}

/**
 *
 */
export interface MigrationSet<in out TFrom> {
	readonly from: ISharedObjectKind<TFrom>;
	selector(id: string): MigrationOptions<TFrom, unknown, unknown>;
}

/**
 *
 */
export const shimInfo: unique symbol = Symbol("shimInfo");

/**
 *
 */
export interface MigrationShim {
	readonly [shimInfo]: MigrationShimInfo;
}

interface MigrationShimInfo {
	readonly status: MigrationStatus;
	cast<const T extends MigrationOptions<never, unknown, unknown>>(
		options: T,
	): T extends MigrationOptions<never, unknown, infer Common> ? Common : never;
}

enum MigrationStatus {
	Before,
	After,
}

/**
 * Define a SharedObjectKind to migrate from one SharedObjectKind to another.
 * @remarks
 * The returned SharedObjectKind can be used to load premigration data from documents that used `From` or `To`
 * It can also load data saved by a compatible migration shim (TODO define compatible).
 *
 * Data saved by this adapter can be loaded by `From` if it is before the migration, but after the migration it can not always be loaded by `To`:
 * the migration shim must continue to be used to load the data to ensure legacy content is properly supported.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function migrate<T extends MigrationSet<any>>(
	options: T,
): ISharedObjectKind<GetCommon<T["selector"]> & MigrationShim> {
	throw new Error("Not implemented");
}
