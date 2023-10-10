/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { isFluidError } from "@fluidframework/telemetry-utils";
import { FluidErrorTypes } from "@fluidframework/core-interfaces";
import { SummaryType } from "@fluidframework/protocol-definitions";
import { IRuntime } from "@fluidframework/container-definitions";
import { Loader } from "../loader";

const failProxy = <T extends object>() => {
	const proxy = new Proxy<T>({} as any as T, {
		get: (_, p) => {
			throw Error(`${p.toString()} not implemented`);
		},
	});
	return proxy;
};

const failProperties = <T extends object>(handler: Partial<T>) => {
	const proxy = new Proxy<T>(handler as T, {
		get: (t, p, r) => {
			if (p in handler) {
				return Reflect.get(t, p, r);
			}
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return failProxy();
		},
	});
	return proxy;
};

describe("loader unit test", () => {
	it("rehydrateDetachedContainerFromSnapshot with invalid format", async () => {
		const loader = new Loader({
			codeLoader: failProxy(),
			documentServiceFactory: failProxy(),
			urlResolver: failProxy(),
		});

		try {
			await loader.rehydrateDetachedContainerFromSnapshot(`{"foo":"bar"}`);
			assert.fail("should fail");
		} catch (e) {
			assert.strict(isFluidError(e), `should be a fluid error: ${e}`);
			assert.strictEqual(e.errorType, FluidErrorTypes.usageError, "should be a usage error");
		}
	});

	it("rehydrateDetachedContainerFromSnapshot with valid format", async () => {
		const loader = new Loader({
			codeLoader: {
				load: async () => {
					return {
						details: {
							package: "none",
						},
						module: {
							fluidExport: {
								IRuntimeFactory: {
									get IRuntimeFactory() {
										return this;
									},
									async instantiateRuntime(context, existing) {
										return failProperties<IRuntime>({
											createSummary: () => ({
												tree: {},
												type: SummaryType.Tree,
											}),
										});
									},
								},
							},
						},
					};
				},
			},
			documentServiceFactory: failProxy(),
			urlResolver: failProxy(),
		});
		const detached = await loader.createDetachedContainer({ package: "none" });
		const summary = detached.serialize();
		assert.strictEqual(
			summary,
			'{"type":1,"tree":{".protocol":{"tree":{"attributes":{"content":"{\\"minimumSequenceNumber\\":0,\\"sequenceNumber\\":0}","type":2},"quorumMembers":{"content":"[]","type":2},"quorumProposals":{"content":"[]","type":2},"quorumValues":{"content":"[[\\"code\\",{\\"key\\":\\"code\\",\\"value\\":{\\"package\\":\\"none\\"},\\"approvalSequenceNumber\\":0,\\"commitSequenceNumber\\":0,\\"sequenceNumber\\":0}]]","type":2}},"type":1},".app":{"tree":{},"type":1}}}',
			"summary does not match expected format",
		);
		await loader.rehydrateDetachedContainerFromSnapshot(summary);
	});
});
