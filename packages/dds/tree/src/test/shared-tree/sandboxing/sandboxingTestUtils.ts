/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ITelemetryBaseLogger } from "@fluidframework/core-interfaces";
import {
	createChildLogger,
	type TelemetryLoggerExt,
} from "@fluidframework/telemetry-utils/internal";

import { asAlpha } from "../../../api.js";
import { FluidClientVersion } from "../../../codec/index.js";
// eslint-disable-next-line import-x/no-internal-modules -- Sandbox test helpers use alpha view APIs.
import type { TreeViewAlpha } from "../../../simple-tree/api/index.js";
import {
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	SchemaFactory,
	TreeViewConfiguration,
} from "../../../simple-tree/index.js";
import { configuredSharedTree } from "../../../treeFactory.js";
import { StringArray, TestTreeProviderLite } from "../../utils.js";

import {
	normalizeProtocolError,
	sandboxFormatValidator,
	throwProtocolError,
} from "./common.js";
import { GuestImplementation } from "./guest.js";
import { HostImplementation } from "./host.js";

/**
 * The ports and test controls for one Host and Guest session.
 *
 * @typeParam TInterop - The test controls for the session's transport.
 */
export interface SessionPorts<TInterop> {
	/** The port that the Host owns. */
	readonly hostPort: MessagePort;
	/** The port that the Guest owns. */
	readonly guestPort: MessagePort;
	/** The controls that the test uses to manage message delivery. */
	readonly interop: TInterop;
	/** Delivers the Host's first message when the transport does not relay messages automatically. */
	readonly deliverInitialization: () => Promise<void>;
	/** Releases transport resources that the Host and the Guest do not own. */
	dispose(): void;
}

/**
 * A function that builds the ports and test controls for one session.
 *
 * @typeParam TInterop - The test controls for the session's transport.
 */
export type SessionPortsBuilder<TInterop> = () => SessionPorts<TInterop>;

/**
 * Builds a direct channel between the Host and the Guest.
 */
export function buildDirectSessionPorts(): SessionPorts<undefined> {
	const channel = new MessageChannel();
	return {
		hostPort: channel.port1,
		guestPort: channel.port2,
		interop: undefined,
		deliverInitialization: async () => {},
		dispose: () => {},
	};
}

/**
 * Ports that let a test send messages to each participant independently.
 */
export interface IsolatedPortControls {
	/** Sends a test message to the Host. */
	readonly sendToHost: MessagePort;
	/** Sends a test message to the Guest. */
	readonly sendToGuest: MessagePort;
}

/**
 * Builds separate channels that let a test send messages to each participant.
 */
export function buildIsolatedSessionPorts(): SessionPorts<IsolatedPortControls> {
	const hostChannel = new MessageChannel();
	const guestChannel = new MessageChannel();
	return {
		hostPort: hostChannel.port1,
		guestPort: guestChannel.port1,
		interop: {
			sendToHost: hostChannel.port2,
			sendToGuest: guestChannel.port2,
		},
		deliverInitialization: async () =>
			new Promise<void>((resolve) => {
				hostChannel.port2.addEventListener(
					"message",
					(event: MessageEvent<unknown>) => {
						guestChannel.port2.postMessage(event.data);
						resolve();
					},
					{ once: true },
				);
				hostChannel.port2.start();
			}),
		dispose: () => {
			hostChannel.port2.close();
			guestChannel.port2.close();
		},
	};
}

/**
 * A validated string-array schema configuration for sandbox tests.
 */
export const stringArrayConfig = new TreeViewConfiguration({
	schema: StringArray,
	enableSchemaValidation: true,
});
const schemaFactory = new SchemaFactory("sandboxing");
/**
 * A schema for arrays of Fluid handles in sandbox tests.
 */
export class HandleArray extends schemaFactory.array("HandleArray", schemaFactory.handle) {}
/**
 * A validated handle-array schema configuration for sandbox tests.
 */
export const handleArrayConfig = new TreeViewConfiguration({
	schema: HandleArray,
	enableSchemaValidation: true,
});

const activeTeardowns = new Set<() => void>();

/**
 * Disposes all active sessions created through this module's setup helpers.
 *
 * @param ignoreErrors - Whether disposal errors should be ignored.
 */
export function disposeActiveSessions(ignoreErrors: boolean): void {
	for (const teardown of [...activeTeardowns]) {
		try {
			teardown();
		} catch (error) {
			if (!ignoreErrors) {
				throw error;
			}
		}
	}
}

