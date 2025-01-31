/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	IContainer,
	ICodeDetailsLoader,
	IFluidCodeDetails,
	type IContainerPolicies,
	type IContainerEvents,
} from "@fluidframework/container-definitions/internal";
import {
	FluidObject,
	IConfigProviderBase,
	IRequest,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { IClientDetails } from "@fluidframework/driver-definitions";
import {
	IDocumentServiceFactory,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";

import { Loader } from "./loader.js";
import { ProtocolHandlerBuilder } from "./protocol.js";

/**
 * Properties necessary for creating and loading a container.
 * @legacy
 * @alpha
 */
export interface ICreateAndLoadContainerProps {
	/**
	 * The url resolver used by the loader for resolving external urls
	 * into Fluid urls such that the container specified by the
	 * external url can be loaded.
	 */
	readonly urlResolver: IUrlResolver;
	/**
	 * The document service factory take the Fluid url provided
	 * by the resolved url and constructs all the necessary services
	 * for communication with the container's server.
	 */
	readonly documentServiceFactory: IDocumentServiceFactory;
	/**
	 * The code loader handles loading the necessary code
	 * for running a container once it is loaded.
	 */
	readonly codeLoader: ICodeDetailsLoader;

	/**
	 * A property bag of options/policies used by various layers
	 * to control features
	 */
	readonly options?: IContainerPolicies | undefined;

	/**
	 * Scope is provided to all container and is a set of shared
	 * services for container's to integrate with their host environment.
	 */
	readonly scope?: FluidObject | undefined;

	/**
	 * The logger that all telemetry should be pushed to.
	 */
	readonly logger?: ITelemetryBaseLogger | undefined;

	/**
	 * The configuration provider which may be used to control features.
	 */
	readonly configProvider?: IConfigProviderBase | undefined;

	/**
	 * Optional property for allowing the container to use a custom
	 * protocol implementation for handling the quorum and/or the audience.
	 */
	readonly protocolHandlerBuilder?: ProtocolHandlerBuilder | undefined;

	/**
	 * Disables the Container from reconnecting if false, allows reconnect otherwise.
	 */
	readonly allowReconnect?: boolean | undefined;

	/**
	 * Client details provided in the override will be merged over the default client.
	 */
	readonly clientDetailsOverride?: IClientDetails | undefined;
}

/**
 * Props used to load a container.
 * @legacy
 * @alpha
 */
export interface ILoadExistingContainerProps extends ICreateAndLoadContainerProps {
	/**
	 * The request to resolve the container.
	 */
	readonly request: IRequest;

	/**
	 * Pending local state to be applied to the container.
	 */
	readonly pendingLocalState?: string | undefined;
}

/**
 * Props used to create a detached container.
 * @legacy
 * @alpha
 */
export interface ICreateDetachedContainerProps extends ICreateAndLoadContainerProps {
	/**
	 * The code details for the container to be created.
	 */
	readonly codeDetails: IFluidCodeDetails;
}

/**
 * Props used to rehydrate a detached container.
 * @legacy
 * @alpha
 */
export interface IRehydrateDetachedContainerProps extends ICreateAndLoadContainerProps {
	/**
	 * The serialized state returned by calling serialize on another container
	 */
	readonly serializedState: string;
}

/**
 * Creates a new container using the specified code details but in an unattached state. While unattached, all
 * updates will only be local until the user explicitly attaches the container to a service provider.
 * @param createDetachedContainerProps - Services and properties necessary for creating detached container.
 * @legacy
 * @alpha
 */
export async function createDetachedContainer(
	createDetachedContainerProps: ICreateDetachedContainerProps,
): Promise<IContainer> {
	const loader = new Loader(createDetachedContainerProps);
	return loader.createDetachedContainer(createDetachedContainerProps.codeDetails, {
		canReconnect: createDetachedContainerProps.allowReconnect,
		clientDetailsOverride: createDetachedContainerProps.clientDetailsOverride,
	});
}

/**
 * Creates a new container using the specified code details but in an unattached state. While unattached, all
 * updates will only be local until the user explicitly attaches the container to a service provider.
 * @param createDetachedContainerProps - Services and properties necessary for creating detached container.
 * @legacy
 * @alpha
 */
//* 3 is better
// export function createDetachedContainer2(
// 	createDetachedContainerProps: ICreateDetachedContainerProps,
// ): { container: IContainer; initialize: () => Promise<void> } {
// 	const loader = new Loader(createDetachedContainerProps);
// 	return loader.createDetachedContainer2(createDetachedContainerProps.codeDetails, {
// 		canReconnect: createDetachedContainerProps.allowReconnect,
// 		clientDetailsOverride: createDetachedContainerProps.clientDetailsOverride,
// 	});
// }

/**
 * Creates a new container using the specified code details but in an unattached state. While unattached, all
 * updates will only be local until the user explicitly attaches the container to a service provider.
 * @param createDetachedContainerProps - Services and properties necessary for creating detached container.
 * @legacy
 * @alpha
 */
export function createDetachedContainer3(
	createDetachedContainerProps: ICreateDetachedContainerProps,
	//* name this type
): { shell: TypedEventEmitter<IContainerEvents> & { initialize: () => Promise<IContainer> } } {
	const loader = new Loader(createDetachedContainerProps);
	const { container, initialize } = loader.createDetachedContainer2(
		createDetachedContainerProps.codeDetails,
		{
			canReconnect: createDetachedContainerProps.allowReconnect,
			clientDetailsOverride: createDetachedContainerProps.clientDetailsOverride,
		},
	);
	//* Put initialize on Container class but not IContainer interface
	return { shell: Object.assign(container, { initialize }) };
}

/**
 * Creates a new container using the specified snapshot but in an unattached state. While unattached, all
 * updates will only be local until the user explicitly attaches the container to a service provider.
 * @param rehydrateDetachedContainerProps - Services and properties necessary for rehydrating detached container from a previously serialized container's state.
 * @legacy
 * @alpha
 */
export async function rehydrateDetachedContainer(
	rehydrateDetachedContainerProps: IRehydrateDetachedContainerProps,
): Promise<IContainer> {
	const loader = new Loader(rehydrateDetachedContainerProps);
	return loader.rehydrateDetachedContainerFromSnapshot(
		rehydrateDetachedContainerProps.serializedState,
		{
			canReconnect: rehydrateDetachedContainerProps.allowReconnect,
			clientDetailsOverride: rehydrateDetachedContainerProps.clientDetailsOverride,
		},
	);
}

/**
 * Loads a container with an existing snapshot from the service.
 * @param loadExistingContainerProps - Services and properties necessary for loading an existing container.
 * @legacy
 * @alpha
 */
export async function loadExistingContainer(
	loadExistingContainerProps: ILoadExistingContainerProps,
): Promise<IContainer> {
	const loader = new Loader(loadExistingContainerProps);
	return loader.resolve(
		loadExistingContainerProps.request,
		loadExistingContainerProps.pendingLocalState,
	);
}
