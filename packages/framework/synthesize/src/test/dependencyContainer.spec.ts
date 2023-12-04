/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	IFluidLoadable,
	IFluidHandleContext,
	IFluidHandle,
	IProvideFluidLoadable,
	IProvideFluidHandle,
	FluidObject,
} from "@fluidframework/core-interfaces";
import { FluidObjectHandle } from "@fluidframework/datastore";

import { LazyPromise } from "@fluidframework/core-utils";
import { DependencyContainer } from "../index";
import { IFluidDependencySynthesizer } from "../IFluidDependencySynthesizer";
import { AsyncFluidObjectProvider, FluidObjectProvider, FluidObjectSymbolProvider } from "../types";

const mockHandleContext: IFluidHandleContext = {
	absolutePath: "",
	isAttached: false,
	IFluidHandleContext: undefined as any,

	attachGraph: () => {
		throw new Error("Method not implemented.");
	},
	resolveHandle: () => {
		throw new Error("Method not implemented.");
	},
};

class MockLoadable implements IFluidLoadable {
	public get IFluidLoadable() {
		return this;
	}
	public get handle() {
		return new FluidObjectHandle(this, "", mockHandleContext);
	}
}

const ISomeObject: keyof IProvideSomeObject = "ISomeObject";
interface IProvideSomeObject {
	readonly ISomeObject: ISomeObject;
}
interface ISomeObject extends IProvideSomeObject {
	value: number;
}
class MockSomeObject implements ISomeObject {
	public get ISomeObject() {
		return this;
	}
	public readonly value = 0;
}

