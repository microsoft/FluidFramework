/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";

import type {
	IndependentDirectory,
	IndependentDirectoryMethods,
	IndependentDirectoryNode,
	IndependentDirectoryNodeSchema,
} from "./types";
import type {
	IndependentDatastore,
	RoundTrippable,
	StateData,
	StateElement,
	StateElementDirectory,
	StateManager,
} from "./independentDataStore";

interface IndependentDirectoryStateUpdate extends StateData<unknown> {
	path: string;
	keepUnregistered?: true;
}

class IndependentDirectoryImpl<T extends IndependentDirectoryNodeSchema>
	implements IndependentDirectoryMethods<T>, IndependentDatastore<T>
{
	private readonly datastore: StateElementDirectory<RoundTrippable<unknown>> = {};
	// Local state is tracked uniquely from all as local client may not have id while not connected.
	private readonly local: StateElement<RoundTrippable<unknown>> = {};

	constructor(
		private readonly runtime: IFluidDataStoreRuntime,
		private readonly nodes: Record<string, IndependentDirectoryNode>,
	) {
		this.runtime.getAudience().on("addMember", (clientId) => {
			Object.entries(this.datastore).forEach(([_path, allKnownState]) => {
				assert(!(clientId in allKnownState), "New client already in independent directory");
			});
			// TODO: Send all current state to the new client
		});
		runtime.on("disconnected", () => {
			const { clientId } = this.runtime;
			assert(clientId !== undefined, "Disconnected without local clientId");
			Object.entries(this.datastore).forEach(([_path, allKnownState]) => {
				// eslint-disable-next-line @typescript-eslint/no-dynamic-delete
				delete allKnownState[clientId];
			});
			// TODO: Consider caching prior (current) clientId to broadcast when reconnecting so others may remap state.
		});
		runtime.on("connected", () => {
			const { clientId } = this.runtime;
			assert(clientId !== undefined, "Connected without local clientId");
			Object.entries(this.datastore).forEach(([path, allKnownState]) => {
				if (path in this.local) {
					allKnownState[clientId] = this.local[path];
				}
			});
		});
		runtime.on("signal", (message) => {
			assert(message.clientId !== null, "Directory received signal without clientId");
			if (message.type === "IndependentDirectoryStateUpdate") {
				const { path, keepUnregistered, rev, value } =
					message.content as IndependentDirectoryStateUpdate;
				if (path in this.nodes) {
					const node = this.nodes[path] as unknown as StateManager<unknown>;
					node.update(message.clientId, rev, value);
				} else if (keepUnregistered) {
					if (!(path in this.datastore)) {
						this.datastore[path] = {};
					}
					const allKnownState = this.datastore[path];
					allKnownState[message.clientId] = { rev, value };
				}
			} else if (message.type === "CompleteIndependentDirectory") {
				const remoteDatastore = message.content as StateElementDirectory<
					RoundTrippable<unknown>
				>;
				// TODO: Merge remoteDatastore into this.datastore
			}
		});
	}

	update(path: keyof T, clientId: string, rev: number, value: RoundTrippable<unknown>): void {
		throw new Error("Method not implemented.");
	}

	public add<TPath extends string, TNode extends IndependentDirectoryNode>(
		path: TPath,
		node: TNode,
	): asserts this is IndependentDirectory<T & Record<TPath, TNode>> {
		assert(
			!(path in this.nodes) && !(path in this.local),
			"Already have entry for path in directory",
		);
		this.nodes[path] = node;
		// TODO: See about a safer branding conversion - use a helper that knows.
		const nodeManager = node as unknown as StateManager<unknown>;
		// Set local state
		const local = { rev: 0, value: nodeManager.state };
		this.local[path] = local;
		if (path in this.datastore) {
			// Already have received state from other clients. Kept in `all`.
			// TODO: Send current `all` state to state manager.
		} else {
			this.datastore[path] = {};
		}
		// If we have a clientId, then add the local state entry to the all state.
		if (this.runtime.clientId) {
			this.datastore[path][this.runtime.clientId] = local;
		}
	}
}

export function createEphemeralIndependentDirectory<T extends IndependentDirectoryNodeSchema>(
	runtime: IFluidDataStoreRuntime,
	initialContent: T,
): IndependentDirectory<T> {
	// Create the top level "public" directory. Both the directory implementation and
	// the wrapper object will have references to this object.
	const nodes: Record<string, IndependentDirectoryNode> = { ...initialContent };

	const directory = new IndependentDirectoryImpl(runtime, nodes);

	// Create a wrapper object that has just the public interface methods and nothing more.
	const wrapper = {
		add: directory.add.bind(directory),
	};

	return new Proxy(wrapper as IndependentDirectory<T>, {
		get(target, p, receiver) {
			if (typeof p === "string") {
				return target[p] ?? nodes[p];
			}
			return Reflect.get(target, p, receiver);
		},
		set(_target, _p, _newValue, _receiver) {
			return false;
		},
	});
}
