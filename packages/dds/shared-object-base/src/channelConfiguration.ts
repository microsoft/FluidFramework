/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ReadonlyJsonTypeWith } from "@fluidframework/core-interfaces/internal/exposedUtilityTypes";
import { assert } from "@fluidframework/core-utils/internal";

import {
	parseChannelConfigurationSnapshot,
	parseChannelConfigurationMessage,
	type ChannelConfigurationMessageV1,
} from "./channelConfigurationFormat.js";

/**
 * A readonly JSON property bag without handles.
 *
 * Configuration is owned by Fluid Framework code. Callers must supply values that round-trip
 * through JSON and must not mutate them after submission. The protocol does not copy or freeze them.
 *
 * This type represents persisted configuration for a channel. Its semantics are defined by the channel author.
 * Generally, channel authors should use this for settings that should apply to all clients of the same channel instance in a document. For example,
 * a channel might expose a setting dictating how much history should be retained. It's desirable for that
 * setting to be consistent across multiple collaborators on the document, as flip-flopping the setting could
 * lead to apparent data loss from the user perspective.
 * @internal
 */
export type ChannelConfiguration = Readonly<Record<string, ReadonlyJsonTypeWith<never>>>;

/**
 * A read-only view of a channel's accepted configuration at a specific point in time.
 *
 * This is the in-memory API, not the persisted encoding. The shared wrapper adds format
 * version information when it stores this state in channel attributes.
 * @internal
 */
export interface ChannelConfigurationSnapshot<
	TConfig extends ChannelConfiguration = ChannelConfiguration,
> {
	/**
	 * The revision of this configuration snapshot.
	 *
	 * This is the field used to implement compare-and-swap semantics for configuration updates. As such,
	 * it is incremented each time a replacement is accepted, even if the values are unchanged.
	 */
	readonly revision: number;
	/**
	 * The channel-specific configuration values at this revision.
	 */
	readonly values: TConfig;
}

/**
 * Defines which configuration values a channel can read and which changes it can apply.
 *
 * Configured DDS packages implement this interface
 * A factory supplies this definition even when it does not create configured channels by default.
 * This lets the same factory load both configured and unconfigured channel instances.
 * @internal
 */
export interface ChannelConfigurationDefinition<TConfig extends ChannelConfiguration> {
	/**
	 * The configuration used before a channel first persists configuration.
	 * These values must describe the DDS's existing behavior and be the same on all clients.
	 * They are not creation options: loading an unmarked channel always uses these defaults.
	 */
	readonly defaultConfiguration: TConfig;
	/**
	 * Returns whether this reader supports the configuration, including all of its keys and values.
	 * This function must be pure: loading configuration must not change channel state.
	 */
	readonly isSupported: (values: ChannelConfiguration) => values is TConfig;
	/**
	 * Throws if replacing the previous configuration with the next would not preserve the channel's data.
	 * Invoked on both the sending side of a configuration change request and on the processing side.
	 *
	 * Throwing an exception generally will result in at least data loss.
	 * However, catching invariant violations on the sending side can prevent more severe document corruption.
	 *
	 * This function must be pure and deterministic so all clients accept or reject the same transition.
	 * Use the configuration's changed event to update channel state after a replacement is accepted.
	 */
	readonly validateTransition: (previous: TConfig, next: TConfig) => void;
}

/**
 * Identifies where an attached channel's configuration proposal was sequenced.
 *
 * Attached channels wait for sequencing before applying a proposal, even when the local client
 * submitted it. The sequence number information describes that outcome.
 * @internal
 */
export interface ChannelConfigurationAttachedContext {
	readonly source: "sequenced";
	readonly sequenceNumber: number;
	readonly clientSequenceNumber: number;
	/**
	 * Logical position within the delivered collection; sequence numbers can be shared.
	 * This index is delivery-local, can differ after stash reconstruction, and must not
	 * be persisted as a barrier identity.
	 * Use the channel configuration revision to identify an accepted replacement.
	 */
	readonly messageIndex: number;
	readonly local: boolean;
}

/**
 * Identifies a configuration change applied locally before the channel is attached.
 *
 * The channel applies the change immediately without submitting an op. The change is final,
 * not optimistic: it becomes part of the configuration included in the attach summary.
 * @internal
 */
export interface ChannelConfigurationDetachedContext {
	readonly source: "local";
	readonly local: true;
}

/**
 * Information about the context in which a channel configuration change occurred.
 * @internal
 */
export type ChannelConfigurationChangeContext =
	| ChannelConfigurationDetachedContext
	| ChannelConfigurationAttachedContext;

