/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ReadonlyJsonTypeWith } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import {
	copyChannelConfiguration,
	copyChannelConfigurationSnapshot,
	parseConfiguredChannelMessage,
	type ChannelConfigurationMessageV1,
} from "./channelConfigurationFormat.js";

/**
 * Bounds detached configuration before a service advertises its limit.
 * This is not a service capability; published submissions use the runtime's actual limit.
 */
const unpublishedConfigurationMaxMessageSize = 16 * 1024;

/**
 * An immutable JSON property bag without handles.
 * @internal
 */
export type ChannelConfiguration = Readonly<Record<string, ReadonlyJsonTypeWith<never>>>;

/**
 * Authoritative configuration at one point in a channel's history.
 * @internal
 */
export interface ChannelConfigurationSnapshot<
	TConfig extends ChannelConfiguration = ChannelConfiguration,
> {
	readonly version: 1;
	readonly revision: number;
	readonly values: TConfig;
}

/**
 * Reader support and deterministic transition validation, independent of creation defaults.
 * @internal
 */
export interface ChannelConfigurationDefinition<TConfig extends ChannelConfiguration> {
	/**
	 * Rejects unknown keys and values this reader cannot support. Must be pure.
	 */
	readonly isSupported: (values: ChannelConfiguration) => values is TConfig;
	/**
	 * Throws if the transition cannot preserve existing DDS data. Must be pure and deterministic.
	 */
	readonly validateTransition: (previous: TConfig, next: TConfig) => void;
}

/**
 * The stream position of a sequenced configuration proposal.
 * @internal
 */
export interface ChannelConfigurationSequencedContext {
	readonly source: "sequenced";
	readonly sequenceNumber: number;
	readonly clientSequenceNumber: number;
	/**
	 * Logical position within the delivered collection; sequence numbers can be shared.
	 * This index is delivery-local, can differ after stash reconstruction, and must not
	 * be persisted as a barrier identity.
	 * Use the channel configuration revision to identify an accepted barrier.
	 */
	readonly messageIndex: number;
	readonly local: boolean;
}

/**
 * A final, unpublished local change has no service sequence information.
 * @internal
 */
export interface ChannelConfigurationLocalContext {
	readonly source: "local";
	readonly local: true;
}

/**
 * Identifies local authority or the actual sequenced barrier.
 * @internal
 */
export type ChannelConfigurationContext =
	| ChannelConfigurationLocalContext
	| ChannelConfigurationSequencedContext;

/**
 * A synchronous notification after the authoritative snapshot is replaced.
 * @internal
 */
export type ChannelConfigurationChange<TConfig extends ChannelConfiguration> = {
	readonly previous: ChannelConfigurationSnapshot<TConfig>;
	readonly current: ChannelConfigurationSnapshot<TConfig>;
} & ChannelConfigurationContext;

/**
 * The snapshot when a proposal completes, not necessarily when its promise continuation runs.
 * @internal
 */
export type ConfigurationChangeResult<TConfig extends ChannelConfiguration> =
	| ({
			readonly status: "applied";
			readonly current: ChannelConfigurationSnapshot<TConfig>;
	  } & ChannelConfigurationContext)
	| ({
			readonly status: "conflict";
			readonly current: ChannelConfigurationSnapshot<TConfig>;
	  } & ChannelConfigurationSequencedContext);

/**
 * Compositional configuration API supplied before a kernel is constructed.
 * @internal
 */
export interface ChannelConfigurationFacet<TConfig extends ChannelConfiguration> {
	readonly current: ChannelConfigurationSnapshot<TConfig>;
	requestChange(next: TConfig): Promise<ConfigurationChangeResult<TConfig>>;
	on(event: "changed", listener: (change: ChannelConfigurationChange<TConfig>) => void): void;
	off(event: "changed", listener: (change: ChannelConfigurationChange<TConfig>) => void): void;
}

/**
 * Lifecycle and transport supplied by the shared wrapper.
 * @internal
 */
