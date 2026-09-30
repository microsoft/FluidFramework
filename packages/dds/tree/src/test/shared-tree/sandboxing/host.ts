/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
import {
	deserializeIdCompressor,
	SerializationVersion,
	type ShardSynchronizationToken,
	toIdCompressorWithCore,
} from "@fluidframework/id-compressor/internal";
import { UsageError } from "@fluidframework/telemetry-utils/internal";

import { FluidClientVersion } from "../../../codec/index.js";
import {
	castCursorToSynchronous,
	findAncestor,
	moveToDetachedField,
	schemaDataIsEmpty,
} from "../../../core/index.js";
import {
	defaultSchemaPolicy,
	fieldBatchCodecBuilder,
	schemaCodecBuilder,
	TreeCompressionStrategy,
} from "../../../feature-libraries/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- The sandbox Host requires internal Simple Tree APIs.
import type { TreeViewAlpha } from "../../../simple-tree/api/index.js";
import type { ImplicitFieldSchema } from "../../../simple-tree/index.js";
import type { JsonCompatibleReadOnly } from "../../../util/index.js";

import {
	type BlobRequestMessage,
	type BlobResponseMessage,
	type HostGuestMessage,
	type HostInitializationMessage,
	normalizeProtocolError,
	parseHostGuestMessage,
	type SandboxEndpointOptions,
	SandboxProtocolError,
	throwProtocolError,
	validateTreePayloadVocabulary,
} from "./common.js";
import { HostTransportCodec } from "./hostTransport.js";
import { HostSynchronization } from "./hostSynchronization.js";
import { SandboxSessionEndpoint } from "./session.js";
import { normalizeTransportData } from "./transport.js";
import { getBranch, getCheckout } from "./synchronizationUtils.js";

/**
 * Options for creating a Host.
 * @typeParam TSchema - The schema of the synchronized tree.
 */
export interface HostOptions<TSchema extends ImplicitFieldSchema>
	extends SandboxEndpointOptions {
	// TODO: Use a branch with a forest once it can be supplied without a full view.
	/** The application-owned view to synchronize with the Guest. */
	readonly main: TreeViewAlpha<TSchema>;
	/** The SharedTree handle to which restored handles are bound. */
	readonly bindingHandle: IFluidHandle;
	/** The runtime's root compressor, which remains on the Host when a Guest ID space shard is created. */
	readonly idCompressor: IIdCompressor;
}

/**
 * The SharedTree that connects to Fluid services on behalf of a Guest.
 *
 * @typeParam TSchema - The schema of the synchronized tree.
 */
export class Host<const TSchema extends ImplicitFieldSchema> {
	public readonly codec: HostTransportCodec;
	private readonly session: SandboxSessionEndpoint;
	private readonly synchronization: HostSynchronization<TSchema>;
	private readonly port: MessagePort;
	private readonly idCompressor: ReturnType<typeof toIdCompressorWithCore>;
	private guestIdSpaceShardToken: ShardSynchronizationToken | undefined;
	private disposed = false;
	/** Borrowed application view, updated by peer changes. Session teardown does not dispose it. */
	public readonly main: TreeViewAlpha<TSchema>;

	/** Receives and routes protocol messages from the Guest. */
	private readonly onMessage = (event: MessageEvent<unknown>): void => {
		this.session.run(() => {
			const message = parseHostGuestMessage(this.codec.decode(event.data));
			switch (message.type) {
				case "guestChange": {
					this.synchronization.receiveChangeFromGuest(message);
					break;
				}
				case "hostUpdateAck": {
					this.synchronization.receiveUpdateAck(message);
					break;
				}
				case "blobRequest": {
					this.receiveBlobRequest(message).catch((error: unknown) => {
						this.session.fail(error);
					});
					break;
				}
				case "blobResponse":
				case "hostUpdate":
				case "hostInitialization":
				case "guestChangeAck": {
					throw new SandboxProtocolError(
						`Host received a message with type ${JSON.stringify(message.type)}.`,
					);
				}
				case "sessionFailure": {
					this.session.fail(new Error(message.error), false);
					break;
				}
				default: {
					unreachableCase(message);
				}
			}
		});
	};

