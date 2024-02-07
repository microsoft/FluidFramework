# @fluidframework/test-utils

This package contains utilities for writing end-to-end tests in Fluid Framework. It helps in the creation of a simple hosting application to test Fluid objects and other functionalities of the system.

## Local Code Loader

`LocalCodeLoader` in `localCodeLoader.ts` is a simple code loader that can load a Fluid package with a given entry point. It can be used to load multiple different Fluid packages with different sources (`IFluidCodeDetails`).

It should be created by passing in a list of source to entry point mapping. Then entry point can be an `IFluidDataStoreFactory`, `IRuntimeFactory` or a `fluidExport`:

```typeScript
// The fluidEntryPoint type.
export type fluidEntryPoint = Partial<IProvideRuntimeFactory & IProvideFluidDataStoreFactory & IFluidModule>;

// Constructor for LocalCodeLoader.
constructor(packageEntries: Iterable<[IFluidCodeDetails, fluidEntryPoint]>);
```

On load, it retrieves the `fluidEntryPoint` matching the package in the `IFluidCodeDetails` and loads it.

## Local Loader

`localLoader.ts` contains couple of methods:

### `createLocalLoader`

This method creates a simple `Loader` that can be used to resolve a Container or request a Fluid object.

It should be created with a list of source to entry point mappings (of type `fluidEntryPoint` as explained in [LocalCodeLoader](#Local-Code-Loader) section above), an `ILocalDeltaConnectionServer` and an `IUrlResolver`:

```typeScript
export function createLocalLoader(
    packageEntries: Iterable<[
        IFluidCodeDetails,
        Partial<IProvideRuntimeFactory & IProvideFluidDataStoreFactory & IFluidModule>
    ]>,
    deltaConnectionServer: ILocalDeltaConnectionServer,
    urlResolver: IUrlResolver,
): ILoader;
```

-   It creates a `LocalCodeLoader` using the `fluidEntryPoint` list to load Container code.
-   It creates a `DocumentServiceFactory` which serves as the driver layer between the container and the server.

### `createAndAttachContainer`

This method creates and attaches a `Container` with the given `source` and an `attachRequest`. An `ILoader` should also be passed in that will be used to load the `Container`. The `attachRequest` format varies per url resolver. Most resolvers have helper methods for creating attach requests. You should use the
helper method on the url resolver passed to the loader to generate the `attachRequest`:

```typescript
export async function createAndAttachContainer(
	source: IFluidCodeDetails,
	loader: ILoader,
	attachRequest: IRequest,
): Promise<IContainer>;
```

The usual flow is to create a `LocalLoader` by calling `createLocalLoader` and then using it to call `createAndAttachContainer`. However, this should work with any `ILoader`.

## Test Fluid Object

`testFluidObject.ts` provides `TestFluidObject` and `TestFluidObjectFactory` that help in the testing of Distributed Data Structures (DDS).
It can be used to create a Fluid object (TestFluidObject) with a given set of DDSes which can then be retrieved later as required.

For example, if you need a Fluid object with couple of SharedStrings, a SharedDirectory and a SparseMatrix, create a `TestFluidObjectFactory` as follows and use this factory to create the Fluid object:

```typeScript
new TestFluidObjectFactory([
    [ "sharedString1" /* id */, SharedString.getFactory() ],
    [ "sharedString2" /* id */, SharedString.getFactory() ],
    [ "directory" /* id */, SharedDirectory.getFactory() ],
    [ "matrix" /* id */, SparseMatrix.getFactory() ],
]);
```

The `TestFluidObject` will then create the above DDSes when initializing and they can then be retrieved by calling `getSharedObject` on it and providing the `id` that was used to create it:

```typeScript
const sharedString1 = testFluidObject.getSharedObject<SharedString>("sharedString1");
const sharedString1 = testFluidObject.getSharedObject<SharedString>("sharedString2");
const directory = testFluidObject.getSharedObject<SharedDirectory>("directory");
const matrix = testFluidObject.getSharedObject<SparseMatrix>("matrix");
```

> If you want a DDS to be part of the registry so that it can be created later but don't want `TestFluidObject` to create it during initialization, use `id` as `undefined` in the `TestFluidObjectFactory` creation.

## Op Processing Controller

`OpProcessingController` provides control over op processing in the tests. It lets you pause and resume the op processing in the containers / fluid objects. It also lets you wait until the ops have been processed by them and the server.

`OpProcessingController` should be created by passing in the `ILocalDeltaConnectionServer` that is used in the test. You can then register the Fluid objects / containers whose ops you want to control with it.

For example, consider the scenario where you perform some operations on a DDS and want to verify that the remote client's DDS have applied the operations. You have to wait until the op is sent to the server, the server processes the op, sends it to the remote client and the remote client processes the op.

You can use the `OpProcessingController` to wait for all that to happen by calling `process` on it. Check how [SharedStringTest](../end-to-end-tests/src/test/sharedStringEndToEndTests.spec.ts) does that.

## Usage

The typical usage for testing a Fluid object is as follows:

1. Create a `LocalDeltaConnectionServer`:

    ```typescript
    const deltaConnectionServer: ILocalDeltaConnectionServer = LocalDeltaConnectionServer.create();
    ```

2. Create a `LocalResolver`:

    ```typescript
    const urlResolver: IUrlResolver = new LocalResolver();
    ```

3. Create an `IFluidCodeDetails` and a `TestFluidObjectFactory` which will serve as the Fluid entry point (code details to factory mapping):

    ```typescript
    const codeDetails: IFluidCodeDetails = {
    	package: "sharedStringTestPackage",
    	config: {},
    };
    const entryPoint = new TestFluidObjectFactory([["sharedString", SharedString.getFactory()]]);
    ```

    > This can replaced by any `IFluidDataStoreFactory` or `IRuntimeFactory`. When the loader is asked to resolve a Container with the above code details, it will load the above factory.

4. Create a local `Loader`:

    ```typescript
    const loader: ILoader = createLocalLoader(
    	[[codeDetails, entryPoint]],
    	deltaConnectionServer,
    	urlResolver,
    );
    ```

5. Create and attach a `Container` by giving it a `documentId` which is used as a URL to resolve the container:

    ```typescript
    const documentId = "testDocument";
    const container = await createAndAttachContainer(
    	codeDetails,
    	loader,
    	urlResolver.createCreateNewRequest(documentId),
    );
    ```

    > We used the same `IFluidCodeDetails` that was used to create the `Loader` in step 3.

6. Get the `Fluid object (TestFluidObject)` by using `getEntryPoint()` API on `IContainer`. Then get the `DDS` to test:

    ```typescript
    const fluidObject = await container.getEntryPoint();
    const sharedString = await fluidObject.getSharedObject<SharedString>("sharedString");
    ```

    > The `ITestFluidObject` would have already created a `SharedString` based off the parameters we provided when creating the `TestFluidObjectFactory` in step 2.

7. To truly test collaboration, create a second `Loader`, `Container`, `fluid object` and `DDS` which will serve as a remote client:
    ```typescript
    const documentUrl = `fluid-test://localhost/${documentId}`;
    const loader2: ILoader = createLocalLoader(
    	[[codeDetails, entryPoint]],
    	deltaConnectionServer,
    	urlResolver,
    );
    const container2 = await loader2.resolver({ url: documentUrl });
    const fluidObject = await container2.getEntryPoint();
    const sharedString2 = await fluidObject2.getSharedObject<SharedString>("sharedString");
    ```
    > It is important to use the same `ILocalDeltaConnectionServer` to create the `Loader` and the same `documentId` to load the `Container`. This will make sure that we load the `Container` that was created earlier and do not create a new one.

These steps are demonstrated in the image below:

![Image 1](./end-to-end-tests.png)

> Note that the LocalDriver is created by the `createLocalLoader` method and does not need to explicitly created.

## Example

The above usage is taken from [SharedStringTest](../end-to-end-tests/src/test/sharedStringEndToEndTests.spec.ts) which is a very basic example of how to use these utils.

There are a number of other examples (some a little more complex) in the same [directory](../end-to-end-tests/src/test).
