/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ILayerCompatDetails } from "@fluid-internal/client-utils";
import type {
	AttachState,
	ConnectionStatus,
	ICodeDetailsLoader,
	IContainerContext,
	IFluidCodeDetails,
	IFluidModuleWithDetails,
	IGetPendingLocalStateProps,
	IRuntime,
	IRuntimeFactory,
} from "@fluidframework/container-definitions/internal";
import type { FluidObject } from "@fluidframework/core-interfaces";
import type {
	ISequencedDocumentMessage,
	ISummaryTree,
} from "@fluidframework/driver-definitions/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { loaderCoreCompatDetails } from "./loaderLayerCompatState.js";

/**
 * A minimal, no-op {@link @fluidframework/container-definitions#IRuntime} implementation.
 *
 * @remarks
 * This runtime exists to give a host the full set of {@link @fluidframework/container-definitions#IContainer}
 * capabilities (connect, attach, storage, quorum, audience, etc.) without wiring up a real container runtime.
 *
 * Nearly every member is a no-op, and it crucially never invokes any of the `submit*` callbacks on the
 * {@link @fluidframework/container-definitions#IContainerContext} it is given, so it can never send an op or a signal.
 * It has no content, so {@link EmptyRuntime.createSummary} throws; and {@link EmptyRuntime.getPendingLocalState}
 * simply echoes back whatever pending state was provided on the context.
 */
class EmptyRuntime implements IRuntime {
	/**
	 * Advertise compatibility with the Loader layer so the runtime/loader compatibility check passes cleanly.
	 * The generation is borrowed from the Loader itself, which trivially satisfies the Loader's requirements.
	 */
	public readonly ILayerCompatDetails: ILayerCompatDetails = {
		...loaderCoreCompatDetails,
		supportedFeatures: new Set<string>(),
	};

	private _disposed = false;

	public constructor(private readonly pendingLocalState: unknown) {}

	public get disposed(): boolean {
		return this._disposed;
	}

	public dispose(_error?: Error): void {
		this._disposed = true;
	}

	public setConnectionState(_canSendOps: boolean, _clientId?: string): void {}

	public setConnectionStatus(_status: ConnectionStatus): void {}

	public process(_message: ISequencedDocumentMessage, _local: boolean): void {}

	public processSignal(_message: unknown, _local: boolean): void {}

	public createSummary(_blobRedirectTable?: Map<string, string>): ISummaryTree {
		throw new UsageError("EmptyRuntime has no content and does not support summarization");
	}

	public setAttachState(_attachState: AttachState.Attaching | AttachState.Attached): void {}

	public getPendingLocalState(_props?: IGetPendingLocalStateProps): unknown {
		return this.pendingLocalState;
	}

	public async notifyOpReplay(_message: ISequencedDocumentMessage): Promise<void> {}

	public async getEntryPoint(): Promise<FluidObject> {
		return {};
	}

	public close(): void {}
}

/**
 * An {@link @fluidframework/container-definitions#IRuntimeFactory} that only ever produces {@link EmptyRuntime}s.
 */
class EmptyRuntimeFactory implements IRuntimeFactory {
	public get IRuntimeFactory(): IRuntimeFactory {
		return this;
	}

	public async instantiateRuntime(
		context: IContainerContext,
		_existing: boolean,
	): Promise<IRuntime> {
		return new EmptyRuntime(context.pendingLocalState);
	}
}

/**
 * Creates an {@link @fluidframework/container-definitions#ICodeDetailsLoader} whose loaded module produces an empty,
 * no-op container runtime.
 *
 * @remarks
 * Use this when you need the capabilities of an {@link @fluidframework/container-definitions#IContainer} (for example
 * to load, connect to, or serialize the pending state of a container) but do not want or need a real container
 * runtime. The runtime produced by this loader does almost nothing: it ignores all incoming ops and signals and,
 * most importantly, never sends any ops or signals of its own. Because it has no content, it does not support
 * summarization (attaching or serializing the container summary will throw).
 *
 * @legacy @alpha
 */
export function createEmptyRuntimeCodeLoader(): ICodeDetailsLoader {
	const factory = new EmptyRuntimeFactory();
	return {
		load: async (source: IFluidCodeDetails): Promise<IFluidModuleWithDetails> => {
			return {
				module: { fluidExport: { IRuntimeFactory: factory } },
				details: source,
			};
		},
	};
}
