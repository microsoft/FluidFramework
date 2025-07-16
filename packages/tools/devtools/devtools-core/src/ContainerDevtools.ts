/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";

import { BaseDevtools } from "./BaseDevtools.js";
import type { HasContainerKey } from "./CommonInterfaces.js";
import type { ContainerStateMetadata } from "./ContainerMetadata.js";
import type { ContainerDevtoolsFeatureFlags } from "./Features.js";
import {
	CloseContainer,
	ConnectContainer,
	DisconnectContainer,
	type InboundHandlers,
} from "./messaging/index.js";

/**
 * Properties for registering a {@link @fluidframework/container-definitions#IContainer} with the Devtools.
 * @alpha
 */
export interface ContainerDevtoolsProps extends HasContainerKey {
	/**
	 * The Container to register with the Devtools.
	 */
	container: IContainer;

	/**
	 * (optional) Distributed Data Structures (DDSs) associated with the
	 * {@link ContainerDevtoolsProps.container | Container}.
	 *
	 * @remarks
	 *
	 * Providing this data will enable associated tooling to visualize the Fluid data reachable from the provided
	 * objects.
	 *
	 * Fluid DevTools will not mutate this data.
	 *
	 * @privateRemarks TODO: rename this to make it more clear that this data does not *belong* to the Container.
	 */
	containerData?: Record<string, IFluidLoadable>;

	// TODO: Add ability for customers to specify custom visualizer overrides
}

/**
 * {@link IContainerDevtools} implementation for real containers.
 *
 * @remarks
 *
 * This class listens to incoming messages from the window (globalThis), and posts messages to it upon relevant
 * state changes and when requested.
 *
 * **Messages it listens for (if the {@link HasContainerKey.containerKey} matches):**
 *
 * - {@link GetContainerDevtoolsFeatures.Message}: When received, {@link ContainerDevtoolsFeatures.Message} will be
 * posted in response.
 *
 * - {@link GetContainerState.Message}: When received, {@link ContainerStateChange.Message} will be posted in response.
 *
 * - {@link ConnectContainer.Message}: When received, {@link @fluidframework/container-definitions#IContainer.connect}
 * will be called on the {@link ContainerDevtools.container} (if it is disconnected).
 *
 * - {@link DisconnectContainer.Message}: When received, {@link @fluidframework/container-definitions#IContainer.disconnect}
 * will be called on the {@link ContainerDevtools.container} (if it is connected).
 *
 * - {@link CloseContainer.Message}: When received, {@link @fluidframework/container-definitions#IContainer.close}
 * will be called on the {@link ContainerDevtools.container}.
 *
 * - {@link GetAudienceSummary.Message}: When received, {@link AudienceSummary.Message} will be posted in response.
 *
 * - {@link GetRootDataVisualizations.Message}: When received, {@link RootDataVisualizations.Message} will be posted
 * in response.
 *
 * - {@link GetDataVisualization.Message}: When received, {@link DataVisualization.Message} will be posted in response.
 *
 * **Messages it posts:**
 *
 * - {@link ContainerDevtoolsFeatures.Message}: Posted only when requested via {@link GetContainerDevtoolsFeatures.Message}.
 *
 * - {@link AudienceSummary.Message}: Posted any time the Container's Audience state changes, or when requested
 * (via {@link GetAudienceSummary.Message}).
 *
 * - {@link ContainerStateChange.Message}: Posted any time relevant Container state changes,
 * or when requested (via {@link GetContainerState.Message}).
 *
 * - {@link RootDataVisualizations.Message}: Posted when requested via {@link GetRootDataVisualizations.Message}.
 *
 * - {@link DataVisualization.Message}: Posted when requested via {@link GetDataVisualization.Message}, or when
 * a change has occurred on the associated DDS, reachable from the visualization graph.
 *
 * @sealed
 */
export class ContainerDevtools extends BaseDevtools {
	/**
	 * The registered Container.
	 */
	protected override get container(): IContainer {
		return this._container;
	}

	private readonly _container: IContainer;

	public constructor(props: ContainerDevtoolsProps) {
		// Create specific message handlers for container operations
		const specificHandlers: InboundHandlers = {
			[ConnectContainer.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as ConnectContainer.Message;
				if (message.data.containerKey === props.containerKey) {
					props.container.connect();
					return true;
				}
				return false;
			},
			[DisconnectContainer.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as DisconnectContainer.Message;
				if (message.data.containerKey === props.containerKey) {
					props.container.disconnect(
						/* TODO: Specify devtools reason here once it is supported */
					);
					return true;
				}
				return false;
			},
			[CloseContainer.MessageType]: async (untypedMessage) => {
				const message = untypedMessage as CloseContainer.Message;
				if (message.data.containerKey === props.containerKey) {
					props.container.close(/* TODO: Specify devtools reason here once it is supported */);
					return true;
				}
				return false;
			},
		};

		super(props.containerKey, specificHandlers, props.containerData);

		this._container = props.container;

		// Bind container and audience events after container is set
		this.bindContainerEvents();
		this.bindAudienceEvents();
	}

	protected override getSupportedFeatures(): ContainerDevtoolsFeatureFlags {
		return {
			containerDataVisualization: this.containerData !== undefined,
			// Containers support all connection and lifecycle state operations
			canModifyContainerState: true,
		};
	}

	protected override getContainerState(): ContainerStateMetadata {
		const clientId = this.container.clientId;
		return {
			containerKey: this.containerKey,
			attachState: this.container.attachState,
			connectionState: this.container.connectionState,
			closed: this.container.closed,
			clientId: this.container.clientId,
			userId: clientId === undefined ? undefined : this.audience.getMember(clientId)?.user.id,
		};
	}
}
