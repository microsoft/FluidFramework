/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DisconnectReason } from "@fluidframework/container-definitions/internal";
import { expect } from "chai";

import { ContainerDevtools, type ContainerDevtoolsProps } from "../ContainerDevtools.js";

import { addAudienceMember, createMockContainer, removeAudienceMember } from "./Utilities.js";

// TODOs:
// - Test window messaging

describe("ContainerDevtools unit tests", () => {
	it("Audience History", () => {
		const container = createMockContainer();
		const containerKey = "test-container-key";
		const containerProps: ContainerDevtoolsProps = {
			containerKey,
			container,
		};
		const devtools = new ContainerDevtools(containerProps);

		// verify audience change in container is reflecting in container devtools
		const clientId = addAudienceMember(container);
		expect(container?.audience.getMembers().size).to.equal(1);
		expect(devtools?.getAudienceHistory().length).to.equal(1);
		expect(devtools?.getAudienceHistory()[0].clientId).to.equal(clientId);
		expect(devtools?.getAudienceHistory()[0].changeKind).to.equal("joined");

		removeAudienceMember(container, clientId);
		expect(container.audience.getMembers().size).to.equal(0);
		expect(devtools?.getAudienceHistory().length).to.equal(2);
		expect(devtools?.getAudienceHistory()[1].clientId).to.equal(clientId);
		expect(devtools?.getAudienceHistory()[1].changeKind).to.equal("left");
	});

	it("Container State History", async () => {
		const container = createMockContainer();
		const containerKey = "test-container-key";
		const containerProps: ContainerDevtoolsProps = {
			containerKey,
			container,
		};
		const devtools = new ContainerDevtools(containerProps);

		// verify state change in container is reflecting in container devtools
		container.connect();

		expect(devtools.getContainerConnectionLog().length).to.equal(1);
		expect(devtools.getContainerConnectionLog()[0].newState).to.equal("connected");

		await container.attach({ url: "test-url" });
		expect(devtools.getContainerConnectionLog().length).to.equal(2);
		expect(devtools.getContainerConnectionLog()[1].newState).to.equal("attached");

		container.disconnect();
		expect(devtools.getContainerConnectionLog().length).to.equal(3);
		expect(devtools.getContainerConnectionLog()[2].newState).to.equal("disconnected");

		container.close(DisconnectReason.Unknown);
		expect(devtools.getContainerConnectionLog().length).to.equal(4);
		expect(devtools.getContainerConnectionLog()[3].newState).to.equal("closed");

		container.dispose?.(DisconnectReason.Unknown);
		expect(devtools.getContainerConnectionLog().length).to.equal(5);
		expect(devtools.getContainerConnectionLog()[4].newState).to.equal("disposed");
	});
});