/**
 * Describes an accepted configuration replacement.
 *
 * Listeners run synchronously after the current snapshot changes and before the next channel op
 * is delivered. There is no notification for a conflicting proposal or for the initial snapshot.
 * @internal
 */
export type ChannelConfigurationChange<TConfig extends ChannelConfiguration> = {
	readonly previous: ChannelConfigurationSnapshot<TConfig>;
	readonly current: ChannelConfigurationSnapshot<TConfig>;
} & ChannelConfigurationChangeContext;

/**
 * The outcome of a request to replace a channel's configuration.
 *
 * An applied request replaces all values. A conflict means another request changed the revision
 * first, so this request did not change the configuration. Unattached local changes cannot conflict.
 * The result contains the snapshot at the time the request was processed. Another replacement can
 * be accepted before the caller resumes after awaiting the result.
 * @internal
 */
export type ConfigurationChangeResult<TConfig extends ChannelConfiguration> =
	| ({
			readonly status: "applied";
			readonly current: ChannelConfigurationSnapshot<TConfig>;
	  } & ChannelConfigurationChangeContext)
	| ({
			readonly status: "conflict";
			readonly current: ChannelConfigurationSnapshot<TConfig>;
	  } & ChannelConfigurationAttachedContext);

/**
 * Information about the per-instance configuration facet for a channel.
 *
 * This is the API made available to the channel author for managing the channel's configuration.
 *
 * @internal
 */
export interface ChannelConfigurationFacet<TConfig extends ChannelConfiguration> {
	/**
	 * The latest accepted configuration. Attached requests do not update it optimistically.
	 */
	readonly current: ChannelConfigurationSnapshot<TConfig>;
	/**
	 * Requests a full replacement of the configuration.
	 * Requests are applied with first-write-wins semantics using the current revision
	 * for compare-and-swap.
	 *
	 * @param next - The complete set of configuration values.
	 * @returns The applied or conflicting outcome. Rejects if validation or submission fails,
	 * or the channel closes before the request completes.
	 */
	requestChange(next: TConfig): Promise<ConfigurationChangeResult<TConfig>>;

	/**
	 * Requests a full replacement, deferring attached submission until this channel next submits
	 * a fresh ordinary op. The proposal precedes that op and uses the revision captured now,
	 * not the revision at submission. Unattached changes apply immediately, as with requestChange.
	 *
	 * Deferred requests are process-local: they do not dirty the channel or appear in summaries
	 * or stashed ops. Configuration ops, resubmission, and stash replay do not flush them.
	 * Multiple requests are not coalesced. Once submitted, normal acknowledgement, resubmission,
	 * stash, and rollback handling applies.
	 *
	 * This API is useful for configuration updates that aren't particular about the exact timing
	 * of their application, but still benefit from synchronization across clients. Lazily flushing
	 * the configuration request change has the benefit that it avoids unnecessary edits to the channel.
	 * Such unnecessary edits can cause problems with ODSP's representation of "file last edited"
	 * or other data model listeners that may track edits to particular parts of the document.
	 *
	 * Synchronous callbacks during the flush must not submit another ordinary op or request
	 * another configuration change.
	 *
	 * @param next - The complete set of configuration values. Omit a key to remove it.
	 * @returns The applied or conflicting outcome. Remains pending while the channel is idle.
	 * Rejects if validation or submission fails, or the channel closes before completion.
	 */
	requestChangeLazy(next: TConfig): Promise<ConfigurationChangeResult<TConfig>>;
	/**
	 * Registers a synchronous listener for accepted replacements.
	 * Listeners must not submit channel ops or request another configuration change.
	 */
	on(event: "changed", listener: (change: ChannelConfigurationChange<TConfig>) => void): void;
	/**
	 * Removes a previously registered change listener.
	 */
	off(event: "changed", listener: (change: ChannelConfigurationChange<TConfig>) => void): void;
}

/**
 * Supplies the channel lifecycle and submission functions used by the configuration controller.
 *
 * The shared wrapper supplies these functions so the controller does not need a runtime reference.
 * Message-size limits remain the responsibility of the normal submission path, not this protocol.
 * @internal
 */
export interface ChannelConfigurationControllerOptions<TConfig extends ChannelConfiguration> {
	readonly definition: ChannelConfigurationDefinition<TConfig>;
	/**
	 * The initial snapshot, from default values, explicit creation settings, or persisted attributes.
	 * All sources receive the same format and reader-support validation.
	 */
	readonly snapshot: unknown;
	/**
	 * Whether the channel is attached.
	 *
	 * @remarks While detached, configuration changes can be applied immediately.
	 */
	readonly isAttached: () => boolean;
	readonly verifyCanChange: () => void;
	readonly submit: (message: ChannelConfigurationMessageV1, localOpMetadata: unknown) => void;
}

