/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { toOpaqueJson } from "../internalUtils.js";
import { datastoreUpdateMessageType } from "../protocol.js";
import type { ClientUpdateEntry } from "../presenceStates.js";
import type { InternalWorkspaceAddress } from "../protocol.js";

/**
 * Builder pattern for creating type-safe DatastoreUpdate signals in tests
 */

// Base interfaces
export interface StateOptions {
	rev?: number;
	timestamp?: number;
}

export interface ItemOptions extends StateOptions {}

export interface DatastoreUpdateSignal {
	type: typeof datastoreUpdateMessageType;
	clientId: string;
	content: {
		sendTimestamp: number;
		avgLatency: number;
		acknowledgementId?: string;
		isComplete?: true;
		data: Record<InternalWorkspaceAddress, Record<string, Record<string, ClientUpdateEntry>>>;
	};
}

export interface SystemWorkspaceData {
	"system:presence": {
		"clientToSessionId": Record<string, { rev: number; timestamp: number; value: string }>;
	};
}

// Forward declarations
export class WorkspaceBuilder {
	private parent: DatastoreUpdateSignalBuilder;
	private address: InternalWorkspaceAddress;
	private states: Map<string, Record<string, ClientUpdateEntry>> = new Map();

	constructor(parent: DatastoreUpdateSignalBuilder, address: InternalWorkspaceAddress) {
		this.parent = parent;
		this.address = address;
	}

	/**
	 * Create a state builder for ValueRequiredState data
	 */
	state(name: string): StateBuilder {
		return new StateBuilder(this, name);
	}

	/**
	 * Create a map state builder for ValueDirectory data
	 */
	mapState(name: string): MapStateBuilder {
		return new MapStateBuilder(this, name);
	}

	/**
	 * Quick method to add a simple state
	 */
	addState(
		name: string,
		attendeeId: string,
		value: unknown,
		options: StateOptions = {},
	): this {
		const stateData: Record<string, ClientUpdateEntry> = {
			[attendeeId]: {
				rev: options.rev ?? 0,
				timestamp: options.timestamp ?? 1030,
				value: toOpaqueJson(value as any),
			} as ClientUpdateEntry,
		};
		this.states.set(name, stateData);
		return this;
	}

	/**
	 * Quick method to add a map state
	 */
	addMapState(
		name: string,
		attendeeId: string,
		items: Record<string, unknown>,
		options: StateOptions = {},
	): this {
		const processedItems: Record<
			string,
			{ rev: number; timestamp: number; value: ReturnType<typeof toOpaqueJson> }
		> = {};

		for (const [key, value] of Object.entries(items)) {
			processedItems[key] = {
				rev: options.rev ?? 0,
				timestamp: options.timestamp ?? 1030,
				value: toOpaqueJson(value as any),
			};
		}

		const mapData: Record<string, ClientUpdateEntry> = {
			[attendeeId]: {
				rev: options.rev ?? 0,
				items: processedItems,
			} as ClientUpdateEntry,
		};
		this.states.set(name, mapData);
		return this;
	}

	/**
	 * Internal method to add state data
	 */
	addStateData(name: string, stateData: Record<string, ClientUpdateEntry>): void {
		this.states.set(name, stateData);
	}

	/**
	 * Return to parent builder
	 */
	end(): DatastoreUpdateSignalBuilder {
		// Add this workspace's data to the parent
		const workspaceData: Record<string, Record<string, ClientUpdateEntry>> = {};
		for (const [stateName, stateData] of this.states) {
			workspaceData[stateName] = stateData;
		}
		this.parent.addWorkspaceData(this.address, workspaceData);
		return this.parent;
	}
}

export class StateBuilder {
	private parent: WorkspaceBuilder;
	private stateName: string;
	private attendees: Map<string, ClientUpdateEntry> = new Map();

	constructor(parent: WorkspaceBuilder, stateName: string) {
		this.parent = parent;
		this.stateName = stateName;
	}

	/**
	 * Add attendee data to this state
	 */
	attendee(id: string, value: unknown, options: StateOptions = {}): this {
		this.attendees.set(id, {
			rev: options.rev ?? 0,
			timestamp: options.timestamp ?? 1030,
			value: toOpaqueJson(value as any),
		} as ClientUpdateEntry);
		return this;
	}