/**
 * Sets up a Host, Guest, and peer with a string-array initial state and a direct message channel.
 *
 * @param initialState - The initial state of the shared tree.
 * @returns The session components and teardown function.
 */
export async function setup(initialState: string[]) {
	return setupCustom(initialState, stringArrayConfig, buildDirectSessionPorts);
}

/**
 * Creates a Guest from the initialization message sent by the Host on the supplied port.
 * The caller owns the supplied port and must dispose the returned Guest.
 */
export async function createGuestForHost(
	port: MessagePort,
	logger: TelemetryLoggerExt = createChildLogger({ namespace: "Guest" }),
	handleProtocolError: (error: Error) => void = throwProtocolError,
): Promise<GuestImplementation> {
	return GuestImplementation.create({
		treeOptions: { jsonValidator: sandboxFormatValidator },
		port,
		logger,
		handleProtocolError,
	});
}

/**
 * Sets up a Host, Guest, and peer with the given initial state, schema, and session ports.
 *
 * @param initialState - The initial state of the shared tree.
 * @param config - The schema configuration for the shared tree.
 * @param sessionPortsBuilder - A function that builds the ports and test controls.
 * @param logging - Whether to enable diagnostic logging.
 * @param handleProtocolError - A function that handles protocol errors.
 * @returns The session components and test controls.
 * @typeParam TInterop - The test controls for the session's transport.
 * @typeParam TSchema - The schema of the shared tree.
 */
export async function setupCustom<TInterop, const TSchema extends ImplicitFieldSchema>(
	initialState: InsertableTreeFieldFromImplicitField<TSchema>,
	config: TreeViewConfiguration<TSchema>,
	sessionPortsBuilder: SessionPortsBuilder<TInterop>,
	logging: boolean = false,
	handleProtocolError: (error: Error) => void = throwProtocolError,
) {
	const logger = (message: string) => {
		if (logging) {
			console.log(message);
		}
	};
	const telemetryLogger: ITelemetryBaseLogger = {
		send: (event) => logger(JSON.stringify(event)),
	};
	const provider = new TestTreeProviderLite(
		2,
		configuredSharedTree({
			jsonValidator: sandboxFormatValidator,
			minVersionForCollab: FluidClientVersion.v2_80,
		}).getFactory(),
	);
	const mainView = provider.trees[1].viewWith(config);
	mainView.initialize(initialState);
	const main = asAlpha(mainView);
	provider.synchronizeMessages();

	const peer = asAlpha(provider.trees[0].viewWith(config));
	const sessionPorts = sessionPortsBuilder();
	const host = new HostImplementation({
		main,
		port: sessionPorts.hostPort,
		bindingHandle: provider.trees[1].handle,
		idCompressor: provider.getCompressor(provider.trees[1]),
		logger: createChildLogger({ logger: telemetryLogger, namespace: "Host" }),
		handleProtocolError,
	});
	const local: TreeViewAlpha<TSchema> = host.synchronization.localCheckout.viewWithInternal(
		config,
		false,
	);

	let guest: GuestImplementation;
	let guestView: TreeViewAlpha<TSchema>;
	try {
		const guestPromise = createGuestForHost(
			sessionPorts.guestPort,
			createChildLogger({ logger: telemetryLogger, namespace: "Guest" }),
			handleProtocolError,
		);
		await sessionPorts.deliverInitialization();
		guest = await guestPromise;
		guestView = asAlpha(guest.tree.viewWith(config));
	} catch (error) {
		host.dispose();
		sessionPorts.dispose();
		main.dispose();
		throw error;
	}

	const teardown = () => {
		if (!activeTeardowns.delete(teardown)) {
			return;
		}
		let disposalError: Error | undefined;
		for (const dispose of [
			() => guest.dispose(),
			() => host.dispose(),
			() => sessionPorts.dispose(),
			() => main.dispose(),
		]) {
			try {
				dispose();
			} catch (error) {
				disposalError ??= normalizeProtocolError(error);
			}
		}
		if (disposalError !== undefined) {
			throw disposalError;
		}
	};
	activeTeardowns.add(teardown);

	return {
		teardown,
		peer,
		host,
		main,
		local,
		guest,
		guestView,
		provider,
		interop: sessionPorts.interop,
		logger,
	};
}