export interface ChannelConfigurationControllerOptions<TConfig extends ChannelConfiguration> {
	readonly definition: ChannelConfigurationDefinition<TConfig>;
	readonly snapshot: unknown;
	readonly source: "create" | "load";
	readonly isPublished: () => boolean;
	readonly verifyCanChange: () => void;
	readonly submit: (message: ChannelConfigurationMessageV1, localOpMetadata: unknown) => void;
	/**
	 * Maximum serialized submission size in bytes, supplied by the runtime.
	 * When this returns zero or undefined for an unpublished channel, use a conservative
	 * 16 KiB bound without waiting for a connection. Other invalid limits are rejected.
	 * Published submissions require a valid runtime limit.
	 * This client-local limit does not constrain loaded snapshots, sequenced messages,
	 * or stashed-op capture.
	 */
	readonly maxMessageSize: () => number | undefined;
}

interface PendingChange<TConfig extends ChannelConfiguration> {
	readonly resolve: (result: ConfigurationChangeResult<TConfig>) => void;
	readonly reject: (error: unknown) => void;
}

/**
 * Shared compare-and-swap state and local request completion tracking.
 * Published proposals are never activated before sequencing.
 * @internal
 */
export class ChannelConfigurationController<TConfig extends ChannelConfiguration>
	implements ChannelConfigurationFacet<TConfig>
{
	private snapshot: ChannelConfigurationSnapshot<TConfig>;
	private readonly listeners = new Set<
		(change: ChannelConfigurationChange<TConfig>) => void
	>();
	private readonly pending = new Map<unknown, PendingChange<TConfig>>();
	private disposed = false;
	private disposalError: unknown;
	private processing = false;

	public constructor(
		private readonly options: ChannelConfigurationControllerOptions<TConfig>,
	) {
		const snapshot = copyChannelConfigurationSnapshot(options.snapshot);
		if (options.source === "create") {
			this.checkSize(snapshot);
		}
		this.validateSupported(snapshot.values);
		this.snapshot = Object.freeze({ ...snapshot, values: snapshot.values });
	}

	public get current(): ChannelConfigurationSnapshot<TConfig> {
		return this.snapshot;
	}

	/**
	 * Captures the revision and replacement synchronously. Unpublished changes also apply
	 * synchronously; published changes complete only after their sequenced outcome.
	 */
	public async requestChange(next: TConfig): Promise<ConfigurationChangeResult<TConfig>> {
		this.verifyCanSubmit();
		this.options.verifyCanChange();
		const previous = this.snapshot;
		const values = copyChannelConfiguration(next);
		const message = Object.freeze({
			version: 1,
			kind: "configuration",
			expectedRevision: previous.revision,
			values,
		} as const);
		this.checkSize(message);
		this.processing = true;
		try {
			this.validateSupported(values);
			this.checkOverflow();
			this.options.definition.validateTransition(previous.values, values);
		} finally {
			this.processing = false;
		}
		this.verifyCanSubmit();
		if (!this.options.isPublished()) {
			this.processing = true;
			try {
				return this.apply(values, { source: "local", local: true });
			} catch (error) {
				this.dispose(error);
				throw error;
			} finally {
				this.processing = false;
			}
		}
		return new Promise<ConfigurationChangeResult<TConfig>>((resolve, reject) => {
			const metadata = Object.freeze({});
			this.pending.set(metadata, { resolve, reject });
			try {
				this.options.submit(message, metadata);
			} catch (error) {
				this.pending.delete(metadata);
				reject(
					error instanceof Error
						? error
						: new UsageError("Failed to submit channel configuration"),
				);
			}
		});
	}

	public on(
		event: "changed",
		listener: (change: ChannelConfigurationChange<TConfig>) => void,
	): void {
		this.listeners.add(listener);
	}

	public off(
		event: "changed",
		listener: (change: ChannelConfigurationChange<TConfig>) => void,
	): void {
		this.listeners.delete(listener);
	}

	/**
	 * Processes exactly one configuration envelope before the next ordinary DDS message.
	 * Receive-side failures are fatal and reject all outstanding requests.
	 */
	public process(
		content: unknown,
		context: ChannelConfigurationSequencedContext,
		localOpMetadata?: unknown,
	): ConfigurationChangeResult<TConfig> {
		try {
			this.verifyCanSubmit();
			this.processing = true;
			const message = this.readConfigurationMessage(content);
			if (message.expectedRevision > this.snapshot.revision) {
				throw new UsageError("Channel configuration proposal has a future revision");
			}
			let result: ConfigurationChangeResult<TConfig>;
			if (message.expectedRevision < this.snapshot.revision) {
				result = Object.freeze({ ...context, status: "conflict", current: this.snapshot });
			} else {
				const values = copyChannelConfiguration(message.values);
				this.validateSupported(values);
				this.checkOverflow();
				this.options.definition.validateTransition(this.snapshot.values, values);
				result = this.apply(values, context);
			}
			if (context.local) {
				const pending = this.pending.get(localOpMetadata);
				this.pending.delete(localOpMetadata);
				pending?.resolve(result);
			}
			return result;
		} catch (error) {
			this.dispose(error);
			throw error;
		} finally {
			this.processing = false;
		}
	}

	/**
	 * Resubmits unchanged compare-and-swap intent, without interpreting it against newer state.
	 */
	public reSubmit(content: unknown, localOpMetadata: unknown): void {
		this.verifyCanSubmit();
		try {
			const message = this.copyProposal(content);
			this.checkSize(message);
			this.options.submit(message, localOpMetadata);
		} catch (error) {
			this.dispose(error);
			throw error;
		}
	}

	/**
	 * Reconstructs restored intent through the runtime's stashed-op submission capture,
	 * without activating it or recreating process-local promises.
	 * The wrapper must call this during stashed-op capture, not ordinary submission.
	 */
	public applyStashedOp(content: unknown): void {
		this.verifyCanSubmit();
		try {
			this.options.submit(this.copyProposal(content), undefined);
		} catch (error) {
			this.dispose(error);
			throw error;
		}
	}

	/**
	 * Cancels an unsent staged proposal without changing authoritative configuration.
	 */
	public rollback(localOpMetadata: unknown): void {
		const pending = this.pending.get(localOpMetadata);
		this.pending.delete(localOpMetadata);
		pending?.reject(new UsageError("Channel configuration request was rolled back"));
	}

	/**
	 * Rejects live promises. Rejection does not assert that uncertain delivery cannot commit.
	 */
	public dispose(
		error: unknown = new UsageError("Channel configuration controller disposed"),
	): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.disposalError = error;
		for (const pending of this.pending.values()) {
			pending.reject(error);
		}
		this.pending.clear();
		this.listeners.clear();
	}

	/**
	 * Also used by the wrapper to prohibit ordinary submission from configuration callbacks.
	 */
	public verifyCanSubmit(): void {
		if (this.disposed) {
			throw this.disposalError;
		}
		if (this.processing) {
			throw new UsageError("Cannot submit during a channel configuration callback");
		}
	}

	private validateSupported(values: ChannelConfiguration): asserts values is TConfig {
		if (!this.options.definition.isSupported(values)) {
			throw new UsageError("Unsupported channel configuration values");
		}
	}

	private checkOverflow(): void {
		if (this.snapshot.revision === Number.MAX_SAFE_INTEGER) {
			throw new UsageError("Channel configuration revision overflow");
		}
	}

	private checkSize(value: unknown): void {
		const runtimeLimit = this.options.maxMessageSize();
		const limit =
			(runtimeLimit === 0 || runtimeLimit === undefined) && !this.options.isPublished()
				? unpublishedConfigurationMaxMessageSize
				: runtimeLimit;
		if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit <= 0) {
			throw new UsageError("Channel configuration requires a supported message size limit");
		}
		if (new TextEncoder().encode(JSON.stringify(value)).byteLength > limit) {
			throw new UsageError("Channel configuration exceeds the supported message size");
		}
	}

	private readConfigurationMessage(content: unknown): ChannelConfigurationMessageV1 {
		const message = parseConfiguredChannelMessage(content);
		if (message.kind !== "configuration") {
			throw new UsageError("Expected a channel configuration proposal");
		}
		return message;
	}

	private copyProposal(content: unknown): ChannelConfigurationMessageV1 {
		const message = this.readConfigurationMessage(content);
		const copy = Object.freeze({
			...message,
			values: copyChannelConfiguration(message.values),
		});
		return copy;
	}

	private apply(
		values: TConfig,
		context: ChannelConfigurationContext,
	): ConfigurationChangeResult<TConfig> {
		const previous = this.snapshot;
		this.snapshot = Object.freeze({
			version: 1,
			revision: previous.revision + 1,
			values,
		});
		const change = Object.freeze({ ...context, previous, current: this.snapshot });
		for (const listener of [...this.listeners]) {
			listener(change);
			if (this.disposed) {
				throw this.disposalError;
			}
		}
		return Object.freeze({ ...context, status: "applied", current: this.snapshot });
	}
}
