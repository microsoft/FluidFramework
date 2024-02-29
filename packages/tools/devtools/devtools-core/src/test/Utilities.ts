/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter, TypedEventEmitter } from "@fluid-internal/client-utils";
import type {
	IAudience,
	IAudienceOwner,
	IContainer,
	IContainerEvents,
} from "@fluidframework/container-definitions";
import { ConnectionState } from "@fluidframework/container-loader";
import type { IClient } from "@fluidframework/protocol-definitions";
import type { IErrorBase, IRequest } from "@fluidframework/core-interfaces";

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
		this.emit("addMember", clientId, member);
		this.audienceMembers.set(clientId, member);
	}

	public removeMember(clientId: string): boolean {
		const member = this.audienceMembers.get(clientId);
		this.emit("removeMember", clientId, member);
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

	public set connectionState(connectionState: ConnectionState) {
		this._connectionState = connectionState;
	}

	public connect(): void {
		this.emit("connected");
	}

	public disconnect(): void {
		this.emit("disconnected");
	}

	public async attach(request: IRequest): Promise<void> {
		this.emit("attached");
	}

	public dispose(error?: IErrorBase | undefined): void {
		this.emit("disposed");
	}

	public close(): void {
		this.emit("closed");
	}
}

function createMockClient(clientId: string): IClient {
	return {
		mode: "read",
		details: { capabilities: { interactive: false } },
		permission: [],
		user: { id: clientId },
		scopes: [],
		timestamp: Date.now(),
	};
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

/**
 * Add a member for mock audience from mock container for use in tests.
 * @returns member id
 */
export function addAudienceMember(container: IContainer): string {
	const audience = container.audience as MockAudience;
	const testClientId = Math.random().toString(36).slice(2, 7);
	audience.addMember(testClientId, createMockClient(testClientId));

	return testClientId;
}

/**
 * Remove a member for mock audience from mock container for use in tests.
 */
export function removeAudienceMember(container: IContainer, clientId: string): void {
	const audience = container.audience as MockAudience;
	audience.removeMember(clientId);
}
/* eslint-enable @typescript-eslint/no-explicit-any */
