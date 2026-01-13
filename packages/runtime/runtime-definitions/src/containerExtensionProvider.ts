/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ILayerCompatSupportRequirements } from "@fluid-internal/client-utils";

/**
 * Identifying characteristics of a registrant for checking runtime compatibility.
 *
 * @internal
 */
export interface ExtensionCompatibilityDetails {
	/**
	 * Compatibility generation.
	 */
	readonly generation: number;
	/**
	 * Semver string representing the version of the registrant.
	 */
	readonly version: string;
	/**
	 * Set of capabilities supported by the registrant.
	 */
	readonly capabilities: ReadonlySet<string>;
}

/**
 * Information about an instantiation of an extension.
 *
 * @internal
 */
export interface UnknownExtensionInstantiation {
	compatibility: ExtensionCompatibilityDetails;
	interface: unknown;
	extension: unknown;
}

/**
 * Description of expectations for an extension instance.
 *
 * Provided to {@link ContainerExtensionProvider.getExtension} and used to
 * validate existing extension is runtime compatible.
 *
 * @internal
 */
export interface ContainerExtensionExpectations {
	/**
	 * Requirements imposed on the host/container for the extension.
	 */
	readonly hostRequirements: ILayerCompatSupportRequirements;

	/**
	 * Expectations for an existing extension instance.
	 */
	readonly instanceExpectations: ExtensionCompatibilityDetails;

	/**
	 * Called when an existing extension instantiation appears unable to meet
	 * expectations. Allows for custom resolution with the prior instantiation
	 * including more sophisticated acceptance logic.
	 * @param priorInstantiation - The prior instantiation of the extension.
	 */
	resolvePriorInstantiation(
		priorInstantiation: UnknownExtensionInstantiation,
	): Readonly<UnknownExtensionInstantiation>;
}

/**
 * Unique identifier for extension
 *
 * @remarks
 * A string known to all clients working with a certain ContainerExtension and unique
 * among ContainerExtensions. No `/` may be used in the string. Recommend using
 * concatenation of: type of unique identifier, `:` (required), and unique identifier.
 *
 * @example Examples
 * ```typescript
 *   "guid:g0fl001d-1415-5000-c00l-g0fa54g0b1g1"
 *   "name:@foo-scope_bar:v1"
 * ```
 *
 * @internal
 */
export type ContainerExtensionId = `${string}:${string}`;

/**
 * @sealed
 * @internal
 */
export interface ContainerExtensionProvider {
	/**
	 * Gets an extension from store.
	 *
	 * @param id - Identifier for the requested extension
	 * @param expectations - Extension compatibility requirements
	 * @param context - Custom use context for extension
	 * @returns The extension
	 */
	getExtension<TInterface, TUseContext extends unknown[] = []>(
		id: ContainerExtensionId,
		expectations: ContainerExtensionExpectations,
		...context: TUseContext
	): TInterface;
}
