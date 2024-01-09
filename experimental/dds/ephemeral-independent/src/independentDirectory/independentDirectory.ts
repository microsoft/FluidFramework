/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils";
import type { IFluidDataStoreRuntime } from "@fluidframework/datastore-definitions";

import { type IndependentDatastore, handleFromDatastore } from "../independentDatastore.js";
import { unbrandIVM } from "../independentValue.js";
import type { ValueElement, ValueState } from "../internalTypes.js";
import type {
	ClientId,
	IndependentDirectory,
	IndependentDirectoryMethods,
	IndependentDirectoryNodeSchema,
	ManagerFactory,
	RoundTrippable,
} from "../types.js";

interface IndependentDirectoryValueUpdate extends ValueState<unknown> {
	path: string;
	keepUnregistered?: true;
}

type DirectorySchemaElement<
	TSchema extends IndependentDirectoryNodeSchema,
	Part extends keyof ReturnType<TSchema[keyof TSchema]>,
	Keys extends keyof TSchema = keyof TSchema,
> = ReturnType<TSchema[Keys]>[Part];

type IndependentSubSchemaFromDirectorySchema<
	TSchema extends IndependentDirectoryNodeSchema,
	Part extends keyof ReturnType<TSchema[keyof TSchema]>,
> = {
	[path in keyof TSchema]: DirectorySchemaElement<TSchema, Part, path>;
};

type IndependentDatastoreSchemaFromDirectorySchema<TSchema extends IndependentDirectoryNodeSchema> =
	IndependentSubSchemaFromDirectorySchema<TSchema, "value">;
type DirectoryNodes<TSchema extends IndependentDirectoryNodeSchema> =
	IndependentSubSchemaFromDirectorySchema<TSchema, "manager">;

/**
 * ValueElementDirectory is a map of path to a map of clientId to ValueState.
 * It is not restricted to the schema of the directory as it may receive updates from other clients
 * with managers that have not been registered locally. Each directory node is responsible for keeping
 * all sessions state to be able to pick arbitrary client to rebroadcast to others.
 *
 * This generic aspect makes some typing difficult. The loose typing is not broadcast to the
 * consumers that are expected to maintain their schema over multiple versions of clients.
 */
interface ValueElementDirectory<_TSchema extends IndependentDirectoryNodeSchema> {
	[path: string]: { [clientId: ClientId]: ValueState<unknown> };
}
// An attempt to make the type more precise, but it is not working.
// If the casting in support code is too much we could keep two references to the same
// complete datastore, but with the respective types desired.
// type ValueElementDirectory<TSchema extends IndependentDirectoryNodeSchema> =
// 	| {
// 			[path in keyof TSchema & string]?: {
// 				[clientId: ClientId]: ValueState<DirectorySchemaElement<TSchema,"value",path>>;
// 			};
// 	  }
// 	| {
// 			[path: string]: { [clientId: ClientId]: ValueState<unknown> };
// 	  };
// interface ValueElementDirectory<TValue> {
// 	[id: string]: { [clientId: ClientId]: ValueState<TValue> };
// 	// Version with local packed in is convenient for directory, but not for join broadcast to serialize simply.
// 	// [id: string]: {
// 	// 	local: ValueState<TValue>;
// 	// 	all: { [clientId: ClientId]: ValueState<TValue> };
// 	// };
// }

