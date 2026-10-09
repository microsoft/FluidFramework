/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import type {
	IChannelAttributes,
	IDeltaHandler,
} from "@fluidframework/datastore-definitions/internal";
import type { IRuntimeMessageCollection } from "@fluidframework/runtime-definitions/internal";
import type { TelemetryLoggerExt } from "@fluidframework/telemetry-utils/internal";

import {
	ChannelConfigurationController,
	type ChannelConfiguration,
} from "./channelConfiguration.js";
import {
	hasChannelConfigurationMarker,
	parseChannelConfigurationMessage,
	verifyOrdinaryChannelMessage,
} from "./channelConfigurationFormat.js";
import type { SharedObjectConfigurationOptions } from "./sharedObjectConfiguration.js";

/**
 * Shared transport for ordinary and configuration ops.
 * Preparation binds or encodes handles before a lazy configuration flush can submit anything.
 * Submission uses the channel's existing runtime connection, including stashed-op capture.
 */
export interface SharedObjectTransport {
	isAttached(): boolean;
	verifyNotClosed(): void;
	prepareMessage(content: unknown): unknown;
	submitMessage(content: unknown, metadata: unknown): void;
}

/**
 * State available before services are connected, without exposing the runtime or subclass hooks.
 */
export interface ChannelConfigurationHost {
	readonly attributes: IChannelAttributes;
	readonly logger: TelemetryLoggerExt;
	isDisposed(): boolean;
	isReadOnly(): boolean;
	onDispose(listener: () => void): void;
}

/**
 * Routes a configuration-capable shared object's transport, including before its first configuration op.
 * Retains ordinary DDS hooks and metadata.
 * The ordinary endpoint is downstream of configuration routing, before handle decoding and DDS events.
 * This layer owns initialization, persistence, and disposal; the controller owns CAS state and requests.
 */
