/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";

import { TypedEventEmitter } from "@fluidframework/common-utils";
import {
	IAudience,
	IAudienceOwner,
	IContainer,
	IContainerEvents,
} from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import { IClient } from "@fluidframework/protocol-definitions";

/* eslint-disable @typescript-eslint/no-explicit-any */

class MockAudience extends EventEmitter implements IAudienceOwner {
	private readonly audienceMembers: Map<string, IClient>;

	public constructor() {
		super();
		this.audienceMembers = new Map<string, IClient>();
	}

	public on(
		event: "addMember" | "removeMember",
		listener: (clientId: string, client: IClient) => void,
	): this;
	public on(event: string, listener: (...args: any[]) => void): this {
		return super.on(event, listener);
	}
	public off(
		event: "addMember" | "removeMember",
		listener: (clientId: string, client: IClient) => void,
	): this;
	public off(event: string, listener: (...args: any[]) => void): this {
		return super.off(event, listener);
	}
	public once(
		event: "addMember" | "removeMember",
		listener: (clientId: string, client: IClient) => void,
	): this;
	public once(event: string, listener: (...args: any[]) => void): this {
		return super.once(event, listener);
	}

	public addMember(clientId: string, member: IClient): void {
		this.audienceMembers.set(clientId, member);
	}

	public removeMember(clientId: string): boolean {
		return this.audienceMembers.delete(clientId);
	}

	public getMembers(): Map<string, IClient> {
		return new Map<string, IClient>(this.audienceMembers.entries());
	}
	public getMember(clientId: string): IClient | undefined {
		return this.audienceMembers.get(clientId);
	}
}

/**
 * Mock {@link @fluidframework/container-definitions#IContainer} for use in tests.
 */
class MockContainer
	extends TypedEventEmitter<IContainerEvents>
	implements Partial<Omit<IContainer, "on" | "off" | "once">>
{
	public readonly audience: IAudience = new MockAudience();

	private _connectionState: ConnectionState = ConnectionState.Disconnected;

	public get connectionState(): ConnectionState {
		return this._connectionState;
	}

	public connect(): void {
		this._connectionState = ConnectionState.Connected;
		this.emit("connected");
	}

	public disconnect(): void {
		this._connectionState = ConnectionState.Disconnected;
		this.emit("disconnected");
	}
}

/**
 * Creates a mock {@link @fluidframework/container-definitions#IContainer} for use in tests.
 *
 * @remarks
 *
 * Note: the implementation here is incomplete. If a test needs particular functionality, {@link MockContainer}
 * will need to be updated accordingly.
 */
export function createMockContainer(): IContainer {
	return new MockContainer() as unknown as IContainer;
}

/* eslint-enable @typescript-eslint/no-explicit-any */
