/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	IContainerContext,
	IRuntime,
} from "@fluidframework/container-definitions/internal";
import { loadContainerRuntimeAlpha } from "@fluidframework/container-runtime/internal";
import type { IContainerRuntime } from "@fluidframework/container-runtime-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
import {
	// eslint-disable-next-line import-x/no-deprecated
	buildRuntimeRequestHandler,
} from "@fluidframework/request-handler/internal";
import type { IStagingController } from "@fluidframework/runtime-definitions/internal";
import {
	DependencyContainer,
	type IProvideFluidDependencySynthesizer,
} from "@fluidframework/synthesize/internal";

import {
	BaseContainerRuntimeFactory,
	type BaseContainerRuntimeFactoryProps,
} from "./baseContainerRuntimeFactory.js";

/**
 * Alpha variant of {@link BaseContainerRuntimeFactory} that additionally provides
 * a {@link @fluidframework/runtime-definitions#IStagingController | staging controller}
 * for managing staging mode.
 *
 * @legacy @alpha
 */
export class BaseContainerRuntimeFactoryAlpha extends BaseContainerRuntimeFactory {
	private readonly alphaProps: BaseContainerRuntimeFactoryProps;

	/**
	 * Controller for managing staging mode across the container's lifetime.
	 *
	 * @remarks
	 * This is available after {@link BaseContainerRuntimeFactoryAlpha.preInitialize} has been called.
	 * It is the exclusive interface for entering/exiting staging mode.
	 */
	public stagingController!: IStagingController;

	public constructor(props: BaseContainerRuntimeFactoryProps) {
		super(props);
		this.alphaProps = props;
	}

	public async preInitialize(
		context: IContainerContext,
		existing: boolean,
	): Promise<IContainerRuntime & IRuntime> {
		const scope: Partial<IProvideFluidDependencySynthesizer> = context.scope;
		if (this.alphaProps.dependencyContainer) {
			const dc = new DependencyContainer<FluidObject>(
				this.alphaProps.dependencyContainer,
				scope.IFluidDependencySynthesizer,
			);
			scope.IFluidDependencySynthesizer = dc;
		}

		const { runtime, stagingController } = await loadContainerRuntimeAlpha({
			context,
			existing,
			runtimeOptions: this.alphaProps.runtimeOptions,
			registryEntries: this.alphaProps.registryEntries,
			containerScope: scope,
			// eslint-disable-next-line import-x/no-deprecated
			requestHandler: buildRuntimeRequestHandler(...(this.alphaProps.requestHandlers ?? [])),
			provideEntryPoint: this.alphaProps.provideEntryPoint,
			minVersionForCollab: this.alphaProps.minVersionForCollab,
		});
		this.stagingController = stagingController;
		return runtime;
	}
}
