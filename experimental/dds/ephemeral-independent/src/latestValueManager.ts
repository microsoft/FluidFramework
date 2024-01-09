/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IEvent, IEventProvider } from "@fluidframework/core-interfaces";
import { Serializable } from "@fluidframework/datastore-definitions";

import { IndependentDatastore, datastoreFromHandle } from "./independentDatastore.js";
import { brandIVM } from "./independentValue.js";
import type { ValueState, ValueManager } from "./internalTypes.js";
import type {
	ClientId,
	IndependentDatastoreHandle,
	ManagerFactory,
	RoundTrippable,
} from "./types.js";

/**
 * @alpha
 */
export interface LatestValueMetadata {
	revision: number;
	timestamp: number;
}

/**
 * @alpha
 */
export interface LatestValueData<T> {
	value: RoundTrippable<T>;
	metadata: LatestValueMetadata;
}

/**
 * @alpha
 */
export interface LatestValueClientData<T> extends LatestValueData<T> {
	clientId: ClientId;
}

/**
 * @alpha
 */
export interface LatestValueManagerEvents<T> extends IEvent {
	/**
	 * .
	 *
	 * @eventProperty
	 */
	(event: "update", listener: (update: LatestValueClientData<T>) => void);
}

/**
 * @alpha
 */
export interface LatestValueManager<T> extends IEventProvider<LatestValueManagerEvents<T>> {
	get local(): RoundTrippable<T>;
	set local(value: Serializable<T>);
	clientValues(): IterableIterator<LatestValueClientData<T>>;
	clients(): ClientId[];
	clientValue(clientId: ClientId): LatestValueData<T>;
}

class LatestValueManagerImpl<T, Path extends string>
	extends TypedEventEmitter<LatestValueManagerEvents<T>>
	implements LatestValueManager<T>, ValueManager<T>
{
	public readonly value: ValueState<T>;

	public constructor(
		private readonly path: Path,
		private readonly datastore: IndependentDatastore<Record<Path, T>>,
		value: Serializable<T>,
	) {
		super();
		this.value = { rev: 0, timestamp: Date.now(), value };
	}

	get local(): RoundTrippable<T> {
		return this.value.value;
	}

	set local(value: Serializable<T>) {
		this.value.value = value;
		this.datastore.localUpdate(this.path, /* forceUpdate */ false);
	}

	clientValues(): IterableIterator<LatestValueClientData<T>> {
		throw new Error("Method not implemented.");
	}

	clients(): ClientId[] {
		const allKnownStates = this.datastore.knownValues(this.path);
		return Object.keys(allKnownStates.states).filter(
			(clientId) => clientId !== allKnownStates.self,
		);
	}

	clientValue(clientId: ClientId): LatestValueData<T> {
		const allKnownStates = this.datastore.knownValues(this.path);
		if (clientId in allKnownStates.states) {
			const { value, rev: revision } = allKnownStates.states[clientId];
			return { value, metadata: { revision, timestamp: Date.now() } };
		}
		throw new Error("No entry for clientId");
	}

	update(clientId: string, revision: number, timestamp: number, value: RoundTrippable<T>): void {
		const allKnownStates = this.datastore.knownValues(this.path);
		if (clientId in allKnownStates.states) {
			const currentState = allKnownStates.states[clientId];
			if (currentState.rev >= revision) {
				return;
			}
		}
		this.datastore.update(this.path, clientId, revision, timestamp, value);
		this.emit("update", { clientId, value, metadata: { revision, timestamp } });
	}
}

/**
 * @alpha
 */
export function Latest<T extends object, Path extends string>(
	initialValue: Serializable<T> & object,
): ManagerFactory<Path, T, LatestValueManager<T>> {
	// LatestValueManager takes ownership of initialValue but makes a shallow
	// copy for basic protection.
	const value = { ...initialValue };
	return (path: Path, datastoreHandle: IndependentDatastoreHandle<Path, T>) => ({
		value,
		manager: brandIVM(
			new LatestValueManagerImpl(path, datastoreFromHandle(datastoreHandle), value),
		),
	});
}