	/**
	 * Add multiple attendees at once
	 */
	addAttendees(data: Record<string, { value: unknown; options?: StateOptions }>): this {
		for (const [attendeeId, { value, options = {} }] of Object.entries(data)) {
			this.attendee(attendeeId, value, options);
		}
		return this;
	}

	/**
	 * Return to workspace builder
	 */
	end(): WorkspaceBuilder {
		const stateData: Record<string, ClientUpdateEntry> = {};
		for (const [attendeeId, entry] of this.attendees) {
			stateData[attendeeId] = entry;
		}
		this.parent.addStateData(this.stateName, stateData);
		return this.parent;
	}
}

export class MapStateBuilder {
	private parent: WorkspaceBuilder;
	private stateName: string;
	private attendees: Map<
		string,
		{
			rev: number;
			items: Record<
				string,
				{ rev: number; timestamp: number; value: ReturnType<typeof toOpaqueJson> }
			>;
		}
	> = new Map();

	constructor(parent: WorkspaceBuilder, stateName: string) {
		this.parent = parent;
		this.stateName = stateName;
	}

	/**
	 * Create an attendee map state builder
	 */
	attendee(id: string): AttendeeMapStateBuilder {
		return new AttendeeMapStateBuilder(this, id);
	}

	/**
	 * Quick method to add attendee with items
	 */
	attendeeItems(id: string, items: Record<string, unknown>, options: StateOptions = {}): this {
		const processedItems: Record<
			string,
			{ rev: number; timestamp: number; value: ReturnType<typeof toOpaqueJson> }
		> = {};

		for (const [key, value] of Object.entries(items)) {
			processedItems[key] = {
				rev: options.rev ?? 0,
				timestamp: options.timestamp ?? 1030,
				value: toOpaqueJson(value as any),
			};
		}

		this.attendees.set(id, {
			rev: options.rev ?? 0,
			items: processedItems,
		});
		return this;
	}

	/**
	 * Internal method to add attendee data
	 */
	addAttendeeData(
		attendeeId: string,
		data: {
			rev: number;
			items: Record<
				string,
				{ rev: number; timestamp: number; value: ReturnType<typeof toOpaqueJson> }
			>;
		},
	): void {
		this.attendees.set(attendeeId, data);
	}

	/**
	 * Return to workspace builder
	 */
	end(): WorkspaceBuilder {
		const stateData: Record<string, ClientUpdateEntry> = {};
		for (const [attendeeId, entry] of this.attendees) {
			stateData[attendeeId] = entry as ClientUpdateEntry;
		}
		this.parent.addStateData(this.stateName, stateData);
		return this.parent;
	}
}

export class AttendeeMapStateBuilder {
	private parent: MapStateBuilder;
	private attendeeId: string;
	private items: Map<
		string,
		{ rev: number; timestamp: number; value: ReturnType<typeof toOpaqueJson> }
	> = new Map();
	private rev: number = 0;

	constructor(parent: MapStateBuilder, attendeeId: string) {
		this.parent = parent;
		this.attendeeId = attendeeId;
	}

	/**
	 * Add an item to this attendee's map
	 */
	item(key: string, value: unknown, options: ItemOptions = {}): this {
		this.items.set(key, {
			rev: options.rev ?? 0,
			timestamp: options.timestamp ?? 1030,
			value: toOpaqueJson(value as any),
		});
		return this;
	}

	/**
	 * Add multiple items at once
	 */
	addItems(data: Record<string, unknown>, options: StateOptions = {}): this {
		for (const [key, value] of Object.entries(data)) {
			this.item(key, value, options);
		}
		return this;
	}

	/**
	 * Set the revision for this attendee's map state
	 */
	revision(rev: number): this {
		this.rev = rev;
		return this;
	}

	/**
	 * Return to map state builder
	 */
	end(): MapStateBuilder {
		const itemsObject: Record<
			string,
			{ rev: number; timestamp: number; value: ReturnType<typeof toOpaqueJson> }
		> = {};
		for (const [key, item] of this.items) {
			itemsObject[key] = item;
		}

		this.parent.addAttendeeData(this.attendeeId, {
			rev: this.rev,
			items: itemsObject,
		});
		return this.parent;
	}
}

