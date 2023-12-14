/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IPartitionLambdaFactory, LambdaCloseType } from "@fluidframework/server-services-core";
import { TestContext } from "@fluidframework/server-test-utils";
import { strict as assert } from "assert";
import nconf from "nconf";
import { createDocumentRouter } from "../../utils/documentRouter";

type LambdaConfig = { foobar: number };

describe("document-router", () => {
	describe("Plugin", () => {
		const defaultConfig = {
			documentLambda: {
				create: () => {
					return {
						create: async (config: LambdaConfig) => {
							assert.strictEqual(3, config.foobar);
							return {
								close: () => {},
							};
						},
						dispose: () => {},
						on: () => {},
					};
				},
			},
		};

		let factory: IPartitionLambdaFactory<LambdaConfig>;
		let config: nconf.Provider;

		beforeEach(async () => {
			config = new nconf.Provider({}).defaults(defaultConfig).use("memory");
			factory = await createDocumentRouter(config);
		});

		afterEach(async () => {
			await factory.dispose();
		});

		describe(".create", () => {
			it("Should be able to create a new lambda", async () => {
				const context = new TestContext();
				const lambda = await factory.create({ foobar: 3 }, context);
				assert.ok(lambda);
				lambda.close(LambdaCloseType.Stop);
			});
		});
	});
});
