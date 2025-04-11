/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryContextProperties } from "@fluidframework/server-services-telemetry";
import assert from "assert";
import {
	AsyncLocalStorageContextProvider,
	AsyncLocalStorageTelemetryContext,
} from "../asyncContext";

describe("AsyncContext", function () {
	describe("AsyncLocalStorageContextProvider", function () {
		class MockContextProviderLogger<T> {
			private _events: (T | undefined)[] = [];

			public get events() {
				return this._events;
			}

			constructor(private readonly contextProvider: AsyncLocalStorageContextProvider<T>) {}

			public log() {
				this._events.push(this.contextProvider.getContext());
			}

			public clear() {
				this._events = [];
			}
		}
		it("returns undefined context when unbound", () => {
			const contextProvider = new AsyncLocalStorageContextProvider<string>();
			const logger = new MockContextProviderLogger(contextProvider);
			const helper = () => {
				logger.log();
			};
			helper(); // 0
			assert.strictEqual(logger.events.length, 1);
			assert.strictEqual(logger.events[0], undefined);
		});
		it("binds properties to sync function context", () => {
			const contextProvider = new AsyncLocalStorageContextProvider<string>();
			const logger = new MockContextProviderLogger(contextProvider);
			const helper = () => {
				logger.log();
			};
			const main = (id: string) => {
				contextProvider.bindContext(id, () => helper());
			};
			const id1 = crypto.randomUUID();
			const id2 = crypto.randomUUID();
			main(id1); // 0
			main(id2); // 1
			main(id1); // 2
			helper(); // 3
			assert.strictEqual(logger.events.length, 4);
			assert.strictEqual(logger.events[0], id1);
			assert.strictEqual(logger.events[1], id2);
			assert.strictEqual(logger.events[2], id1);
			assert.strictEqual(logger.events[3], undefined);
		});
		it("binds properties to async function context", async () => {
			const contextProvider = new AsyncLocalStorageContextProvider<string>();
			const logger = new MockContextProviderLogger(contextProvider);
			const helper = async () => {
				logger.log();
			};
			const main = async (id: string) => {
				return new Promise<void>((resolve) => {
					contextProvider.bindContext(id, () => helper().then(resolve));
				});
			};
			const id1 = crypto.randomUUID();
			const id2 = crypto.randomUUID();
			await main(id1); // 0
			await main(id2); // 1
			await main(id1); // 2
			await helper(); // 3
			assert.strictEqual(logger.events.length, 4);
			assert.strictEqual(logger.events[0], id1);
			assert.strictEqual(logger.events[1], id2);
			assert.strictEqual(logger.events[2], id1);
			assert.strictEqual(logger.events[3], undefined);
			logger.clear();
			await Promise.all([main(id1), helper(), main(id2)]);
			assert(logger.events.includes(id1));
			assert(logger.events.includes(id2));
			assert(logger.events.includes(undefined));
		});
		it("overwrites bound primitive properties when nested", () => {
			const contextProvider = new AsyncLocalStorageContextProvider<string>();
			const logger = new MockContextProviderLogger(contextProvider);
			const helper = () => {
				logger.log();
			};
			const main = (outerId: string, innerId: string) => {
				contextProvider.bindContext(outerId, () => {
					helper();
					contextProvider.bindContext(innerId, () => helper());
				});
			};
			const id1 = crypto.randomUUID();
			const id2 = crypto.randomUUID();
			main(id1, id2);
			assert.strictEqual(logger.events.length, 2);
			assert.strictEqual(logger.events[0], id1);
			assert.strictEqual(logger.events[1], id2);
		});
		it("overwrites/appends bound object properties when nested", () => {
			const contextProvider = new AsyncLocalStorageContextProvider<Record<string, string>>();
			const logger = new MockContextProviderLogger(contextProvider);
			const helper = () => {
				logger.log();
			};
			const main = (
				outerProps: Record<string, string>,
				innerProps: Record<string, string>,
			) => {
				contextProvider.bindContext(outerProps, () => {
					helper();
					contextProvider.bindContext(innerProps, () => helper());
					helper();
				});
			};
			const uniqueProperty1 = crypto.randomUUID();
			const uniqueProperty2 = crypto.randomUUID();
			const overwrittenProperty = crypto.randomUUID();
			const props1 = {
				uniqueProperty1,
				overwrittenProperty,
			};
			const props2 = {
				uniqueProperty2,
				overwrittenProperty: crypto.randomUUID(),
			};
			main(props1, props2);
			assert.strictEqual(logger.events.length, 3);
			assert.deepStrictEqual(logger.events[0], props1);
			assert.deepStrictEqual(logger.events[1], { ...props1, ...props2 });
			assert.deepStrictEqual(logger.events[2], props1);
		});
	});

	describe("AsyncLocalStorageTelemetryContext", function () {
		class MockTelemetryContextLogger {
			private _events: Partial<ITelemetryContextProperties>[] = [];

			public get events() {
				return this._events;
			}

			constructor(private readonly telemetryContext: AsyncLocalStorageTelemetryContext) {}

			public log() {
				this._events.push(this.telemetryContext.getProperties());
			}

			public clear() {
				this._events = [];
			}
		}
		it("returns empty context when unbound", () => {
			const telemetryContext = new AsyncLocalStorageTelemetryContext();
			const logger = new MockTelemetryContextLogger(telemetryContext);
			const helper = () => {
				logger.log();
			};
			helper(); // 0
			assert.strictEqual(logger.events.length, 1);
			assert.deepStrictEqual(logger.events[0], {});
		});
		it("binds properties to sync function context", () => {
			const telemetryContext = new AsyncLocalStorageTelemetryContext();
			const logger = new MockTelemetryContextLogger(telemetryContext);
			const helper = () => {
				logger.log();
			};
			const main = (correlationId: string) => {
				telemetryContext.bindProperties({ correlationId }, () => helper());
			};
			const id1 = crypto.randomUUID();
			const id2 = crypto.randomUUID();
			main(id1); // 0
			main(id2); // 1
			main(id1); // 2
			helper(); // 3
			assert.strictEqual(logger.events.length, 4);
			assert.deepStrictEqual(logger.events[0], { correlationId: id1 });
			assert.deepStrictEqual(logger.events[1], { correlationId: id2 });
			assert.deepStrictEqual(logger.events[2], { correlationId: id1 });
			assert.deepStrictEqual(logger.events[3], {});
		});
		it("binds properties to async function context", async () => {
			const telemetryContext = new AsyncLocalStorageTelemetryContext();
			const logger = new MockTelemetryContextLogger(telemetryContext);
			const helper = async () => {
				logger.log();
			};
			const main = async (correlationId: string) => {
				return new Promise<void>((resolve) => {
					telemetryContext.bindProperties({ correlationId }, () =>
						helper().then(resolve),
					);
				});
			};
			const id1 = crypto.randomUUID();
			const id2 = crypto.randomUUID();
			await main(id1); // 0
			await main(id2); // 1
			await main(id1); // 2
			await helper(); // 3
			assert.strictEqual(logger.events.length, 4);
			assert.deepStrictEqual(logger.events[0], { correlationId: id1 });
			assert.deepStrictEqual(logger.events[1], { correlationId: id2 });
			assert.deepStrictEqual(logger.events[2], { correlationId: id1 });
			assert.deepStrictEqual(logger.events[3], {});
			logger.clear();
			await Promise.all([main(id1), helper(), main(id2)]);
			const correlationIds = logger.events.map((event) => event.correlationId);
			assert(correlationIds.includes(id1));
			assert(correlationIds.includes(id2));
			assert(correlationIds.includes(undefined));
		});
		it("overwrites/appends bound properties when nested", () => {
			const telemetryContext = new AsyncLocalStorageTelemetryContext();
			const logger = new MockTelemetryContextLogger(telemetryContext);
			const helper = () => {
				logger.log();
			};
			const main = (
				outerProps: Partial<ITelemetryContextProperties>,
				innerProps: Partial<ITelemetryContextProperties>,
			) => {
				telemetryContext.bindProperties(outerProps, () => {
					helper();
					telemetryContext.bindProperties(innerProps, () => helper());
					helper();
				});
			};
			const correlationId1 = crypto.randomUUID();
			const correlationId2 = crypto.randomUUID();
			const documentId1 = crypto.randomUUID();
			const documentId2 = crypto.randomUUID();
			const props1 = {
				correlationId: correlationId1,
				documentId: documentId1,
			};
			const props2 = {
				correlationId: correlationId2,
				documentId: documentId2,
			};
			main(props1, props2);
			assert.strictEqual(logger.events.length, 3);
			assert.deepStrictEqual(logger.events[0], props1);
			assert.deepStrictEqual(logger.events[1], { ...props1, ...props2 });
			assert.deepStrictEqual(logger.events[2], props1);
		});
	});
});
