/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";

import { asAlpha } from "../../../api.js";
import { FluidClientVersion } from "../../../codec/index.js";
import { FormatValidatorBasic } from "../../../external-utilities/index.js";
import { TreeAlpha } from "../../../shared-tree/index.js";
import {
	extractPersistedSchema,
	// eslint-disable-next-line import-x/no-internal-modules -- The test requires internal Simple Tree APIs.
} from "../../../simple-tree/api/index.js";
import {
	type ImplicitFieldSchema,
	type InsertableTreeFieldFromImplicitField,
	SchemaFactory,
	TreeViewConfiguration,
} from "../../../simple-tree/index.js";
import { configuredSharedTree } from "../../../treeFactory.js";
import { StringArray, TestTreeProviderLite } from "../../utils.js";

import { normalizeProtocolError, throwProtocolError, validateTreePayload } from "./common.js";
import { Guest } from "./guest.js";
import { normalizeTransportData } from "./handles.js";
import { Host } from "./host.js";

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
export function setup(initialState: string[]) {
	return setupCustom(initialState, stringArrayConfig, buildDirectSessionPorts);
}

/**
 * Initializes a new Guest from an existing Host, including application-managed replacement sessions.
 * The caller owns the supplied port and must dispose the returned Guest.
 */
export function createGuestForHost<const TSchema extends ImplicitFieldSchema>(
	host: Host<TSchema>,
	config: TreeViewConfiguration<TSchema>,
	port: MessagePort,
	hostCompressor: ReturnType<TestTreeProviderLite["getCompressor"]>,
	handleProtocolError: (error: Error) => void = throwProtocolError,
	logger: (message: string) => void = () => {},
): Guest<TSchema> {
	const localRoot = host.local.root;
	assert(localRoot !== undefined, "Expected an initialized root");
	const startingState = TreeAlpha.exportCompressed(localRoot, {
		// TODO: shard the compressor here?
		idCompressor: hostCompressor,
		minVersionForCollab: FluidClientVersion.v2_80,
	});
	const normalized = normalizeTransportData(startingState);
	validateTreePayload(normalized);
	return new Guest(
		config,
		{ jsonValidator: FormatValidatorBasic },
		{
			tree: structuredClone(host.codec.encode(normalized)) as typeof startingState,
			schema: extractPersistedSchema(config.schema, FluidClientVersion.v2_80, () => false),
			idCompressor: hostCompressor,
		},
		port,
		handleProtocolError,
		logger,
	);
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
export function setupCustom<TInterop, const TSchema extends ImplicitFieldSchema>(
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
	const provider = new TestTreeProviderLite(
		2,
		configuredSharedTree({
			jsonValidator: FormatValidatorBasic,
			minVersionForCollab: FluidClientVersion.v2_80,
		}).getFactory(),
	);
	const mainView = provider.trees[1].viewWith(config);
	mainView.initialize(initialState);
	const main = asAlpha(mainView);
	provider.synchronizeMessages();

	const peer = asAlpha(provider.trees[0].viewWith(config));
	const sessionPorts = sessionPortsBuilder();
	const host = new Host(
		main,
		sessionPorts.hostPort,
		provider.trees[1].handle,
		handleProtocolError,
		logger,
	);

	const guest = createGuestForHost(
		host,
		config,
		sessionPorts.guestPort,
		provider.getCompressor(provider.trees[1]),
		handleProtocolError,
		logger,
	);

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
		guest,
		provider,
		interop: sessionPorts.interop,
		logger,
	};
}
