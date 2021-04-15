import { SharedPropertyTree } from '@fluid-experimental/property-dds';
// // import { IFluidCodeDetails } from '@fluidframework/core-interfaces';
// // import { requestFluidObject } from "@fluidframework/runtime-utils";
// // import { IContainer, IHostLoader, ILoaderOptions } from "@fluidframework/container-definitions";
// // import { IUrlResolver } from "@fluidframework/driver-definitions";

// // import {
// //     createAndAttachContainer,
// //     createLoader,
// //     ITestFluidObject,
// //     TestFluidObjectFactory
// // } from "@fluidframework/test-utils";


// // import { LocalResolver, LocalDocumentServiceFactory } from "@fluidframework/local-driver";

// // import { LocalDeltaConnectionServer, ILocalDeltaConnectionServer } from "@fluidframework/server-local-server";


// import {
//     ContainerRuntimeFactoryWithDefaultDataStore,
//     DataObject,
//     DataObjectFactory,
// } from "@fluidframework/aqueduct";
// import { IContainer, IHostLoader, LoaderHeader } from "@fluidframework/container-definitions";
// import { Container } from "@fluidframework/container-loader";
// import { IRequest, IResponse } from "@fluidframework/core-interfaces";
// import { requestFluidObject } from "@fluidframework/runtime-utils";
// import { describeNoCompat } from "@fluidframework/test-version-utils";
import {
    MockFluidDataStoreRuntime
    // MockContainerRuntimeFactory,
    // MockContainerRuntimeFactoryForReconnection,
    // MockContainerRuntimeForReconnection,
    // MockSharedObjectServices,
    // MockStorage,
} from "@fluidframework/test-runtime-utils";

// const propertyDdsId = 'TestSharedPropertyTree';
// const documentId = "localServerTest";

// function createLocalLoader(
//     packageEntries: Iterable<[IFluidCodeDetails, TestFluidObjectFactory]>,
//     localDeltaConnectionServer: ILocalDeltaConnectionServer,
//     localUrlResolver: IUrlResolver,
//     options?: ILoaderOptions,
// ): IHostLoader {
//     const documentServiceFactory = new LocalDocumentServiceFactory(localDeltaConnectionServer);

//     return createLoader(packageEntries, documentServiceFactory, localUrlResolver, undefined, options);
// }



export async function MockWorkspace()  {
    // const factory = new TestFluidObjectFactory([[propertyDdsId, SharedPropertyTree.getFactory()]] as any);
    // const codeDetails: IFluidCodeDetails = {
    //     package: "localServerTestPackage",
    //     config: {}
    // };

    // const localDeltaConnectionServer = LocalDeltaConnectionServer.create();

    // async function createContainer(): Promise<IContainer> {
	// 	const loader = createLocalLoader([[codeDetails, factory]], localDeltaConnectionServer, urlResolver);
	// 	return createAndAttachContainer(codeDetails, loader, urlResolver.createCreateNewRequest(documentId));
	// }


    // const urlResolver = new LocalResolver();
    // const container = createContainer();


    // const dataObject1 = await requestFluidObject<ITestFluidObject>(container as any, "default");
    // const sharedProperty = await dataObject1.getSharedObject<SharedPropertyTree>(propertyDdsId);

    // return sharedProperty;


    const dataStoreRuntime = new MockFluidDataStoreRuntime();
    const sharedPropertyTree = new SharedPropertyTree("sharedPropertyTree", dataStoreRuntime as any, SharedPropertyTree.getFactory().attributes, {});


    return sharedPropertyTree;
}