class IndependentDirectoryImpl<TSchema extends IndependentDirectoryNodeSchema>
	implements
		IndependentDirectoryMethods<TSchema>,
		IndependentDatastore<IndependentDatastoreSchemaFromDirectorySchema<TSchema>>
{
	private readonly datastore: ValueElementDirectory<TSchema> = {};
	public readonly nodes: DirectoryNodes<TSchema>;

	constructor(
		private readonly runtime: IFluidDataStoreRuntime,
		initialContent: TSchema,
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
			const timestamp = Date.now();
			assert(message.clientId !== null, "Directory received signal without clientId");
			// TODO: Probably most messages can just be general state update and merged.
			if (message.type === "IndependentDirectoryValueUpdate") {
				const { path, keepUnregistered, rev, value } =
					message.content as IndependentDirectoryValueUpdate;
				if (path in this.nodes) {
					const node = unbrandIVM(this.nodes[path]);
					node.update(message.clientId, rev, timestamp, value);
				} else if (keepUnregistered) {
					if (!(path in this.datastore)) {
						this.datastore[path] = {};
					}
					const allKnownState = this.datastore[path];
					allKnownState[message.clientId] = { rev, timestamp, value };
				}
			} else if (message.type === "CompleteIndependentDirectory") {
				const remoteDatastore = message.content as ValueElementDirectory<TSchema>;
				// TODO: Merge remoteDatastore into this.datastore
			}
		});

		// Prepare initial directory content from initial state
		{
			const clientId = this.runtime.clientId;
			const initial = Object.entries(initialContent).reduce(
				(acc, [path, nodeFactory]) => {
					const newNodeData = nodeFactory(path, handleFromDatastore(this));
					acc.nodes[path as keyof TSchema] = newNodeData.manager;
					acc.datastore[path] = {};
					if (clientId) {
						// Should be able to use newNodeData.value, but Jsonable allowance for undefined appears
						// to cause a problem. Or it could be that datastore is not precisely typed
						acc.datastore[path][clientId] = unbrandIVM(newNodeData.manager).value;
					}
					return acc;
				},
				{
					nodes: {} as unknown as DirectoryNodes<TSchema>,
					datastore: {} as unknown as ValueElementDirectory<TSchema>,
				},
			);
			this.nodes = initial.nodes;
			this.datastore = initial.datastore;
		}
	}

	knownValues<Path extends keyof TSchema & string>(
		path: Path,
	): {
		self: string | undefined;
		states: ValueElement<DirectorySchemaElement<TSchema, "value", Path>>;
	} {
		return {
			self: this.runtime.clientId,
			states: this.datastore[path] as ValueElement<
				DirectorySchemaElement<TSchema, "value", Path>
			>,
		};
	}

	localUpdate(path: keyof TSchema, forceBroadcast: boolean): void {
		throw new Error("Method not implemented.");
	}

	update(
		path: keyof TSchema,
		clientId: string,
		rev: number,
		timestamp: number,
		value: RoundTrippable<unknown>,
	): void {
		throw new Error("Method not implemented.");
	}

	public add<TPath extends string, TValue, TValueManager>(
		path: TPath,
		nodeFactory: ManagerFactory<TPath, TValue, TValueManager>,
	): asserts this is IndependentDirectory<
		TSchema & Record<TPath, ManagerFactory<TPath, TValue, TValueManager>>
	> {
		assert(!(path in this.nodes), "Already have entry for path in directory");
		const node = nodeFactory(path, handleFromDatastore(this)).manager;
		this.nodes[path] = node;
		if (path in this.datastore) {
			// Already have received state from other clients. Kept in `all`.
			// TODO: Send current `all` state to state manager.
		} else {
			this.datastore[path] = {};
		}
		// If we have a clientId, then add the local state entry to the all state.
		if (this.runtime.clientId) {
			// Should be able to use .value from factory, but Jsonable allowance for undefined appears
			// to cause a problem. Or it could be that datastore is not precisely typed.
			this.datastore[path][this.runtime.clientId] = unbrandIVM(node).value;
		}
	}
}

/**
 * @internal
 */
export function createEphemeralIndependentDirectory<TSchema extends IndependentDirectoryNodeSchema>(
	runtime: IFluidDataStoreRuntime,
	initialContent: TSchema,
): IndependentDirectory<TSchema> {
	const directory = new IndependentDirectoryImpl(runtime, initialContent);

	// Capture the top level "public" directory. Both the directory implementation and
	// the wrapper object reference this object.
	const nodes = directory.nodes;

	// Create a wrapper object that has just the public interface methods and nothing more.
	const wrapper = {
		add: directory.add.bind(directory),
	};

	return new Proxy(wrapper as IndependentDirectory<TSchema>, {
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
