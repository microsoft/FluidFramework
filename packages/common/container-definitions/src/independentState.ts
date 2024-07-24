/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * {@link @fluidframework/container-runtime#ContainerRuntime} is exposed as legacy causing these system internal types
 * to also be legacy.
 * @system
 * @legacy
 * @alpha
 */
// // eslint-disable-next-line @typescript-eslint/no-namespace
// export namespace InternalIndependentState {
/**
 * @system
 * @alpha
 */
export declare class IndependentMap<TSchema> {
	private readonly IndependentMap: IndependentMap<TSchema>;
}

/**
 * @system
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export declare class IndependentMapFactory<
	T extends IndependentMap<unknown>,
	TSchema = T extends IndependentMap<infer _TSchema> ? _TSchema : never,
> {
	private constructor(signalAddress: string, requestedContent: TSchema);
}
// }

/**
 * Unique address within a session.
 *
 * @remarks
 * A string known to all clients working with a certain IndependentMap and unique
 * among IndependentMaps. Recommend using specifying concatenation of: type of
 * unique identifier, `:` (required), and unique identifier.
 *
 * @example Examples
 * ```typescript
 *   "guid:g0fl001d-1415-5000-c00l-g0fa54g0b1g1"
 *   "address:object0/sub-object2:pointers"
 * ```
 *
 * @alpha
 */
export type IndependentMapAddress = `${string}:${string}`;

/**
 * @alpha
 */
export interface IndependentStateManager {
	/**
	 * Acquires an Independent Map from store or adds new one.
	 *
	 * @param mapAddress - Address of the requested Independent Map
	 * @param factory - Factory to create the Independent Map if not found
	 * @returns The Independent Map
	 */
	acquireIndependentMap<
		T extends IndependentMap<unknown>,
		TSchema = T extends IndependentMap<infer _TSchema> ? _TSchema : never,
	>(
		mapAddress: IndependentMapAddress,
		requestedContent: TSchema,
		factory: IndependentMapFactory<T>,
	): T;
}
