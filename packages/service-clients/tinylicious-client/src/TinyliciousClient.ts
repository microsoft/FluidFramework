/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachState } from "@fluidframework/container-definitions";
import type {
	IContainer,
	IFluidModuleWithDetails,
} from "@fluidframework/container-definitions/internal";
import {
	createDetachedContainer,
	loadExistingContainer,
	type ILoaderProps,
} from "@fluidframework/container-loader/internal";
import type { ConfigTypes, ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import type { IClient } from "@fluidframework/driver-definitions";
import type {
	IDocumentServiceFactory,
	IUrlResolver,
} from "@fluidframework/driver-definitions/internal";
import type {
	ContainerSchema,
	IFluidContainer,
	// eslint-disable-next-line import-x/no-deprecated
	CompatibilityMode,
} from "@fluidframework/fluid-static";
import {
	createDOProviderContainerRuntimeFactory,
	createFluidContainer,
	createServiceAudience,
	resolveCompatibilityModeToMinVersionForCollab,
} from "@fluidframework/fluid-static/internal";
import { RouterliciousDocumentServiceFactory } from "@fluidframework/routerlicious-driver/internal";
import type { MinimumVersionForCollab } from "@fluidframework/runtime-definitions";
import { wrapConfigProviderWithDefaults } from "@fluidframework/telemetry-utils/internal";
import {
	InsecureTinyliciousTokenProvider,
	InsecureTinyliciousUrlResolver,
	createTinyliciousCreateNewRequest,
} from "@fluidframework/tinylicious-driver/internal";

import { createTinyliciousAudienceMember } from "./TinyliciousAudience.js";
import type { TinyliciousClientProps, TinyliciousContainerServices } from "./interfaces.js";

/**
 * Provides the ability to have a Fluid object backed by a Tinylicious service.
 *
 * @see {@link https://fluidframework.com/docs/testing/tinylicious/}
 *
 * @sealed
 * @public
 */
export class TinyliciousClient {
	private readonly documentServiceFactory: IDocumentServiceFactory;
	private readonly urlResolver: IUrlResolver;
	private readonly logger: ITelemetryBaseLogger | undefined;

	/**
	 * Creates a new client instance using configuration parameters.
	 * @param properties - Optional. Properties for initializing a new TinyliciousClient instance
	 */
	public constructor(properties?: TinyliciousClientProps) {
		this.logger = properties?.logger;
		const tokenProvider = new InsecureTinyliciousTokenProvider();
		this.urlResolver = new InsecureTinyliciousUrlResolver(
			properties?.connection?.port,
			properties?.connection?.domain,
		);
		this.documentServiceFactory = new RouterliciousDocumentServiceFactory(
			properties?.connection?.tokenProvider ?? tokenProvider,
		);
	}

	/**
	 * Creates a new detached container instance in Tinylicious server.
	 * @param containerSchema - Container schema for the new container.
	 * @param minVersionForCollab - Minimum framework version required for collaboration, as a
	 * `MinimumVersionForCollab` semver string (e.g. `"1.0.0"`, `"2.0.0"`).
	 * @returns New detached container instance along with associated services.
	 */
	public async createContainer<TContainerSchema extends ContainerSchema>(
		containerSchema: TContainerSchema,
		minVersionForCollab: MinimumVersionForCollab,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: TinyliciousContainerServices;
	}>;
	/**
	 * Creates a new detached container instance in Tinylicious server.
	 * @param containerSchema - Container schema for the new container.
	 * @param compatibilityMode - Legacy {@link @fluidframework/fluid-static#CompatibilityMode} value.
	 * @returns New detached container instance along with associated services.
	 * @deprecated Pass a `MinimumVersionForCollab` semver string (e.g. `"2.0.0"`) instead. The legacy
	 * values `"1"` and `"2"` correspond to `"1.0.0"` and `"2.0.0"` respectively.
	 */
	public async createContainer<TContainerSchema extends ContainerSchema>(
		containerSchema: TContainerSchema,
		// eslint-disable-next-line import-x/no-deprecated
		compatibilityMode: CompatibilityMode,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: TinyliciousContainerServices;
	}>;
	public async createContainer<TContainerSchema extends ContainerSchema>(
		containerSchema: TContainerSchema,
		// eslint-disable-next-line import-x/no-deprecated
		compatibilityMode: MinimumVersionForCollab | CompatibilityMode,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: TinyliciousContainerServices;
	}> {
		const loaderProps = this.getLoaderProps(
			containerSchema,
			resolveCompatibilityModeToMinVersionForCollab(compatibilityMode),
		);

		// We're not actually using the code proposal (our code loader always loads the same module
		// regardless of the proposal), but the Container will only give us a NullRuntime if there's
		// no proposal.  So we'll use a fake proposal.
		const container = await createDetachedContainer({
			...loaderProps,
			codeDetails: {
				package: "no-dynamic-package",
				config: {},
			},
		});

		/**
		 * See {@link FluidContainer.attach}
		 */
		const attach = async (): Promise<string> => {
			if (container.attachState !== AttachState.Detached) {
				throw new Error("Cannot attach container. Container is not in detached state.");
			}
			const request = createTinyliciousCreateNewRequest();
			await container.attach(request);
			if (container.resolvedUrl === undefined) {
				throw new Error("Resolved Url not available on attached container");
			}
			return container.resolvedUrl.id;
		};

		const fluidContainer = await createFluidContainer<TContainerSchema>({
			container,
		});
		fluidContainer.attach = attach;

		const services = this.getContainerServices(container);
		return { container: fluidContainer, services };
	}

	/**
	 * Accesses the existing container given its unique ID in the tinylicious server.
	 * @param id - Unique ID of the container.
	 * @param containerSchema - Container schema used to access data objects in the container.
	 * @param minVersionForCollab - Minimum Fluid Framework version required for collaboration, as a
	 * `MinimumVersionForCollab` semver string (e.g. `"1.0.0"`, `"2.0.0"`).
	 * @returns Existing container instance along with associated services.
	 */
	public async getContainer<TContainerSchema extends ContainerSchema>(
		id: string,
		containerSchema: TContainerSchema,
		minVersionForCollab: MinimumVersionForCollab,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: TinyliciousContainerServices;
	}>;
	/**
	 * Accesses the existing container given its unique ID in the tinylicious server.
	 * @param id - Unique ID of the container.
	 * @param containerSchema - Container schema used to access data objects in the container.
	 * @param compatibilityMode - Legacy {@link @fluidframework/fluid-static#CompatibilityMode} value.
	 * @returns Existing container instance along with associated services.
	 * @deprecated Pass a `MinimumVersionForCollab` semver string (e.g. `"2.0.0"`) instead. The legacy
	 * values `"1"` and `"2"` correspond to `"1.0.0"` and `"2.0.0"` respectively.
	 */
	public async getContainer<TContainerSchema extends ContainerSchema>(
		id: string,
		containerSchema: TContainerSchema,
		// eslint-disable-next-line import-x/no-deprecated
		compatibilityMode: CompatibilityMode,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: TinyliciousContainerServices;
	}>;
	public async getContainer<TContainerSchema extends ContainerSchema>(
		id: string,
		containerSchema: TContainerSchema,
		// eslint-disable-next-line import-x/no-deprecated
		compatibilityMode: MinimumVersionForCollab | CompatibilityMode,
	): Promise<{
		container: IFluidContainer<TContainerSchema>;
		services: TinyliciousContainerServices;
	}> {
		const loaderProps = this.getLoaderProps(
			containerSchema,
			resolveCompatibilityModeToMinVersionForCollab(compatibilityMode),
		);
		const container = await loadExistingContainer({ ...loaderProps, request: { url: id } });
		const fluidContainer = await createFluidContainer<TContainerSchema>({
			container,
		});
		const services = this.getContainerServices(container);
		return { container: fluidContainer, services };
	}

	// #region private
	private getContainerServices(container: IContainer): TinyliciousContainerServices {
		return {
			audience: createServiceAudience({
				container,
				createServiceMember: createTinyliciousAudienceMember,
			}),
		};
	}

	private getLoaderProps(
		schema: ContainerSchema,
		minVersionForCollab: MinimumVersionForCollab,
	): ILoaderProps {
		const containerRuntimeFactory = createDOProviderContainerRuntimeFactory({
			schema,
			compatibilityMode: minVersionForCollab,
		});
		const load = async (): Promise<IFluidModuleWithDetails> => {
			return {
				module: { fluidExport: containerRuntimeFactory },
				details: { package: "no-dynamic-package", config: {} },
			};
		};

		const codeLoader = { load };
		const client: IClient = {
			details: {
				capabilities: { interactive: true },
			},
			permission: [],
			scopes: [],
			user: { id: "" },
			mode: "write",
		};

		const featureGates: Record<string, ConfigTypes> = {
			// T9s client requires a write connection by default
			"Fluid.Container.ForceWriteConnection": true,
		};
		const loaderProps = {
			urlResolver: this.urlResolver,
			documentServiceFactory: this.documentServiceFactory,
			codeLoader,
			logger: this.logger,
			options: { client },
			configProvider: wrapConfigProviderWithDefaults(/* original */ undefined, featureGates),
		};

		return loaderProps;
	}
	// #endregion
}
