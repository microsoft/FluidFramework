/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IConfigProviderBase,
	IEvent,
	IEventProvider,
	IFluidHandle,
	ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import type {
	ContainerAttachProps,
	ContainerSchema,
	IFluidContainer,
	IMember,
	IServiceAudience,
} from "@fluidframework/fluid-static";

import type { IOdspTokenProvider } from "./token.js";

/**
 * Defines the necessary properties that will be applied to all containers
 * created by an OdspClient instance. This includes callbacks for the authentication tokens
 * required for ODSP.
 * @beta
 */
export interface OdspConnectionConfig {
	/**
	 * Instance that provides AAD endpoint tokens for Push and SharePoint
	 */
	tokenProvider: IOdspTokenProvider;

	/**
	 * Site url representing ODSP resource location. It points to the specific SharePoint site where you can store and access the containers you create.
	 */
	siteUrl: string;

	/**
	 * SharePoint Embedded Container Id of the tenant where Fluid containers are created
	 */
	driveId: string;

	/**
	 * Specifies the file path where Fluid files are created. If passed an empty string, the Fluid files will be created at the root level.
	 */
	filePath: string;
}
/**
 * @beta
 */
export interface OdspClientProps {
	/**
	 * Configuration for establishing a connection with the ODSP Fluid Service (Push).
	 */
	readonly connection: OdspConnectionConfig;

	/**
	 * Optional. A logger instance to receive diagnostic messages.
	 */
	readonly logger?: ITelemetryBaseLogger;

	/**
	 * Base interface for providing configurations to control experimental features. If unsure, leave this undefined.
	 */
	readonly configProvider?: IConfigProviderBase;
}

/**
 * @beta
 */
export interface OdspContainerAttachProps {
	/**
	 * The file path where Fluid containers are created. If undefined, the file is created at the root.
	 */
	filePath: string | undefined;

	/**
	 * The file name of the Fluid file. If undefined, the file is named with a GUID.
	 */
	fileName: string | undefined;

	/**
	 * The ID of the item (file) to which the container is being attached.
	 * When combined with eTag, this will trigger a conversion of an existing file to a Fluid file.
	 */
	itemId?: string;

	/**
	 * Optional eTag to use when attaching the container.
	 * If provided, the container will
	 */
	eTag?: string;
}

/**
 * Interface for the events emitted by the ODSP Fluid container services.
 * @beta
 */
export interface IOdspFluidContainerEvents extends IEvent {
	(event: "readOnlyStateChanged", listener: (readonly: boolean) => void): void;
	(event: "sensitivityLabelChanged", listener: (sensitivityLabelsInfo: string) => void): void;
}

/**
 * ODSP version of the IFluidContainer interface.
 * @beta
 */
export interface IOdspFluidContainer<
	TContainerSchema extends ContainerSchema = ContainerSchema,
> extends IFluidContainer<TContainerSchema> {
	/**
	 * A newly created container starts detached from the collaborative service.
	 * Calling `attach()` uploads the new container to the service and connects to the collaborative service.
	 *
	 * This function is same as the IFluidContainer.attach function, but has ODSP specific function signatures.
	 *
	 * @param props - Optional properties to pass to the attach function.
	 *
	 * @returns A promise which resolves when the attach is complete, with the string identifier of the container.
	 */
	attach(props?: ContainerAttachProps<OdspContainerAttachProps>): Promise<string>;

	/**
	 * Upload a blob of data.
	 * @param blob - The blob to upload to the ODSP service.
	 */
	uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>>;

	/**
	 * Serialize the container to a string representation. This can be saved for later rehydration.
	 */
	serialize(): string;
}

/**
 * OdspContainerServices is returned by the OdspClient alongside a FluidContainer. It holds the
 * functionality specifically tied to the ODSP service, and how the data stored in the
 * FluidContainer is persisted in the backend and consumed by users. Any functionality regarding
 * how the data is handled within the FluidContainer itself, i.e. which data objects or DDSes to
 * use, will not be included here but rather on the FluidContainer class itself.
 * @beta
 */
export interface OdspContainerServices extends IEventProvider<IOdspFluidContainerEvents> {
	/**
	 * Provides an object that facilitates obtaining information about users present in the Fluid session, as well as listeners for roster changes triggered by users joining or leaving the session.
	 */
	audience: IOdspAudience;

	/**
	 * Get the read-only information about the container.
	 *
	 * @remarks
	 *
	 * This is used to determine if the container is read-only or not.
	 * Read-only is undefined on disconnected containers.
	 */
	getReadOnlyState(): boolean | undefined;

	/**
	 * Disposes the container services.
	 */
	dispose(): void;

	/**
	 * Lookup the blob URL for a blob handle.
	 * @param handle - The blob handle to lookup the URL for
	 * @returns The blob URL if found and the blob is not pending, undefined otherwise
	 * @remarks
	 * This function provides access to blob URLs for handles.
	 * The URL may expire and does not support permalinks.
	 * For blobs with pending payloads, this returns undefined. Consumers should use
	 * the observability APIs on the handle (handle.payloadState, payloadShared event)
	 * to understand/wait for URL availability.
	 *
	 * **WARNING**: This API comes with strong warnings that the URL may expire
	 * and does not support permalinks.
	 */
	lookupTemporaryBlobURL<T>(handle: IFluidHandle<T>): string | undefined;
}

/**
 * Since ODSP provides user names and email for all of its members, we extend the
 * {@link @fluidframework/fluid-static#IMember} interface to include this service-specific value.
 * It will be returned for all audience members connected.
 * @beta
 */
export interface OdspMember extends IMember {
	/**
	 * The object ID (oid) for the user, unique among each individual user connecting to the session.
	 */
	id: string;
	/**
	 * The user's name
	 */
	name: string;
	/**
	 * The user's email
	 */
	email: string;
}

/**
 * Audience object for ODSP containers
 * @beta
 */
export type IOdspAudience = IServiceAudience<OdspMember>;

/**
 * Represents token response
 * @beta
 */
export interface TokenResponse {
	/**
	 * Token value
	 */
	token: string;

	/**
	 * Whether or not the token was obtained from local cache.
	 * @remarks `undefined` indicates that it could not be determined whether or not the token was obtained this way.
	 */
	fromCache?: boolean;
}
