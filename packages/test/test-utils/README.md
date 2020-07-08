# @fluidframework/test-utils

This package contains utilities for writing end-to-end tests in Fluid Framework. It helps in the creation of a simple hosting application to test components, DDSs and other functionalities of the system.

## Local Code Loader

`LocalCodeLoader` in `localCodeLoader.ts` is a simple code loader that can load a fluid package with a given entry point. It can be used to load multiple different fluid packages with different sources (`IFluidCodeDetails`).

It should be created by passing in a list of source to entry point mapping. Then entry point can be an `IComponentFactory`, `IRuntimeFactory` or a `fluidExport`:
```typeScript
// The fluidEntryPoint type.
export type fluidEntryPoint = Partial<IProvideRuntimeFactory & IProvideComponentFactory & IFluidModule>;

// Constructior for LocalCodeLoader.
constructor(packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>);
```
On load, it retrieves the `fluidEntryPoint` matching the package in the `IFluidCodeDetails` and loads it.

## Local Loader
`localLoader.ts` contains couple of methods:

### `createLocalLoader`

This method creates a simple `Loader` that can be used to resolve a Container or request a Component.

It should be created with a list of source to entry point mappings (of type `fluidEntryPoint` as explained in [LocalCodeLoader](#Local-Code-Loader) section above) and an `ILocalDeltaConnectionServer`:
```typeScript
export function createLocalLoader(
    packageEntries: Iterable<[
        IFluidCodeDetails,
        Partial<IProvideRuntimeFactory & IProvideComponentFactory & IFluidModule>
    ]>,
    deltaConnectionServer: ILocalDeltaConnectionServer,
): ILoader;
```

- It creates a `TestResolver` that it uses to resolve requests.
- It creates a `LocalCodeLoader` using the `fluidEntryPoint` list to load Container code.
- It creates a `DocumentServiceFactory` which serves as the driver layer between the container and the server.

### `initializeLocalContainer`

This method creates and initializes a `Container` with the given `documentId` and `codeDetails`. An `ILoader` should also be passed in that will be used to load the `Container`:

```typeScript
export async function initializeLocalContainer(
    documentId: string,
    loader: ILoader,
    codeDetails: IFluidCodeDetails,
): Promise<Container>;
```

The usual flow is to create a `LocalLoader` by calling `createLocalLoader` and then using it to call `initializeLocalContainer`. However, this should work with any `ILoader`.

## Test Fluid Component

`testFluidComponent.ts` provides `TestFluidComponent` and `TestFluidComponentFactory` that help in the testing of Distributed Data Structures (DDS).
It can be used to create a component with a given set of DDSs which can then be retrieved later as required.

For example, if you need a component with couple of SharedStrings, a SharedDirectory and a SparseMatrix, create a `TestFluidComponentFactory` as follows and use this factory to create a component:
```typeScript
new TestFluidComponentFactory([
    [ "sharedString1" /* id */, SharedString.getFactory() ],
    [ "sharedString2" /* id */, SharedString.getFactory() ],
    [ "directory" /* id */, SharedDirectory.getFactory() ],
    [ "matrix" /* id */, SparseMatrix.getFactory() ],
]);
```

The `TestFluidComponent` will then create the above DDSs when initializing and they can then be retrieved by calling `getSharedObject` on it and providing the `id` that was used to create it:
```typeScript
const sharedString1 = testFluidComponent.getSharedObject<SharedString>("sharedString1");
const sharedString1 = testFluidComponent.getSharedObject<SharedString>("sharedString2");
const directory = testFluidComponent.getSharedObject<SharedDirectory>("directory");
const matrix = testFluidComponent.getSharedObject<SparseMatrix>("matrix");
```

>If you want a DDS to be part of the registry so that it can be created later but don't want `TestFluidComponent` to create it during initialization, use `id` as `undefined` in the `TestFluidComponentFactory` creation.

## Document Delta Event Manager
`DocumentDeltaEventManager` provides control over op processing in the tests. It lets you pause and resume the op processing in the containers / components. It also lets you wait until the ops have been processed by them and the server.

`DocumentDeltaEventManager` should be created by passing in the `ILocalDeltaConnectionServer` that is used in the test. You can then register the components / containers whose ops you want to control with it.

For example, consider the scenario where you perform some operations on a DDS and want to verify that the remote client's DDS have applied the operations. You have to wait until the op is sent to the server, the server processes the op, sends it to the remote client and the remote client processes the op.

You can use the `DocumentDeltaEventManager` to wait for all that to happen by calling `process` on it. Check how [SharedStringTest](..\end-to-end-tests\src\test\sharedStringEndToEndTests.spec.ts) does that.

## Usage

The typical usage for testing a Component / DDS is as follows:
1. Create an `ILocalDeltaConnectionServer`:
    ```typescript
    const deltaConnectionServer: ILocalDeltaConnectionServer = LocalDeltaConnectionServer.create();
    ```

2. Create an `IFluidCodeDetails` and a `TestFluidComponentFactory` which will serve as the fluid entry point:
    ```typescript
    const codeDetails: IFluidCodeDetails = {
        package: "sharedStringTestPackage",
        config: {},
    };
    const entryPoint = new TestFluidComponentFactory([["sharedString", SharedString.getFactory()]]);
    ```
    >This can replaced by any `IComponentFactory` or `IRuntimeFactory`.

3. Create a local `Loader`:
    ```typescript
    const loader: ILoader = createLocalLoader([[codeDetails, entryPoint]], deltaConnectionServer);
    ```

4. Create and initialize a `Container` by giving it a `id` which is used as a URL to resolve the container:
    ```typescript
    const id = "fluid-test://localhost/sharedStringTest";
    const container = await initializeLocalContainer(id, loader, codeDetails);
    ```
    >We used the same `IFludCodeDetails` that was used to create the `Loader` in step 3.

5. Create a `Component` and get the `SharedString`:
    ```typescript
    const response = await container.request({ url: "default" }); // "default" represent the default component.
    const component = response.value as ITestFluidComponent;
    const sharedString = await component.getSharedObject<SharedString>("sharedString");
    ```
    >The `ITestFluidComponent` would have already created a `SharedString` based off the parameters we provided when creating the `TestFluidComponentFactory` in step 2.

6. To truly test collaboration, create a second `Loader`, `Container`, `Component` and `DDS` which will serve as a remote client:
    ```typescript
    const loader2: ILoader = createLocalLoader([[codeDetails, entryPoint]], deltaConnectionServer);
    const container2 = await initializeLocalContainer(id, loader2, codeDetails);
    const response2 = await container2.request({ url: "default" });
    const component2 = response2.value as ITestFluidComponent;
    const sharedString2 = await component2.getSharedObject<SharedString>("sharedString");
    ```
    >It is important to use the same `ILocalDeltaConnectionServer` to create the `Loader` and the same `id` to create / initialize the `Container`. This will make sure that we load the `Container` that was created earlier and do not create a new one.

## Example
The above usage is taken from [SharedStringTest](..\end-to-end-tests\src\test\sharedStringEndToEndTests.spec.ts) which is a very basic example of how to use these utils.

There are a number of other examples (some a little more complex) in the same [directory](..\end-to-end-tests\src\test).