	/** Reports a protocol message that the platform cannot deserialize. */
	private readonly onMessageError = (): void => {
		this.session.fail(
			new SandboxProtocolError("The Host could not deserialize a protocol message."),
		);
	};

	public constructor({
		main,
		port,
		bindingHandle,
		idCompressor,
		logger,
		handleProtocolError = throwProtocolError,
	}: HostOptions<TSchema>) {
		this.port = port;
		this.idCompressor = toIdCompressorWithCore(idCompressor);
		this.codec = new HostTransportCodec(bindingHandle);
		this.main = main;
		this.session = new SandboxSessionEndpoint(
			port,
			(error) => {
				this.synchronization.stop(error);
				this.codec.dispose();
			},
			handleProtocolError,
		);
		this.synchronization = new HostSynchronization(
			main,
			(message) => this.postMessage(message),
			(change) => this.codec.bindHandles(change),
			(action) => this.session.run(action),
			(error) => this.session.fail(error),
			logger,
			(token) => this.synchronizeGuestIdSpaceShard(token),
		);
		this.port.addEventListener("message", this.onMessage);
		this.port.addEventListener("messageerror", this.onMessageError);
		this.port.start();
		let initialization: HostInitializationMessage | undefined;
		try {
			initialization = this.createInitializationMessage(idCompressor);
			this.postMessage(initialization);
		} catch (error) {
			try {
				if (initialization !== undefined) {
					// A synchronous send failure means the Guest never received its ID space shard.
					// Deserialize the unsent ID space shard to get the token needed to reclaim its space.
					// TODO: consider `id-compressor` API change to make this more ergonomic.
					const idSpaceShard = deserializeIdCompressor(
						initialization.idCompressor,
						SerializationVersion.V3,
					);
					const token = idSpaceShard.disposeShard();
					assert(
						token !== undefined,
						"Expected a disposal token for the unsent Guest ID space shard",
					);
					toIdCompressorWithCore(idCompressor).synchronizeWithShard(token);
				}
			} finally {
				this.dispose();
			}
			throw error;
		}
	}

