/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import {
	type IConfigProviderBase,
	type ITelemetryBaseLogger,
} from "@fluidframework/core-interfaces";
import { type IMember, type IServiceAudience } from "@fluidframework/fluid-static";
import { type IUser } from "@fluidframework/protocol-definitions";
import { type ITokenProvider } from "@fluidframework/routerlicious-driver";
import { type ICompressionStorageConfig } from "@fluidframework/driver-utils";

/**
 * Props for initializing a new AzureClient instance
 * @public
 */
export interface AzureClientProps {
	/**
	 * Configuration for establishing a connection with the Azure Fluid Relay.
	 */
	readonly connection: AzureRemoteConnectionConfig | AzureLocalConnectionConfig;
	/**
	 * Optional. A logger instance to receive diagnostic messages.
	 */
	readonly logger?: ITelemetryBaseLogger;

	/**
	 * Base interface for providing configurations to control experimental features. If unsure, leave this undefined.
	 */
	readonly configProvider?: IConfigProviderBase;

	readonly summaryCompression?: boolean | ICompressionStorageConfig;
}

/**
 * Container version metadata.
 * @public
 */
export interface AzureContainerVersion {
	/**
	 * Version ID
	 */
	id: string;

	/**
	 * Time when version was generated.
	 * ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ
	 */
	date?: string;
}

/**
 * Options for "Get Container Versions" API.
 * @public
 */
export interface AzureGetVersionsOptions {
	/**
	 * Max number of versions
	 */
	maxCount: number;
}

/**
 * The type of connection.
 *
 * - "local" for local connections to a Fluid relay instance running on the localhost
 *
 * - "remote" for client connections to the Azure Fluid Relay service
 * @public
 */
export type AzureConnectionConfigType = "local" | "remote";

/**
 * Parameters for establishing a connection with the Azure Fluid Relay.
 * @public
 */
export interface AzureConnectionConfig {
	/**
	 * The type of connection. Whether we're connecting to a remote Fluid relay server or a local instance.
	 */
	type: AzureConnectionConfigType;
	/**
	 * URI to the Azure Fluid Relay service discovery endpoint.
	 */
	endpoint: string;
	/**
	 * Instance that provides Azure Fluid Relay endpoint tokens.
	 */
	tokenProvider: ITokenProvider;
}

/**
 * Parameters for establishing a remote connection with the Azure Fluid Relay.
 * @public
 */
export interface AzureRemoteConnectionConfig extends AzureConnectionConfig {
	/**
	 * The type of connection. Set to a remote connection.
	 */
	type: "remote";
	/**
	 * Unique tenant identifier.
	 */
	tenantId: string;
}

/**
 * Parameters for establishing a local connection with a local instance of the Azure Fluid Relay.
 * @public
 */
export interface AzureLocalConnectionConfig extends AzureConnectionConfig {
	/**
	 * The type of connection. Set to a remote connection.
	 */
	type: "local";
}

/**
 * Holds the functionality specifically tied to the Azure Fluid Relay, and how the data stored in
 * the FluidContainer is persisted in the backend and consumed by users.
 *
 * @remarks
 *
 * Returned by the {@link AzureClient} alongside a {@link @fluidframework/fluid-static#FluidContainer}.
 *
 * Any functionality regarding how the data is handled within the FluidContainer itself, i.e. which data objects
 * or DDSes to use, will not be included here but rather on the FluidContainer class itself.
 * @public
 */
export interface AzureContainerServices {
	/**
	 * Provides an object that can be used to get the users that are present in this Fluid session and
	 * listeners for when the roster has any changes from users joining/leaving the session
	 */
	audience: IAzureAudience;
}

/**
 * Since Azure provides user names for all of its members, we extend the
 * {@link @fluidframework/protocol-definitions#IUser} interface to include this service-specific value.
 *
 * @typeParam T - See {@link AzureUser.additionalDetails}.
 * Note: must be JSON-serializable.
 * Passing a non-serializable object (e.g. a `class`) will result in undefined behavior.
 * @internal
 */
// TODO: this should be updated to use something other than `any` (unknown)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AzureUser<T = any> extends IUser {
	/**
	 * The user's name
	 */
	name: string;

	/**
	 * Custom, app-specific user information
	 */
	additionalDetails?: T;
}

/**
 * Since Azure provides user names for all of its members, we extend the
 * {@link @fluidframework/protocol-definitions#IMember} interface to include this service-specific value.
 * It will be returned for all audience members connected to Azure.
 *
 * @typeParam T - See {@link AzureMember.additionalDetails}.
 * Note: must be JSON-serializable.
 * Passing a non-serializable object (e.g. a `class`) will result in undefined behavior.
 * @public
 */
// TODO: this should be updated to use something other than `any` (unknown)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AzureMember<T = any> extends IMember {
	/**
	 * {@inheritDoc AzureUser.name}
	 */
	userName: string;

	/**
	 * {@inheritDoc AzureUser.additionalDetails}
	 */
	additionalDetails?: T;
}

/**
 * Audience object for Azure Fluid Relay containers
 * @public
 */
export type IAzureAudience = IServiceAudience<AzureMember>;
