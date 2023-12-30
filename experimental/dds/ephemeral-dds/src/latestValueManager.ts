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
export interface LatestValueManagerEvents<T> extends IEvent {
	/**
	 * .
	 *
	 * @eventProperty
	 */
	(event: "update", listener: (clientId: ClientId, value: RoundTrippable<T>) => void);
}

/**
 * @alpha
 */
export interface LatestValueManager<T> extends IEventProvider<LatestValueManagerEvents<T>> {
	get local(): RoundTrippable<T>;
	set local(value: Serializable<T>);
	clientValues(): IterableIterator<[ClientId, RoundTrippable<T>]>;
	clients(): ClientId[];
	clientValue(clientId: ClientId): RoundTrippable<T>;
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
		this.value = { rev: 0, value };
	}

	get local(): RoundTrippable<T> {
		return this.value.value;
	}

	set local(value: Serializable<T>) {
		this.value.value = value;
		this.datastore.localUpdate(this.path, /* forceUpdate */ false);
	}

	clientValues(): IterableIterator<[ClientId, RoundTrippable<T>]> {
		throw new Error("Method not implemented.");
	}

	clients(): ClientId[] {
		const allKnownStates = this.datastore.knownValues(this.path);
		return Object.keys(allKnownStates.states).filter(
			(clientId) => clientId !== allKnownStates.self,
		);
	}

	clientValue(clientId: ClientId): RoundTrippable<T> {
		const allKnownStates = this.datastore.knownValues(this.path);
		if (clientId in allKnownStates.states) {
			return allKnownStates.states[clientId].value;
		}
		throw new Error("No entry for clientId");
	}

	update(clientId: string, rev: number, value: RoundTrippable<T>): void {
		const allKnownStates = this.datastore.knownValues(this.path);
		if (clientId in allKnownStates.states) {
			const currentState = allKnownStates.states[clientId];
			if (currentState.rev >= rev) {
				return;
			}
		}
		this.datastore.update(this.path, clientId, rev, value);
		this.emit("update", clientId, value);
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
