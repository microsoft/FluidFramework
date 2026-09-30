/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IFluidHandle } from "@fluidframework/core-interfaces";
import { assert, unreachableCase } from "@fluidframework/core-utils/internal";
import type { IIdCompressor } from "@fluidframework/id-compressor";
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
import type { TreeCheckout } from "../../../shared-tree/index.js";
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
import { getCheckout } from "./synchronizationUtils.js";

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
}

/**
 * The SharedTree that connects to Fluid services on behalf of a Guest.
 * @sealed
 */
export interface Host {
	/** Terminal failure requiring application-managed Host and Guest recreation, if this session failed. */
	readonly error: Error | undefined;
	/** A promise for Guest acknowledgment of pending Host changes, if changes are pending. */
	readonly updateGuestPromise: Promise<void> | undefined;
	/** Ends the session and releases its resources. */
	dispose(): void;
}

/**
 * Implementation of {@link Host}.
 * @typeParam TSchema - The schema of the synchronized tree supplied during construction.
 */
export class HostImplementation<const TSchema extends ImplicitFieldSchema> implements Host {
	public readonly codec: HostTransportCodec;
	private readonly session: SandboxSessionEndpoint;
	/** Internal synchronization state exposed for testing. */
	public readonly synchronization: HostSynchronization;
	/** The checkout extracted from the application-provided view. */
	public readonly mainCheckout: TreeCheckout;
	private readonly port: MessagePort;
	private disposed = false;

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
		this.codec = new HostTransportCodec(bindingHandle);
		this.mainCheckout = getCheckout(main);
		this.session = new SandboxSessionEndpoint(
			port,
			(error) => {
				this.synchronization.stop(error);
				this.codec.dispose();
			},
			handleProtocolError,
		);
		this.synchronization = new HostSynchronization(
			this.mainCheckout,
			(message) => this.postMessage(message),
			(change) => this.codec.bindHandles(change),
			(action) => this.session.run(action),
			(error) => this.session.fail(error),
			logger,
		);
		this.port.addEventListener("message", this.onMessage);
		this.port.addEventListener("messageerror", this.onMessageError);
		this.port.start();
		try {
			this.postMessage(this.createInitializationMessage(idCompressor));
		} catch (error) {
			this.dispose();
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

	private createInitializationMessage(idCompressor: IIdCompressor): HostInitializationMessage {
		const initialization = this.synchronization.guestInitialization;
		const checkout = this.mainCheckout.fork();
		try {
			const branch = checkout.mainBranch;
			const base = findAncestor(
				branch.getHead(),
				(commit) => commit.revision === initialization.baseRevision,
			);
			assert(base !== undefined, "Expected the Guest initialization base in Host history");
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
				return {
					type: "hostInitialization",
					...initialization,
					tree: normalizedTree as JsonCompatibleReadOnly,
					schema: normalizedSchema as JsonCompatibleReadOnly,
				};
			} finally {
				cursor.free();
			}
		} finally {
			checkout.dispose();
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
	 * The baseline revision and retained history needed to initialize a new Guest.
	 */
	public get guestInitialization() {
		return this.synchronization.guestInitialization;
	}
}
