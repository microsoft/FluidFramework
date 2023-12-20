/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";

import { unbrandIVM } from "../independentValue";
import type {
	IndependentDatastore,
	IndependentDirectory,
	IndependentDirectoryMethods,
	IndependentDirectoryNode,
	IndependentDirectoryNodeSchema,
	RoundTrippable,
	ValueElementDirectory,
	ValueElement,
	ValueState,
} from "./types";

interface IndependentDirectoryValueUpdate extends ValueState<unknown> {
	path: string;
	keepUnregistered?: true;
}

class IndependentDirectoryImpl<T extends IndependentDirectoryNodeSchema>
	implements IndependentDirectoryMethods<T>, IndependentDatastore<T>
{
	private readonly datastore: ValueElementDirectory<unknown> = {};

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
				if (path in this.nodes) {
					allKnownState[clientId] = unbrandIVM(this.nodes[path]).value;
				}
			});
		});
		runtime.on("signal", (message) => {
			assert(message.clientId !== null, "Directory received signal without clientId");
			// TODO: Probably most messages can just be general state update and merged.
			if (message.type === "IndependentDirectoryValueUpdate") {
				const { path, keepUnregistered, rev, value } =
					message.content as IndependentDirectoryValueUpdate;
				if (path in this.nodes) {
					const node = unbrandIVM(this.nodes[path]);
					node.update(message.clientId, rev, value);
				} else if (keepUnregistered) {
					if (!(path in this.datastore)) {
						this.datastore[path] = {};
					}
					const allKnownState = this.datastore[path];
					allKnownState[message.clientId] = { rev, value };
				}
			} else if (message.type === "CompleteIndependentDirectory") {
				const remoteDatastore = message.content as ValueElementDirectory<
					RoundTrippable<unknown>
				>;
				// TODO: Merge remoteDatastore into this.datastore
			}
		});
	}

	knownValues<Path extends keyof T & string>(
		path: Path,
	): { self: string | undefined; states: ValueElement<T[keyof T]> } {
		return { self: this.runtime.clientId, states: this.datastore[path] };
		throw new Error("Method not implemented.");
	}

	localUpdate(path: keyof T, forceBroadcast: boolean): void {
		throw new Error("Method not implemented.");
	}

	update(path: keyof T, clientId: string, rev: number, value: RoundTrippable<unknown>): void {
		throw new Error("Method not implemented.");
	}

	public add<TPath extends string, TNode extends IndependentDirectoryNode>(
		path: TPath,
		node: TNode,
	): asserts this is IndependentDirectory<T & Record<TPath, TNode>> {
		assert(!(path in this.nodes), "Already have entry for path in directory");
		this.nodes[path] = node;
		if (path in this.datastore) {
			// Already have received state from other clients. Kept in `all`.
			// TODO: Send current `all` state to state manager.
		} else {
			this.datastore[path] = {};
		}
		// If we have a clientId, then add the local state entry to the all state.
		if (this.runtime.clientId) {
			this.datastore[path][this.runtime.clientId] = unbrandIVM(node).value;
		}
	}
}

/**
 * @internal
 */
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
