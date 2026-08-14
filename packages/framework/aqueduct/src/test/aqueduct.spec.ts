/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { OldestSupportedClientVersion } from "@fluidframework/runtime-definitions/internal";

import {
	BaseContainerRuntimeFactory,
	type BaseContainerRuntimeFactoryProps,
} from "../container-runtime-factories/index.js";

const commonProps = {
	registryEntries: [],
	provideEntryPoint: async () => ({}),
};

describe("BaseContainerRuntimeFactory", () => {
	const verifyVersionPropertiesAtCompileTime = (): void => {
		const acceptVersionProperties = (_props: BaseContainerRuntimeFactoryProps): void => {};
		interface ExtendedProps extends BaseContainerRuntimeFactoryProps {
			readonly customProperty: boolean;
		}
		acceptVersionProperties({
			...commonProps,
			oldestSupportedClient: "2.0.0",
		});
		const extendedProps: ExtendedProps = {
			...commonProps,
			oldestSupportedClient: "2.0.0",
			customProperty: true,
		};
		acceptVersionProperties(extendedProps);
		// The canonical interface remains extendable, while deprecated old-only calls use the
		// constructor overload below.
		acceptVersionProperties({
			...commonProps,
			// @ts-expect-error -- the canonical interface requires oldestSupportedClient.
			minVersionForCollab: "2.0.0",
		});
		// @ts-expect-error -- exactly one compatibility version property is required.
		acceptVersionProperties(commonProps);
		acceptVersionProperties({
			...commonProps,
			oldestSupportedClient: "2.0.0",
			// @ts-expect-error -- both compatibility version properties cannot be supplied.
			minVersionForCollab: "2.0.0",
		});
	};
	verifyVersionPropertiesAtCompileTime();

	it("accepts oldestSupportedClient", () => {
		assert.doesNotThrow(
			() =>
				new BaseContainerRuntimeFactory({
					...commonProps,
					oldestSupportedClient: "2.0.0",
				}),
		);
	});

	it("continues to accept minVersionForCollab", () => {
		assert.doesNotThrow(
			() =>
				new BaseContainerRuntimeFactory({
					...commonProps,
					minVersionForCollab: "2.0.0",
				}),
		);
	});

	const createWithVersionOptions = (props: {
		readonly oldestSupportedClient?: OldestSupportedClientVersion;
		readonly minVersionForCollab?: OldestSupportedClientVersion;
	}): BaseContainerRuntimeFactory =>
		new BaseContainerRuntimeFactory({
			...commonProps,
			...props,
		} as unknown as BaseContainerRuntimeFactoryProps);

	it("rejects neither version property", () => {
		assert.throws(() => createWithVersionOptions({}), /Specify exactly one/);
	});

	it("rejects both version properties", () => {
		assert.throws(
			() =>
				createWithVersionOptions({
					oldestSupportedClient: "2.0.0",
					minVersionForCollab: "2.0.0",
				}),
			/Specify exactly one/,
		);
	});
});
