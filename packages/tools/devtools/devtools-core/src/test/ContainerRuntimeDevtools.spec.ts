/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IAudience } from "@fluidframework/container-definitions";
import type { IContainerEvents } from "@fluidframework/container-definitions/internal";
import { AttachState } from "@fluidframework/container-definitions/internal";
import { ConnectionState } from "@fluidframework/container-loader";
import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import { MockAudience } from "@fluidframework/test-runtime-utils/internal";
import { expect } from "chai";

import type { ContainerKey } from "../CommonInterfaces.js";
import {
	ContainerRuntimeDevtools,
	type ContainerRuntimeDevtoolsConstructorProps,
} from "../ContainerRuntimeDevtools.js";
import type { DecomposedContainer } from "../DecomposedContainer.js";

/**
 * Simple mock DecomposedContainer for testing.
 */
class MockDecomposedContainer
	extends TypedEventEmitter<IContainerEvents>
	implements DecomposedContainer
{
	public readonly audience: IAudience = new MockAudience();
	public clientId: string | undefined = "test-client-id";
	public attachState: AttachState = AttachState.Detached;
	public connectionState: ConnectionState = ConnectionState.Disconnected;
	public closed = false;

	public connect(): void {
		this.emit("connected", this.clientId);
	}

	public disconnect(): void {
		this.emit("disconnected");
	}

	public close(): void {
		this.closed = true;
		this.emit("closed");
	}
}

/**
 * Creates test props for ContainerRuntimeDevtools constructor.
 */
function createTestProps(
	containerKey: ContainerKey = "test-container-key",
	container?: DecomposedContainer,
	containerData?: Record<string, IFluidLoadable>,
): ContainerRuntimeDevtoolsConstructorProps {
	return {
		containerKey,
		container: container ?? new MockDecomposedContainer(),
		containerData,
	};
}

describe("ContainerRuntimeDevtools unit tests", () => {
	let devtools: ContainerRuntimeDevtools;
	let container: MockDecomposedContainer;
	let containerKey: ContainerKey;

	beforeEach(() => {
		containerKey = "test-container-key";
		container = new MockDecomposedContainer();
		devtools = new ContainerRuntimeDevtools(createTestProps(containerKey, container));
	});

	afterEach(() => {
		devtools.dispose();
	});

	describe("Construction", () => {
		it("Should create instance with correct properties", () => {
			expect(devtools.containerKey).to.equal(containerKey);
			expect(devtools.disposed).to.be.false;
		});
	});

	describe("Container State", () => {
		it("Should track connection state changes", () => {
			expect(devtools.getContainerConnectionLog().length).to.equal(0);

			// Simulate container state changes
			container.emit("attached");
			expect(devtools.getContainerConnectionLog().length).to.equal(1);
			expect(devtools.getContainerConnectionLog()[0]?.newState).to.equal("attached");

			container.emit("connected", "test-client");
			expect(devtools.getContainerConnectionLog().length).to.equal(2);
			expect(devtools.getContainerConnectionLog()[1]?.newState).to.equal("connected");

			container.emit("disconnected");
			expect(devtools.getContainerConnectionLog().length).to.equal(3);
			expect(devtools.getContainerConnectionLog()[2]?.newState).to.equal("disconnected");
		});

		it("Should track audience changes", () => {
			expect(devtools.getAudienceHistory().length).to.equal(0);

			// Simulate audience member changes
			const audience = container.audience as MockAudience;
			const testClientId = "test-client-id";
			audience.addMember(testClientId, {
				mode: "read",
				details: { capabilities: { interactive: false } },
				permission: [],
				user: { id: testClientId },
				scopes: [],
				timestamp: Date.now(),
			});

			expect(devtools.getAudienceHistory().length).to.equal(1);
			expect(devtools.getAudienceHistory()[0]?.clientId).to.equal(testClientId);
			expect(devtools.getAudienceHistory()[0]?.changeKind).to.equal("joined");

			audience.removeMember(testClientId);
			expect(devtools.getAudienceHistory().length).to.equal(2);
			expect(devtools.getAudienceHistory()[1]?.clientId).to.equal(testClientId);
			expect(devtools.getAudienceHistory()[1]?.changeKind).to.equal("left");
		});
	});

	describe("isClosed method", () => {
		/**
		 * Container runtimes (IContainerRuntime) don't have a "closed" state like full containers (IContainer) do.
		 * They only have "disconnected" (temporary, can reconnect) and "disposed" (destroyed) states.
		 * Therefore, isClosed() should always return false for container runtimes.
		 */
		it("Should always return false for container runtimes", () => {
			expect(devtools.isClosed()).to.be.false;

			// Even after container state changes, should still return false
			container.emit("disconnected");
			expect(devtools.isClosed()).to.be.false;

			container.emit("disposed");
			expect(devtools.isClosed()).to.be.false;
		});
	});

	describe("Disposal", () => {
		it("Should dispose correctly", () => {
			expect(devtools.disposed).to.be.false;

			devtools.dispose();

			expect(devtools.disposed).to.be.true;
		});

		it("Should not allow operations after disposal", () => {
			devtools.dispose();

			// Should not throw, but operations should be safe
			expect(() => devtools.getContainerConnectionLog()).to.not.throw();
			expect(() => devtools.getAudienceHistory()).to.not.throw();
		});
	});

	describe("Edge Cases", () => {
		it("Should handle rapid state changes", () => {
			// Simulate rapid state changes
			for (let i = 0; i < 10; i++) {
				container.emit("connected", `client-${i}`);
				container.emit("disconnected");
			}

			expect(devtools.getContainerConnectionLog().length).to.equal(20);
		});

		it("Should handle undefined client IDs", () => {
			container.clientId = undefined;
			container.emit("connected", "test-client");

			expect(devtools.getContainerConnectionLog().length).to.equal(1);
			expect(devtools.getContainerConnectionLog()[0]?.newState).to.equal("connected");
		});

		it("Should handle empty audience", () => {
			expect(devtools.getAudienceHistory().length).to.equal(0);
			expect(container.audience.getMembers().size).to.equal(0);
		});
	});
});