export class ChannelConfigurationDeltaHandler<TConfig extends ChannelConfiguration>
	implements IDeltaHandler
{
	#suppressLazySubmission = false;
	#initialized = false;
	readonly #initializationKind: "create" | "load";
	public readonly controller: ChannelConfigurationController<TConfig>;
	public readonly attributes: IChannelAttributes;

	public constructor(
		{ definition, initialization }: SharedObjectConfigurationOptions<TConfig>,
		private readonly ordinary: Required<IDeltaHandler>,
		private readonly transport: SharedObjectTransport,
		private readonly host: ChannelConfigurationHost,
	) {
		this.#initializationKind = initialization.kind;
		const hasConfiguration =
			initialization.kind === "load"
				? "configuration" in host.attributes
				: initialization.initialConfiguration !== undefined;
		const controller = new ChannelConfigurationController({
			definition,
			snapshot:
				initialization.kind === "load" && "configuration" in host.attributes
					? host.attributes.configuration
					: {
							version: 1,
							revision: 0,
							values:
								initialization.kind === "create"
									? (initialization.initialConfiguration ?? definition.defaultConfiguration)
									: definition.defaultConfiguration,
						},
			isAttached: () => transport.isAttached(),
			verifyCanChange: () => {
				this.#verifyCanSubmit();
				assert(
					this.#initialized,
					"Cannot change configuration during shared object initialization",
				);
				assert(!host.isReadOnly(), "Cannot change configuration on a read-only runtime");
			},
			submit: (message, metadata) => this.#submitControlMessage(message, metadata),
		});
		this.controller = controller;
		// Configuration-capable channels can add an instance-specific getter.
		// Copy first so this does not change factory attributes or another channel's snapshot.
		this.attributes = { ...host.attributes };
		const persistConfiguration = (): void => {
			Object.defineProperty(this.attributes, "configuration", {
				enumerable: true,
				get: () => ({ version: 1, ...controller.current }),
			});
			controller.off("changed", persistConfiguration);
		};
		if (hasConfiguration) {
			persistConfiguration();
		} else {
			// Register before the DDS so its first changed callback sees persisted attributes.
			controller.on("changed", persistConfiguration);
		}
		host.onDispose(() =>
			this.close(new Error("Runtime disposed with pending configuration changes")),
		);
	}

	public beginInitialization(kind: "create" | "load"): void {
		assert(
			this.#initializationKind === kind && !this.#initialized,
			"Shared object configuration initialization mode does not match its lifecycle",
		);
	}

	public completeInitialization(): void {
		this.#initialized = true;
	}

	#verifyCanSubmit(): void {
		this.transport.verifyNotClosed();
		assert(!this.host.isDisposed(), "Cannot submit to a disposed configured channel");
		assert(
			this.#initializationKind !== "load" || this.#initialized,
			"Cannot submit while loading configured shared object state",
		);
		this.controller.verifyCanSubmit();
	}

	public submitOrdinaryMessage(content: unknown, metadata: unknown): void {
		this.#verifyCanSubmit();
		verifyOrdinaryChannelMessage(content);
		if (this.transport.isAttached()) {
			const prepared = this.transport.prepareMessage(content);
			if (!this.#suppressLazySubmission) {
				this.controller.flushLazyRequests();
			}
			this.transport.submitMessage(prepared, metadata);
		}
	}

	#submitControlMessage(content: unknown, metadata: unknown): void {
		this.#verifyCanSubmit();
		if (this.transport.isAttached()) {
			this.transport.submitMessage(this.transport.prepareMessage(content), metadata);
		}
	}

	public readonly setConnectionState = (connected: boolean): void => {
		this.ordinary.setConnectionState(connected);
	};

	public readonly processMessages = (messages: IRuntimeMessageCollection): void => {
		this.transport.verifyNotClosed();
		this.controller.verifyCanSubmit();
		const ordinary: IRuntimeMessageCollection["messagesContent"][number][] = [];
		const flush = (): void => {
			if (ordinary.length > 0) {
				this.ordinary.processMessages({ ...messages, messagesContent: [...ordinary] });
				ordinary.length = 0;
			}
		};
		for (const [messageIndex, message] of messages.messagesContent.entries()) {
			if (hasChannelConfigurationMarker(message.contents)) {
				flush();
				const proposal = parseChannelConfigurationMessage(message.contents);
				const result = this.controller.process(
					proposal,
					{
						source: "sequenced",
						sequenceNumber: messages.envelope.sequenceNumber,
						clientSequenceNumber: message.clientSequenceNumber,
						messageIndex,
						local: messages.local,
					},
					message.localOpMetadata,
				);
				this.host.logger.sendTelemetryEvent({
					eventName: "ChannelConfiguration",
					status: result.status,
					source: result.source,
					protocolVersion: 1,
					configurationRevision: result.current.revision,
					...(result.source === "sequenced"
						? {
								sequenceNumber: result.sequenceNumber,
								clientSequenceNumber: result.clientSequenceNumber,
								messageIndex: result.messageIndex,
								local: result.local,
							}
						: {}),
				});
			} else {
				ordinary.push(message);
			}
		}
		flush();
	};

	public readonly applyStashedOp = (content: unknown): void => {
		this.#withoutLazySubmission(() => {
			if (hasChannelConfigurationMarker(content)) {
				this.controller.applyStashedOp(parseChannelConfigurationMessage(content));
			} else {
				this.ordinary.applyStashedOp(content);
			}
		});
	};

	public readonly reSubmit = (
		content: unknown,
		metadata: unknown,
		squash: boolean = false,
	): void => {
		this.#withoutLazySubmission(() => {
			if (hasChannelConfigurationMarker(content)) {
				this.controller.reSubmit(parseChannelConfigurationMessage(content), metadata);
			} else {
				this.ordinary.reSubmit(content, metadata, squash);
			}
		});
	};

	public readonly rollback = (content: unknown, metadata: unknown): void => {
		this.#withoutLazySubmission(() => {
			if (hasChannelConfigurationMarker(content)) {
				parseChannelConfigurationMessage(content);
				this.controller.rollback(metadata);
			} else {
				this.ordinary.rollback(content, metadata);
			}
		});
	};

	#withoutLazySubmission(action: () => void): void {
		// DDS replay can submit ops, including from nested callbacks, without new configuration intent.
		const wasSuppressed = this.#suppressLazySubmission;
		this.#suppressLazySubmission = true;
		try {
			action();
		} finally {
			this.#suppressLazySubmission = wasSuppressed;
		}
	}

	public close(error: unknown): void {
		this.controller.dispose(error);
	}
}
