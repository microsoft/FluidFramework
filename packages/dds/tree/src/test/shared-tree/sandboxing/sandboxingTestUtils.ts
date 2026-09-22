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

import { normalizeProtocolError, throwProtocolError } from "./common.js";
import { Guest } from "./guest.js";
import { Host } from "./host.js";

/** The ports and test controls for one Host and Guest session. */
export interface SessionPorts<TInterop> {
	readonly hostPort: MessagePort;
	readonly guestPort: MessagePort;
	readonly interop: TInterop;
	dispose(): void;
}

/** A function that builds the ports and test controls for one session. */
export type SessionPortsBuilder<TInterop> = () => SessionPorts<TInterop>;

/** Builds a direct channel between the Host and the Guest. */
export function buildDirectSessionPorts(): SessionPorts<undefined> {
	const channel = new MessageChannel();
	return {
		hostPort: channel.port1,
		guestPort: channel.port2,
		interop: undefined,
		dispose: () => {},
	};
}

/** Ports that let a test send messages to each participant independently. */
export interface IsolatedPortControls {
	readonly sendToHost: MessagePort;
	readonly sendToGuest: MessagePort;
}

/** Builds separate channels that let a test send messages to each participant. */
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

export const stringArrayConfig = new TreeViewConfiguration({
	schema: StringArray,
	enableSchemaValidation: true,
});
const schemaFactory = new SchemaFactory("sandboxing");
export class HandleArray extends schemaFactory.array("HandleArray", schemaFactory.handle) {}
export const handleArrayConfig = new TreeViewConfiguration({
	schema: HandleArray,
	enableSchemaValidation: true,
});

const activeTeardowns = new Set<() => void>();

/** Disposes sessions created by tests in the current file. */
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

/** Sets up a Host, Guest, and peer with a string-array initial state. */
export function setup(initialState: string[]) {
	return setupCustom(initialState, stringArrayConfig, buildDirectSessionPorts);
}

/** Sets up a Host, Guest, and peer with the given schema and session ports. */
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
	const peerView = provider.trees[0].viewWith(config);
	peerView.initialize(initialState);
	const peer = asAlpha(peerView);
	provider.synchronizeMessages();

	const main = asAlpha(provider.trees[1].viewWith(config));
	const sessionPorts = sessionPortsBuilder();
	const host = new Host(main, sessionPorts.hostPort, handleProtocolError, logger);

	const hostCompressor = provider.getCompressor(provider.trees[1]);
	const localRoot = host.local.root;
	assert(localRoot !== undefined, "Expected an initialized root");
	const startingState = TreeAlpha.exportCompressed(localRoot, {
		// TODO: shard the compressor here?
		idCompressor: hostCompressor,
		minVersionForCollab: FluidClientVersion.v2_80,
	});

	const guest = new Guest(
		config,
		{ jsonValidator: FormatValidatorBasic },
		{
			tree: startingState,
			schema: extractPersistedSchema(config.schema, FluidClientVersion.v2_80, () => false),
			// TODO: shard the compressor here?
			idCompressor: hostCompressor,
		},
		sessionPorts.guestPort,
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
