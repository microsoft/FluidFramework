/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { Sandboxing as TreeSandboxing } from "@fluidframework/tree/alpha";
import type {
	areSafelyAssignable,
	requireTrue,
	// eslint-disable-next-line import-x/no-internal-modules
} from "@fluidframework/tree/internal";
import { Sandboxing as FrameworkSandboxing } from "fluid-framework/alpha";

describe("Sandboxing imports", () => {
	it("exports matching APIs from Tree and fluid-framework", () => {
		type _EndpointOptions = requireTrue<
			areSafelyAssignable<TreeSandboxing.EndpointOptions, FrameworkSandboxing.EndpointOptions>
		>;
		type _MessageEvent = requireTrue<
			areSafelyAssignable<TreeSandboxing.MessageEvent, FrameworkSandboxing.MessageEvent>
		>;
		type _MessageEventHandler = requireTrue<
			areSafelyAssignable<
				TreeSandboxing.MessageEventHandler,
				FrameworkSandboxing.MessageEventHandler
			>
		>;
		type _MessagePort = requireTrue<
			areSafelyAssignable<TreeSandboxing.MessagePort, FrameworkSandboxing.MessagePort>
		>;
		type _HostOptions = requireTrue<
			areSafelyAssignable<TreeSandboxing.HostOptions, FrameworkSandboxing.HostOptions>
		>;
		type _Host = requireTrue<
			areSafelyAssignable<TreeSandboxing.Host, FrameworkSandboxing.Host>
		>;
		type _GuestOptions = requireTrue<
			areSafelyAssignable<TreeSandboxing.GuestOptions, FrameworkSandboxing.GuestOptions>
		>;
		type _Guest = requireTrue<
			areSafelyAssignable<TreeSandboxing.Guest, FrameworkSandboxing.Guest>
		>;
		type _CreateHost = requireTrue<
			areSafelyAssignable<
				typeof TreeSandboxing.createHost,
				typeof FrameworkSandboxing.createHost
			>
		>;
		type _CreateGuest = requireTrue<
			areSafelyAssignable<
				typeof TreeSandboxing.createGuest,
				typeof FrameworkSandboxing.createGuest
			>
		>;

		assert.equal(typeof TreeSandboxing.createHost, "function");
		assert.equal(typeof TreeSandboxing.createGuest, "function");
		assert.equal(typeof FrameworkSandboxing.createHost, "function");
		assert.equal(typeof FrameworkSandboxing.createGuest, "function");
	});
});
