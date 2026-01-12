/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ILayerCompatSupportRequirements } from "@fluid-internal/client-utils";
import type {
	ContainerExtension,
	ContainerExtensionFactory,
	ExtensionInstantiationResult,
	ExtensionRuntimeProperties as GenericExtensionRuntimeProperties,
	InboundExtensionMessage,
} from "@fluidframework/container-runtime-definitions/internal";
import { assert, fail } from "@fluidframework/core-utils/internal";
import type { IFluidContainer } from "@fluidframework/fluid-static";
import { isInternalFluidContainer } from "@fluidframework/fluid-static/internal";
import type {
	ExtensionCompatibilityDetails,
	FluidDataStoreContextInternal,
	IFluidDataStoreContext,
} from "@fluidframework/runtime-definitions/internal";

import type { ExtensionHost, ExtensionRuntimeProperties } from "./internalTypes.js";
import { pkgVersion } from "./packageVersion.js";
import type { Presence, PresenceWithNotifications } from "./presence.js";
import type { PresenceExtensionInterface } from "./presenceManager.js";
import { createPresenceManager } from "./presenceManager.js";
import type { SignalMessages } from "./protocol.js";

const presenceCompatibility = {
	generation: 1,
	version: pkgVersion,
	capabilities: new Set([]),
} as const satisfies ExtensionCompatibilityDetails;

/**
 * Minimal compatible package version.
 * If an existing presence extension is registered with this version or higher,
 * it can be used instead of instantiating new instance from this version of
 * the package (assuming also capabilities are compatible).
 */
const minimalCompatiblePackageVersion = "2.71.0";

function assertCompatibilityInvariants(compatibility: ExtensionCompatibilityDetails): void {
	assert(
		compatibility.generation === presenceCompatibility.generation,
		0xc97 /* Presence compatibility generation mismatch. */,
	);
	assert(
		compatibility.version.startsWith("2."),
		0xc98 /* Registered version is not major version 2. */,
	);
	assert(
		Number.parseFloat(compatibility.version.slice(2)) <
			Number.parseFloat(presenceCompatibility.version.slice(2)),
		0xc99 /* Registered version is not less than the current version. */,
	);
	assert(
		presenceCompatibility.capabilities.size === 0,
		0xc9a /* Presence capabilities should be empty. */,
	);
}

/**
 * Common Presence manager for a container
 */
class ContainerPresenceManager
	implements
		ContainerExtension<ExtensionRuntimeProperties>,
		ReturnType<
			ContainerExtensionFactory<
				PresenceWithNotifications,
				ExtensionRuntimeProperties
			>["instantiateExtension"]
		>
{
	// ContainerExtensionFactory return elements
	public readonly compatibility = presenceCompatibility;
	public readonly interface: PresenceWithNotifications;
	public readonly extension = this;

	private readonly manager: PresenceExtensionInterface;

	public constructor(host: ExtensionHost) {
		this.interface = this.manager = createPresenceManager({
			...host,
			submitSignal: (message) => {
				host.submitAddressedSignal([], message);
			},
		});
	}

	public handleVersionOrCapabilitiesMismatch<_TRequestedInterface>(
		ourExistingInstantiation: Readonly<
			ExtensionInstantiationResult<PresenceWithNotifications, ExtensionRuntimeProperties, []>
		>,
		newCompatibilityRequest: ExtensionCompatibilityDetails,
	): never {
		assert(
			ourExistingInstantiation.compatibility === presenceCompatibility,
			0xc9b /* Presence extension called without own compatibility details */,
		);
		assertCompatibilityInvariants(newCompatibilityRequest);
		// There have not yet been any changes that would require action to upgrade.
		// But also mixed runtime versions are not yet expected.
		fail(0xcb1 /* Presence is only expected to be accessed with a single version. */);
	}

	public onNewUse(): void {
		// No-op
	}

	public processSignal(
		addressChain: string[],
		message: InboundExtensionMessage<SignalMessages>,
		local: boolean,
	): void {
		this.manager.processSignal(addressChain, message, local);
	}
}

const extensionId = "dis:bb89f4c0-80fd-4f0c-8469-4f2848ee7f4a";

const ContainerPresenceFactory = {
	hostRequirements: {
		minSupportedGeneration: 1,
		requiredFeatures: [],
	} as const satisfies ILayerCompatSupportRequirements,

	instanceExpectations: { ...presenceCompatibility, version: minimalCompatiblePackageVersion },

	resolvePriorInstantiation(
		existingInstantiation: ExtensionInstantiationResult<
			unknown,
			GenericExtensionRuntimeProperties,
			unknown[]
		>,
	): never {
		// Validate assumptions about existing instance
		assertCompatibilityInvariants(existingInstantiation.compatibility);
		// There have not yet been any changes that would require action to upgrade.
		// But also mixed runtime versions are not yet expected.
		fail(0xcb2 /* Presence is only expected to be accessed with a single version. */);
	},

	instantiateExtension(host: ExtensionHost): ContainerPresenceManager {
		return new ContainerPresenceManager(host);
	},

	[Symbol.hasInstance]: (instance: unknown): instance is ContainerPresenceManager => {
		return instance instanceof ContainerPresenceManager;
	},
} as const satisfies ContainerExtensionFactory<
	PresenceWithNotifications,
	ExtensionRuntimeProperties
>;

/**
 * Acquire a {@link Presence} from a Fluid Container
 * @param fluidContainer - Fluid Container to acquire the map from
 * @returns the {@link Presence}
 *
 * @beta
 */
export const getPresence: (fluidContainer: IFluidContainer) => Presence = getPresenceAlpha;

/**
 * Acquire a {@link PresenceWithNotifications} from a Fluid Container
 * @param fluidContainer - Fluid Container to acquire the map from
 * @returns the {@link PresenceWithNotifications}
 *
 * @alpha
 */
export function getPresenceAlpha(fluidContainer: IFluidContainer): PresenceWithNotifications {
	assert(
		isInternalFluidContainer(fluidContainer),
		0xa2f /* IFluidContainer was not recognized. Only Containers generated by the Fluid Framework are supported. */,
	);
	const presence = fluidContainer.acquireExtension(extensionId, ContainerPresenceFactory);
	return presence;
}

function assertContextHasExtensionProvider(
	context: IFluidDataStoreContext,
): asserts context is FluidDataStoreContextInternal {
	assert(
		"getExtension" in context,
		0xc9c /* Data store context does not implement ContainerExtensionProvider */,
	);
}

/**
 * Get {@link Presence} from a Fluid Data Store Context
 *
 * @legacy @alpha
 */
export function getPresenceFromDataStoreContext(context: IFluidDataStoreContext): Presence {
	assertContextHasExtensionProvider(context);
	return context.getExtension(extensionId, ContainerPresenceFactory);
}