describe("someObjectlicious", () => {
	describe("Aqueduct", () => {
		describe("DependencyContainer", () => {
			it(`One Optional Provider registered via value`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const mock = new MockLoadable();
				dc.register(IFluidLoadable, mock);

				const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Optional IFluidLoadable was registered");
				assert(loadable === mock, "IFluidLoadable is expected");
				assert(
					loadable?.handle.absolutePath === mock.handle.absolutePath,
					"IFluidLoadable is valid",
				);
			});

			it(`One Optional Provider registered via Promise value`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const mock = new MockLoadable();
				dc.register(IFluidLoadable, Promise.resolve(mock));

				const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Optional IFluidLoadable was registered");
				assert(loadable === mock, "IFluidLoadable is expected");
				assert(
					loadable?.handle.absolutePath === mock.handle.absolutePath,
					"IFluidLoadable is valid",
				);
			});

			it(`One Optional Provider registered via factory`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const mock = new MockLoadable();
				const factory = () => mock;
				dc.register(IFluidLoadable, factory);

				const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Optional IFluidLoadable was registered");
				assert(loadable === mock, "IFluidLoadable is expected");
				assert(
					loadable?.handle.absolutePath === mock.handle.absolutePath,
					"IFluidLoadable is valid",
				);
			});

			it(`One Optional Provider registered via Promise factory`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const mock = new MockLoadable();
				const factory = async () => mock;
				dc.register(IFluidLoadable, factory);

				const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Optional IFluidLoadable was registered");
				assert(loadable === mock, "IFluidLoadable is expected");
				assert(
					loadable?.handle.absolutePath === mock.handle.absolutePath,
					"IFluidLoadable is valid",
				);
			});

			it(`One Optional Provider registered via LazyPromise factory`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const mock = new MockLoadable();
				let lazyPromiseFlag = false;
				const lazyFactory = new LazyPromise(async () => {
					lazyPromiseFlag = true;
					return mock;
				});
				dc.register(IFluidLoadable, lazyFactory);

				const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
				const loadable_promise = s.IFluidLoadable;
				// This stacking of promises is done in order to make sure that the loadable_promise would have been executed by the time the assertion is done
				await Promise.resolve().then(async () => {
					assert(!lazyPromiseFlag, "Optional IFluidLoadable was correctly lazy loaded");
					const loadable = await loadable_promise;
					assert(loadable, "Optional IFluidLoadable was registered");
					assert(loadable === mock, "IFluidLoadable is expected");
					assert(
						loadable?.handle.absolutePath === mock.handle.absolutePath,
						"IFluidLoadable is valid",
					);
				});
			});

			it(`One Required Provider registered via value`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const mock = new MockLoadable();
				dc.register(IFluidLoadable, mock);

				const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, {
					IFluidLoadable,
				});
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Required IFluidLoadable was registered");
				assert(loadable === mock, "IFluidLoadable is expected");
				assert(
					loadable?.handle.absolutePath === mock.handle.absolutePath,
					"IFluidLoadable is valid",
				);
			});

			it(`One Required Provider registered via Promise value`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const mock = new MockLoadable();
				dc.register(IFluidLoadable, Promise.resolve(mock));

				const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, {
					IFluidLoadable,
				});
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Required IFluidLoadable was registered");
				assert(loadable === mock, "IFluidLoadable is expected");
				assert(
					loadable?.handle.absolutePath === mock.handle.absolutePath,
					"IFluidLoadable is valid",
				);
			});

			it(`One Required Provider registered via factory`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const mock = new MockLoadable();
				const factory = () => mock;
				dc.register(IFluidLoadable, factory);

				const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, {
					IFluidLoadable,
				});
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Required IFluidLoadable was registered");
				assert(loadable === mock, "IFluidLoadable is expected");
				assert(
					loadable?.handle.absolutePath === mock.handle.absolutePath,
					"IFluidLoadable is valid",
				);
			});

			it(`One Required Provider registered via Promise factory`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const mock = new MockLoadable();
				const factory = async () => mock;
				dc.register(IFluidLoadable, factory);

				const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, {
					IFluidLoadable,
				});
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Required IFluidLoadable was registered");
				assert(loadable === mock, "IFluidLoadable is expected");
				assert(
					loadable?.handle.absolutePath === mock.handle.absolutePath,
					"IFluidLoadable is valid",
				);
			});

			it(`One Required Provider registered via LazyPromise factory`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const mock = new MockLoadable();
				let lazyPromiseFlag = false;
				const lazyFactory = new LazyPromise(async () => {
					lazyPromiseFlag = true;
					return mock;
				});
				dc.register(IFluidLoadable, lazyFactory);

				const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, {
					IFluidLoadable,
				});
				const loadable_promise = s.IFluidLoadable;
				// This stacking of promises is done in order to make sure that the loadable_promise would have been executed by the time the assertion is done
				await Promise.resolve().then(async () => {
					assert(!lazyPromiseFlag, "Required IFluidLoadable was correctly lazy loaded");
					const loadable = await loadable_promise;
					assert(loadable, "Required IFluidLoadable was registered");
					assert(loadable === mock, "IFluidLoadable is expected");
					assert(
						loadable?.handle.absolutePath === mock.handle.absolutePath,
						"IFluidLoadable is valid",
					);
				});
			});

			it(`Two Optional Modules all registered`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable & ISomeObject>>();
				const loadableMock = new MockLoadable();
				dc.register(IFluidLoadable, loadableMock);
				const someObjectMock = new MockSomeObject();
				dc.register(ISomeObject, someObjectMock);

				const s = dc.synthesize<IFluidLoadable & ISomeObject>(
					{ IFluidLoadable, ISomeObject },
					undefined,
				);
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Optional IFluidLoadable was registered");
				assert(loadable === loadableMock, "IFluidLoadable is expected");

				const someObject = await s.ISomeObject;
				assert(someObject, "Optional ISomeObject was registered");
				assert(someObject === someObjectMock, "ISomeObject is expected");
			});

			it(`Two Optional Modules one registered`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable & ISomeObject>>();
				const loadableMock = new MockLoadable();
				dc.register(IFluidLoadable, loadableMock);

				const s = dc.synthesize<IFluidLoadable & ISomeObject>(
					{ IFluidLoadable, ISomeObject },
					undefined,
				);
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Optional IFluidLoadable was registered");
				assert(loadable === loadableMock, "IFluidLoadable is expected");

				const someObject = await s.ISomeObject;
				assert(!someObject, "Optional ISomeObject was not registered");
			});

			it(`Two Optional Modules none registered`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable & ISomeObject>>();

				const s = dc.synthesize<IFluidLoadable & ISomeObject>(
					{ IFluidLoadable, ISomeObject },
					undefined,
				);
				const loadable = await s.IFluidLoadable;
				assert(!loadable, "Optional IFluidLoadable was not registered");
				const someObject = await s.ISomeObject;
				assert(!someObject, "Optional ISomeObject was not registered");
			});

			it(`Two Required Modules all registered`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable & ISomeObject>>();
				const loadableMock = new MockLoadable();
				dc.register(IFluidLoadable, loadableMock);
				const someObjectMock = new MockSomeObject();
				dc.register(ISomeObject, someObjectMock);

				const s = dc.synthesize<undefined, IProvideFluidLoadable & IProvideSomeObject>(
					undefined,
					{ IFluidLoadable, ISomeObject },
				);
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Required IFluidLoadable was registered");
				assert(loadable === loadableMock, "IFluidLoadable is expected");

				const someObject = await s.ISomeObject;
				assert(someObject, "Required ISomeObject was registered");
				assert(someObject === someObjectMock, "ISomeObject is expected");
			});

			it(`Required Provider not registered should throw`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();

				assert.throws(
					() =>
						dc.synthesize<undefined, IProvideFluidLoadable>(undefined, {
							IFluidLoadable,
						}),
					Error,
				);
			});

			it(`Optional Provider found in Parent`, async () => {
				const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const mock = new MockLoadable();
				parentDc.register(IFluidLoadable, mock);
				const dc = new DependencyContainer(parentDc);

				const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Optional IFluidLoadable was registered");
				assert(loadable === mock, "IFluidLoadable is expected");
				assert(
					loadable?.handle.absolutePath === mock.handle.absolutePath,
					"IFluidLoadable is valid",
				);
			});

			it(`Optional Modules found in Parent and Child`, async () => {
				const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const loadableMock = new MockLoadable();
				parentDc.register(IFluidLoadable, loadableMock);
				const dc = new DependencyContainer<FluidObject<ISomeObject>>(parentDc);
				const someObjectMock = new MockSomeObject();
				dc.register(ISomeObject, someObjectMock);

				const s = dc.synthesize<IFluidLoadable & ISomeObject>(
					{ IFluidLoadable, ISomeObject },
					undefined,
				);
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Optional IFluidLoadable was registered");
				assert(loadable === loadableMock, "IFluidLoadable is expected");

				const someObject = await s.ISomeObject;
				assert(someObject, "Optional ISomeObject was registered");
				assert(someObject === someObjectMock, "ISomeObject is expected");
			});

			it(`Optional Provider found in Parent and Child resolves Child`, async () => {
				const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				parentDc.register(IFluidLoadable, new MockLoadable());
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>(parentDc);
				const loadableMock = new MockLoadable();
				dc.register(IFluidLoadable, loadableMock);

				const s = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, undefined);
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Optional IFluidLoadable was registered");
				assert(loadable === loadableMock, "IFluidLoadable is expected");
			});

			it(`Required Provider found in Parent`, async () => {
				const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const mock = new MockLoadable();
				parentDc.register(IFluidLoadable, mock);
				const dc = new DependencyContainer(parentDc);

				const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, {
					IFluidLoadable,
				});
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Required IFluidLoadable was registered");
				assert(loadable === mock, "IFluidLoadable is expected");
				assert(
					loadable?.handle.absolutePath === mock.handle.absolutePath,
					"IFluidLoadable is valid",
				);
			});

			it(`Required Modules found in Parent and Child`, async () => {
				const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const loadableMock = new MockLoadable();
				parentDc.register(IFluidLoadable, loadableMock);
				const dc = new DependencyContainer<FluidObject<ISomeObject>>(parentDc);
				const someObjectMock = new MockSomeObject();
				dc.register(ISomeObject, someObjectMock);

				const s = dc.synthesize<undefined, IProvideFluidLoadable & IProvideSomeObject>(
					undefined,
					{ IFluidLoadable, ISomeObject },
				);
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Required IFluidLoadable was registered");
				assert(loadable === loadableMock, "IFluidLoadable is expected");

				const someObject = await s.ISomeObject;
				assert(someObject, "Required ISomeObject was registered");
				assert(someObject === someObjectMock, "ISomeObject is expected");
			});

			it(`Required Provider found in Parent and Child resolves Child`, async () => {
				const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				parentDc.register(IFluidLoadable, new MockLoadable());
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>(parentDc);
				const loadableMock = new MockLoadable();
				dc.register(IFluidLoadable, loadableMock);

				const s = dc.synthesize<undefined, IProvideFluidLoadable>(undefined, {
					IFluidLoadable,
				});
				const loadable = await s.IFluidLoadable;
				assert(loadable, "Required IFluidLoadable was registered");
				assert(loadable === loadableMock, "IFluidLoadable is expected");
			});

			it(`Registering`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				dc.register(IFluidLoadable, new MockLoadable());
				assert(dc.has(IFluidLoadable), "DependencyContainer has IFluidLoadable");
			});

			it(`Registering the same type twice throws`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				dc.register(IFluidLoadable, new MockLoadable());
				assert.throws(() => dc.register(IFluidLoadable, new MockLoadable()), Error);
			});

			it(`Registering then Unregistering`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				dc.register(IFluidLoadable, new MockLoadable());
				dc.unregister(IFluidLoadable);
				assert(!dc.has(IFluidLoadable), "DependencyContainer doesn't have IFluidLoadable");
			});

			it(`Registering then Unregistering then Registering`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				dc.register(IFluidLoadable, new MockLoadable());
				dc.unregister(IFluidLoadable);
				dc.register(IFluidLoadable, new MockLoadable());
				assert(dc.has(IFluidLoadable), "DependencyContainer has IFluidLoadable");
			});

			it(`has() resolves correctly in all variations`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable & ISomeObject>>();
				dc.register(IFluidLoadable, new MockLoadable());
				dc.register(ISomeObject, new MockSomeObject());
				assert(dc.has(IFluidLoadable), "Manager has IFluidLoadable");
				assert(dc.has(ISomeObject), "Manager has ISomeObject");
				assert(
					dc.has(IFluidLoadable) && dc.has(ISomeObject),
					"Manager has IFluidLoadable & ISomeObject",
				);
			});

			it(`Child has Parent modules`, async () => {
				const parentDc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const loadableMock = new MockLoadable();
				parentDc.register(IFluidLoadable, loadableMock);
				const dc = new DependencyContainer<FluidObject<ISomeObject>>(parentDc);
				const someObjectMock = new MockSomeObject();
				dc.register(ISomeObject, someObjectMock);

				assert(dc.has(IFluidLoadable), "has includes parent registered");
				assert(
					!dc.has(IFluidLoadable, true),
					"has does not include excluded parent registered",
				);
				assert(dc.has(ISomeObject), "has includes registered");
				assert(!dc.has(IFluidHandle), "does not include not registered");
			});

			it(`Parent Resolved from Child`, async () => {
				const parentDc = new DependencyContainer<FluidObject<IFluidHandle>>();
				const loadableToHandle: FluidObjectProvider<IProvideFluidHandle> = async (
					fds: IFluidDependencySynthesizer,
				) => {
					const loadable = fds.synthesize<undefined, IProvideFluidLoadable>(undefined, {
						IFluidLoadable,
					});
					return (await loadable.IFluidLoadable).handle;
				};
				parentDc.register(IFluidHandle, loadableToHandle);

				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>(parentDc);
				const loadableMock = new MockLoadable();
				dc.register(IFluidLoadable, loadableMock);

				const deps = dc.synthesize<IFluidHandle>({ IFluidHandle }, undefined);
				assert((await deps.IFluidHandle) !== undefined, "handle undefined");
			});

			it(`Undefined Provider is not Undefined`, async () => {
				const dc = new DependencyContainer();
				const deps = dc.synthesize<IFluidLoadable>({ IFluidLoadable }, {});
				assert(deps.IFluidLoadable !== undefined, "handle undefined");
				assert((await deps.IFluidLoadable) === undefined, "handle undefined");
			});

			it(`test getProvider backcompat`, async () => {
				const dc = new DependencyContainer<FluidObject<IFluidLoadable>>();
				const loadableMock = new MockLoadable();
				dc.register(IFluidLoadable, loadableMock);
				const testGetProvider = (deps: IFluidDependencySynthesizer, scenario: string) => {
					const old = deps as any as {
						getProvider(
							key: "IFluidLoadable",
						): FluidObjectProvider<FluidObject<IFluidLoadable>>;
					};
					const provider = old.getProvider("IFluidLoadable");
					assert.equal(provider, loadableMock, scenario);
				};
				testGetProvider(dc, "direct");
				testGetProvider(new DependencyContainer(dc), "parent");
				testGetProvider(new PassThru<FluidObject<IFluidLoadable>>(dc), "pass thru");
				testGetProvider(
					new DependencyContainer(new PassThru<FluidObject<IFluidLoadable>>(dc)),
					"pass thru as child",
				);
			});
		});
	});
});

class PassThru<TMap> implements IFluidDependencySynthesizer {
	constructor(private readonly parent: IFluidDependencySynthesizer) {}
	synthesize<O, R = Record<string, never> | undefined>(
		optionalTypes: FluidObjectSymbolProvider<O>,
		requiredTypes: Required<FluidObjectSymbolProvider<R>>,
	): AsyncFluidObjectProvider<O, R> {
		return this.parent.synthesize(optionalTypes, requiredTypes);
	}
	has(type: string): boolean {
		return this.parent.has(type);
	}
	readonly IFluidDependencySynthesizer = this;

	getProvider<K extends keyof TMap>(key: K): FluidObjectProvider<TMap[K]> | undefined {
		const maybe = this.parent as any as Partial<this>;
		if (maybe.getProvider) {
			return maybe.getProvider(key);
		}
	}
}