interface PendingChange<TConfig extends ChannelConfiguration> {
	readonly resolve: (result: ConfigurationChangeResult<TConfig>) => void;
	readonly reject: (error: unknown) => void;
}

/**
 * Maintains a channel's accepted configuration and completes local requests.
 *
 * @internal
 */
export class ChannelConfigurationController<TConfig extends ChannelConfiguration>
	implements ChannelConfigurationFacet<TConfig>
{
	/**
	 * The current configuration.
	 */
	#snapshot: ChannelConfigurationSnapshot<TConfig>;
	readonly #listeners = new Set<(change: ChannelConfigurationChange<TConfig>) => void>();

	/**
	 * Pending configuration changes made by the local client.
	 * These should be resolved (either as applied or conflicted) upon ack when attached.
	 */
	readonly #pending = new Map<unknown, PendingChange<TConfig>>();
	/**
	 * Configuration changes made via {@link requestChangeLazy} which are pending submission.
	 */
	readonly #lazyRequests = new Map<unknown, ChannelConfigurationMessageV1>();
	#flushingLazy = false;
	#processing = false;

	#disposed = false;
	#disposalError: unknown;

	public constructor(
		private readonly options: ChannelConfigurationControllerOptions<TConfig>,
	) {
		const snapshot = parseChannelConfigurationSnapshot(options.snapshot);
		this.#validateSupported(snapshot.values);
		this.#snapshot = { revision: snapshot.revision, values: snapshot.values };
	}

	public get current(): ChannelConfigurationSnapshot<TConfig> {
		return this.#snapshot;
	}

	/**
	 * Captures the revision and replacement synchronously. Unattached changes also apply
	 * synchronously; attached changes complete only after their sequenced outcome.
	 */
	public async requestChange(next: TConfig): Promise<ConfigurationChangeResult<TConfig>> {
		return this.#requestChange(next, false);
	}

	public async requestChangeLazy(next: TConfig): Promise<ConfigurationChangeResult<TConfig>> {
		return this.#requestChange(next, true);
	}

	async #requestChange(
		next: TConfig,
		lazy: boolean,
	): Promise<ConfigurationChangeResult<TConfig>> {
		this.verifyCanSubmit();
		this.#verifyNotFlushingLazy();
		this.options.verifyCanChange();
		const previous = this.#snapshot;
		const values = next;
		const message: ChannelConfigurationMessageV1 = {
			version: 1,
			isChannelConfigurationOp: true,
			expectedRevision: previous.revision,
			values,
		};
		this.#processing = true;
		try {
			this.#validateSupported(values);
			this.#checkOverflow();
			this.options.definition.validateTransition(previous.values, values);
		} finally {
			this.#processing = false;
		}
		this.verifyCanSubmit();
		if (!this.options.isAttached()) {
			this.#processing = true;
			try {
				return this.#apply(values, { source: "local", local: true });
			} catch (error) {
				this.dispose(error);
				throw error;
			} finally {
				this.#processing = false;
			}
		}
		return new Promise<ConfigurationChangeResult<TConfig>>((resolve, reject) => {
			const metadata = {};
			this.#pending.set(metadata, { resolve, reject });
			if (lazy) {
				this.#lazyRequests.set(metadata, message);
			} else {
				this.#submitPendingChange(message, metadata);
			}
		});
	}

	/**
	 * Flushes queued configuration requests before submitting the next ordinary op.
	 * Reentrant submission during the flush is prohibited so a nested edit cannot overtake
	 * the triggering op. Replay must not flush new intent into pending-op capture.
	 */
	public submitOrdinaryMessage(submit: () => void): void {
		this.verifyCanSubmit();
		this.#verifyNotFlushingLazy();
		this.#flushingLazy = true;
		try {
			for (const [metadata, message] of this.#lazyRequests) {
				this.#lazyRequests.delete(metadata);
				this.#submitPendingChange(message, metadata);
			}
		} finally {
			this.#flushingLazy = false;
		}
		this.verifyCanSubmit();
		submit();
	}

	#verifyNotFlushingLazy(): void {
		assert(
			!this.#flushingLazy,
			"Cannot submit reentrantly while flushing lazy configuration changes",
		);
	}

	#submitPendingChange(message: ChannelConfigurationMessageV1, metadata: unknown): void {
		try {
			this.verifyCanSubmit();
			this.options.verifyCanChange();
			this.options.submit(message, metadata);
		} catch (error) {
			const pending = this.#pending.get(metadata);
			this.#pending.delete(metadata);
			pending?.reject(
				error instanceof Error ? error : new Error("Failed to submit channel configuration"),
			);
			throw error;
		}
	}

	public on(
		event: "changed",
		listener: (change: ChannelConfigurationChange<TConfig>) => void,
	): void {
		this.#listeners.add(listener);
	}

	public off(
		event: "changed",
		listener: (change: ChannelConfigurationChange<TConfig>) => void,
	): void {
		this.#listeners.delete(listener);
	}

	/**
	 * Processes exactly one configuration envelope before the next ordinary DDS message.
	 * Receive-side failures are fatal and reject all outstanding requests.
	 */
	public process(
		content: unknown,
		context: ChannelConfigurationAttachedContext,
		localOpMetadata?: unknown,
	): ConfigurationChangeResult<TConfig> {
		try {
			this.#verifyNotDisposed();
			this.#processing = true;
			const message = parseChannelConfigurationMessage(content);
			assert(
				message.expectedRevision <= this.#snapshot.revision,
				"Channel configuration proposal has a future revision",
			);
			let result: ConfigurationChangeResult<TConfig>;
			if (message.expectedRevision < this.#snapshot.revision) {
				result = { ...context, status: "conflict", current: this.#snapshot };
			} else {
				const values = message.values;
				this.#validateSupported(values);
				this.#checkOverflow();
				this.options.definition.validateTransition(this.#snapshot.values, values);
				result = this.#apply(values, context);
			}
			if (context.local) {
				const pending = this.#pending.get(localOpMetadata);
				this.#pending.delete(localOpMetadata);
				pending?.resolve(result);
			}
			return result;
		} catch (error) {
			this.dispose(error);
			throw error;
		} finally {
			this.#processing = false;
		}
	}

	/**
	 * Resubmits unchanged compare-and-swap intent, without interpreting it against newer state.
	 */
	public reSubmit(content: unknown, localOpMetadata: unknown): void {
		this.verifyCanSubmit();
		try {
			const message = parseChannelConfigurationMessage(content);
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
			const message = parseChannelConfigurationMessage(content);
			this.options.submit(message, undefined);
		} catch (error) {
			this.dispose(error);
			throw error;
		}
	}

	/**
	 * Cancels an unsent staged proposal without changing authoritative configuration.
	 */
	public rollback(localOpMetadata: unknown): void {
		const pending = this.#pending.get(localOpMetadata);
		this.#pending.delete(localOpMetadata);
		pending?.reject(new Error("Channel configuration request was rolled back"));
	}

	/**
	 * Rejects live promises. Rejection does not assert that uncertain delivery cannot commit.
	 */
	public dispose(
		error: unknown = new Error("Channel configuration controller disposed"),
	): void {
		if (this.#disposed) {
			return;
		}
		this.#disposed = true;
		this.#disposalError = error;
		for (const pending of this.#pending.values()) {
			pending.reject(error);
		}
		this.#pending.clear();
		this.#lazyRequests.clear();
		this.#listeners.clear();
	}

	/**
	 * Also used by the wrapper to prohibit ordinary submission from configuration callbacks.
	 */
	public verifyCanSubmit(): void {
		this.#verifyNotDisposed();
		assert(!this.#processing, "Cannot submit during a channel configuration callback");
	}

	#verifyNotDisposed(): void {
		if (this.#disposed) {
			throw this.#disposalError;
		}
	}

	#validateSupported(values: ChannelConfiguration): asserts values is TConfig {
		assert(
			this.options.definition.isSupported(values),
			"Unsupported channel configuration values",
		);
	}

	#checkOverflow(): void {
		assert(
			this.#snapshot.revision !== Number.MAX_SAFE_INTEGER,
			"Channel configuration revision overflow",
		);
	}

	/**
	 * Applies the proposed channel configuration values and notifies listeners of the change.
	 * Does not implement conflict resolution: call this method using only verified configuration changes.
	 * @returns the applied {@link ConfigurationChangeResult}
	 */
	#apply(
		values: TConfig,
		context: ChannelConfigurationChangeContext,
	): ConfigurationChangeResult<TConfig> {
		const previous = this.#snapshot;
		this.#snapshot = {
			revision: previous.revision + 1,
			values,
		};
		const change = { ...context, previous, current: this.#snapshot };
		for (const listener of [...this.#listeners]) {
			listener(change);
			if (this.#disposed) {
				throw this.#disposalError;
			}
		}
		return { ...context, status: "applied", current: this.#snapshot };
	}
}