/**
 * Main builder class for DatastoreUpdate signals
 */
export class DatastoreUpdateSignalBuilder {
	private _clientId?: string;
	private _timestamp: number = 1030;
	private _avgLatency: number = 10;
	private workspaces: Map<
		InternalWorkspaceAddress,
		Record<string, Record<string, ClientUpdateEntry>>
	> = new Map();
	private systemWorkspace?: SystemWorkspaceData;

	/**
	 * Factory method for quick state updates
	 */
	static stateUpdate(
		workspace: InternalWorkspaceAddress,
		stateName: string,
		attendeeId: string,
		value: unknown,
		options: StateOptions & { clientId: string } = { clientId: "default" },
	): DatastoreUpdateSignal {
		return new DatastoreUpdateSignalBuilder()
			.clientId(options.clientId)
			.timestamp(options.timestamp ?? 1030)
			.workspace(workspace)
			.addState(stateName, attendeeId, value, options)
			.end()
			.build();
	}

	/**
	 * Factory method for quick map updates
	 */
	static mapUpdate(
		workspace: InternalWorkspaceAddress,
		stateName: string,
		attendeeId: string,
		items: Record<string, unknown>,
		options: StateOptions & { clientId: string } = { clientId: "default" },
	): DatastoreUpdateSignal {
		return new DatastoreUpdateSignalBuilder()
			.clientId(options.clientId)
			.timestamp(options.timestamp ?? 1030)
			.workspace(workspace)
			.addMapState(stateName, attendeeId, items, options)
			.end()
			.build();
	}

	/**
	 * Factory method for quick single key map updates
	 */
	static mapKeyUpdate(
		workspace: InternalWorkspaceAddress,
		stateName: string,
		attendeeId: string,
		key: string,
		value: unknown,
		options: StateOptions & { clientId: string } = { clientId: "default" },
	): DatastoreUpdateSignal {
		return this.mapUpdate(workspace, stateName, attendeeId, { [key]: value }, options);
	}

	/**
	 * Set the client ID for this signal
	 */
	clientId(id: string): this {
		this._clientId = id;
		return this;
	}

	/**
	 * Set the timestamp for this signal
	 */
	timestamp(ts: number): this {
		this._timestamp = ts;
		return this;
	}

	/**
	 * Set the average latency for this signal
	 */
	avgLatency(latency: number): this {
		this._avgLatency = latency;
		return this;
	}

	/**
	 * Create a workspace builder
	 */
	workspace(address: InternalWorkspaceAddress): WorkspaceBuilder {
		return new WorkspaceBuilder(this, address);
	}

	/**
	 * Add system workspace data
	 */
	addSystemWorkspace(data: SystemWorkspaceData): this {
		this.systemWorkspace = data;
		return this;
	}

	/**
	 * Internal method to add workspace data
	 */
	addWorkspaceData(
		address: InternalWorkspaceAddress,
		data: Record<string, Record<string, ClientUpdateEntry>>,
	): void {
		this.workspaces.set(address, data);
	}

	/**
	 * Build the final signal
	 */
	build(): DatastoreUpdateSignal {
		if (!this._clientId) {
			throw new Error("Client ID is required");
		}

		const data: Record<
			InternalWorkspaceAddress,
			Record<string, Record<string, ClientUpdateEntry>>
		> = {};

		// Add system workspace if provided
		if (this.systemWorkspace) {
			data["system:presence" as InternalWorkspaceAddress] = this.systemWorkspace[
				"system:presence"
			] as any;
		}

		// Add all other workspaces
		for (const [address, workspaceData] of this.workspaces) {
			data[address] = workspaceData;
		}

		return {
			type: datastoreUpdateMessageType,
			clientId: this._clientId,
			content: {
				sendTimestamp: this._timestamp,
				avgLatency: this._avgLatency,
				data,
			},
		} as any;
	}
}

// Export convenience functions
export const SignalBuilder = DatastoreUpdateSignalBuilder;