	public dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.session.dispose();
		this.port.removeEventListener("message", this.onMessage);
		this.port.removeEventListener("messageerror", this.onMessageError);
		this.synchronization.dispose();
	}

	/** Terminal failure requiring application-managed Host/Guest recreation, if this session failed. */
	public get error(): Error | undefined {
		return this.session.error;
	}

	private async receiveBlobRequest(message: BlobRequestMessage): Promise<void> {
		this.codec.assertAuthorizedToken(message.token);
		let response: BlobResponseMessage;
		try {
			const blob = await this.codec.resolveBlob(message.token);
			response = { type: "blobResponse", requestId: message.requestId, blob };
		} catch (error) {
			response = {
				type: "blobResponse",
				requestId: message.requestId,
				error: normalizeProtocolError(error).message,
			};
		}
		if (this.session.active) {
			// Do not transfer: detaching the Host's buffer could break other consumers.
			this.postMessage(response);
		}
	}

	private postMessage(message: HostGuestMessage): void {
		const normalized = normalizeTransportData(message);
		parseHostGuestMessage(normalized);
		this.port.postMessage(this.codec.encode(normalized));
	}

	/**
	 * Adds the Guest's new IDs to the Host compressor before the Host decodes a Guest change.
	 *
	 * @remarks
	 * The message schema requires a non-disposing token and checks its wire format.
	 * This method accepts only the ID space shard created for this session.
	 * It also requires progress beyond the last accepted token.
	 * The Host saves the new token only after compressor synchronization succeeds.
	 *
	 * @param token - The Guest ID space shard's progress after it encoded the change.
	 * @throws {@link SandboxProtocolError} if initialization is incomplete, the token belongs to another ID space shard, or progress does not advance.
	 */
	private synchronizeGuestIdSpaceShard(token: ShardSynchronizationToken): void {
		const previous = this.guestIdSpaceShardToken;
		if (previous === undefined) {
			throw new SandboxProtocolError(
				"Guest ID space shard token received before initialization.",
			);
		}
		if (token.shardId !== previous.shardId) {
			throw new SandboxProtocolError(
				"Guest ID space shard token does not belong to this session.",
			);
		}
		if (token.localGenCount <= previous.localGenCount) {
			throw new SandboxProtocolError("Guest ID space shard progress did not advance.");
		}
		// Only the child created for this Host session may advance its root compressor.
		this.idCompressor.synchronizeWithShard(token);
		this.guestIdSpaceShardToken = token;
	}

	private createInitializationMessage(idCompressor: IIdCompressor): HostInitializationMessage {
		const initialization = this.synchronization.guestInitialization;
		const snapshot = this.main.fork();
		try {
			const branch = getBranch(snapshot);
			const base = findAncestor(
				branch.getHead(),
				(commit) => commit.revision === initialization.baseRevision,
			);
			assert(base !== undefined, "Expected the Guest initialization base in Host history");
			const checkout = getCheckout(snapshot);
			checkout.switchBranch(branch.fork(base));
			branch.dispose();
			if (schemaDataIsEmpty(checkout.storedSchema)) {
				throw new UsageError(
					"The Host must have an initialized state at its finalized-history boundary before creating a Guest.",
				);
			}
			const cursor = checkout.forest.allocateCursor();
			try {
				moveToDetachedField(checkout.forest, cursor);
				const options = {
					jsonValidator: FormatValidatorBasic,
					minVersionForCollab: FluidClientVersion.v2_80,
				};
				const tree = fieldBatchCodecBuilder
					.build(options)
					.encode([castCursorToSynchronous(cursor)], {
						encodeType: TreeCompressionStrategy.Compressed,
						idCompressor,
						schema: { schema: checkout.storedSchema, policy: defaultSchemaPolicy },
						isSummary: true,
					});
				const normalizedTree = normalizeTransportData(tree);
				const normalizedSchema = normalizeTransportData(
					schemaCodecBuilder.build(options).encode(checkout.storedSchema),
				);
				validateTreePayloadVocabulary(normalizedTree);
				validateTreePayloadVocabulary(normalizedSchema);

				// Create the ID space shard only after serializing the baseline and retained commits,
				// so that the child snapshot includes every ID the Guest needs during
				// initialization.
				const [serializedIdSpaceShard] = this.idCompressor.shard(1);
				assert(
					serializedIdSpaceShard !== undefined,
					"Expected one serialized Guest ID space shard",
				);
				const idSpaceShard = deserializeIdCompressor(
					serializedIdSpaceShard,
					SerializationVersion.V3,
				);
				this.guestIdSpaceShardToken = idSpaceShard.getShardSyncToken();
				assert(
					this.guestIdSpaceShardToken !== undefined,
					"Expected a Guest ID space shard token",
				);

				return {
					type: "hostInitialization",
					...initialization,
					tree: normalizedTree as JsonCompatibleReadOnly,
					schema: normalizedSchema as JsonCompatibleReadOnly,
					idCompressor: serializedIdSpaceShard,
				};
			} finally {
				cursor.free();
			}
		} finally {
			snapshot.dispose();
		}
	}

	/**
	 * Returns a promise that resolves when all changes known to the Host are reflected in the Guest,
	 * or undefined if all such changes are already reflected in the Guest.
	 *
	 * If new changes arrive while a promise is in progress, the existing promise resolves only
	 * after the new changes are also reflected in the Guest.
	 * A caller does not need to get the promise again after new changes arrive while it is pending.
	 * Pending promises reject on failure or disposal. Access after failure throws.
	 */
	public get updateGuestPromise(): Promise<void> | undefined {
		this.session.breaker.use();
		return this.synchronization.updateGuestPromise;
	}

	/**
	 * The Host branch that reflects the Guest's acknowledged state.
	 */
	public get local(): TreeViewAlpha<TSchema> {
		return this.synchronization.local;
	}

	/**
	 * The baseline revision and retained history needed to initialize a new Guest.
	 */
	public get guestInitialization() {
		return this.synchronization.guestInitialization;
	}
}
