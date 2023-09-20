/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import { IMember, IServiceAudience } from "@fluidframework/fluid-static";
import { IUser } from "@fluidframework/protocol-definitions";
import { ITokenProvider } from "@fluidframework/routerlicious-driver";
import { IConfigProviderBase } from "@fluidframework/telemetry-utils";
import { ICompressionStorageConfig } from "@fluidframework/driver-utils";

// Re-export so developers can build loggers without pulling in core-interfaces
export { ITelemetryBaseEvent, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";

/**
 * Props for initializing a new AzureClient instance.
 *
 * @example
 * ```typescript
 * const clientProps: AzureClientProps = {
 *   connection: { type: "remote", endpoint: "https://example.com", tokenProvider },
 *   logger: myLogger,
 * };
 * ```
 * @public
 */
export interface AzureClientProps {
	/**
	 * Configuration for establishing a connection with the Azure Fluid Relay.
	 */
	readonly connection: AzureRemoteConnectionConfig | AzureLocalConnectionConfig;

	/**
	 * @remarks
	 * Optional. A logger instance to receive diagnostic messages.
	 *
	 * @defaultValue
	 * No logging is done if not provided.
	 */
	readonly logger?: ITelemetryBaseLogger;

	/**
	 * Base interface for providing configurations to control experimental features. If unsure, leave this undefined.
	 *
	 * @defaultValue
	 * None. Experimental features will not be enabled if not provided.
	 */
	readonly configProvider?: IConfigProviderBase;

	/**
	 * Determines if summary compression should be enabled.
	 *
	 * @defaultValue
	 * false. Summary compression is disabled by default.
	 */
	readonly summaryCompression?: boolean | ICompressionStorageConfig;
}

/**
 * Container version metadata.
 *
 * @see {@link AzureClient.getContainerVersions} for more information.
 * @example
 * ```typescript
 * const version: AzureContainerVersion = {
 *   id: "v1.0.0",
 *   date: "2023-01-01T00:00:00Z",
 * };
 * ```
 * @public
 */
export interface AzureContainerVersion {
	/**
	 * Version ID that uniquely identifies a container version.
	 */
	id: string;

	/**
	 * Time when version was generated in ISO 8601 format: YYYY-MM-DDTHH:MM:SSZ.
	 */
	date?: string;
}

/**
 * Options for the "Get Container Versions" API.
 *
 * @example
 * ```typescript
 * const options: AzureGetVersionsOptions = {
 *   maxCount: 10,
 * };
 * ```
 * @public
 */
export interface AzureGetVersionsOptions {
	/**
	 * @remarks
	 * The maximum number of versions to retrieve.
	 *
	 * @defaultValue
	 * None. You must specify the maxCount.
	 */
	maxCount: number;
}

/**
 * The type of connection.
 * - "local" for local connections to a Fluid relay instance running on the localhost.
 * - "remote" for client connections to the Azure Fluid Relay service.
 *
 * @example
 * ```typescript
 * const connectionType: AzureConnectionConfigType = "local";
 * ```
 * @public
 */
export type AzureConnectionConfigType = "local" | "remote";

/**
 * Parameters for establishing a connection with the Azure Fluid Relay.
 *
 * @example
 * ```typescript
 * const config: AzureConnectionConfig = {
 *   type: "remote",
 *   endpoint: "https://example.com",
 *   tokenProvider,
 * };
 * ```
 * @public
 */
export interface AzureConnectionConfig {
	/**
	 * The type of connection. Determines if connecting to a remote Fluid relay server or a local instance.
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
 * AzureContainerServices is returned by the AzureClient alongside a FluidContainer.
 * It holds the functionality specifically tied to the Azure Fluid Relay, and how the data stored in
 * the FluidContainer is persisted in the backend and consumed by users. Any functionality regarding
 * how the data is handled within the FluidContainer itself, i.e. which data objects or DDSes to use,
 * will not be included here but rather on the FluidContainer class itself.
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
 * {@link @fluidframework/protocol-definitions#IUser} interface to include this service-specific value. *
 *
 * @typeParam T - See {@link AzureUser.additionalDetails}.
 * @remarks
 * Must be JSON-serializable.
 * Passing a non-serializable object (e.g. a `class`) will result in undefined behavior.
 * @throws Will throw an error if `additionalDetails` is not JSON-serializable.
 * @public
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
 * @remarks
 * Must be JSON-serializable.
 * Passing a non-serializable object (e.g. a `class`) will result in undefined behavior.
 * @throws Will throw an error if `additionalDetails` is not JSON-serializable.
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

/**
 * Test API with comprehensive TSDoc documentation.
 *
 * @remarks
 * This API is designed to showcase all possible features of TSDoc and API Extractor.
 *
 * @defaultValue 'N/A'
 * @decorator TEST
 * @deprecated Use another API instead.
 * @eventProperty
 * @example
 * ```typescript
 * const result = testTSDocBellsAndWhistles<string>();
 * ```
 * @example
 * ```javascript
 * const result = testTSDocBellsAndWhistles();
 * ```
 *
 * @see {@link https://example.com | Example URL}
 * @override
 * @packageDocumentation
 * @param param1 - Description of the first parameter.
 * @privateRemarks
 * This is private and should not appear in public documentation.
 * @readonly
 * @returns Does not return anything.
 * @sealed
 * @see {@link https://example.com | Another Example URL}
 * @throws Throws an error if something goes wrong.
 * @typeParam T - A generic type parameter.
 * @experimental
 * @virtual
 *
 * Release Tags choose one
 * @alpha
 * \@beta
 * \@internal
 * \@public
 */
export interface testTSDocBellsAndWhistles<T = unknown> {
	bell: string;
}
