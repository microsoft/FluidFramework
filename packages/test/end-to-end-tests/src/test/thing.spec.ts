// import { IContainer } from "@fluidframework/container-definitions";
// import { ILoader } from "@fluidframework/container-definitions";
// import { LocalResolver } from "@fluidframework/local-driver";
// import { LocalDeltaConnectionServer } from "@fluidframework/server-local-server";
import { SharedMap } from "@fluidframework/map";
import { requestFluidObject } from "@fluidframework/runtime-utils";
import { ChannelFactoryRegistry, createAndAttachContainer, ITestFluidObject } from "@fluidframework/test-utils";
import {
    DataObjectFactoryType,
    generateTest,
    ICompatLocalTestObjectProvider,
    ITestContainerConfig,
} from "./compatUtils";

const mapId = "map";
const registry: ChannelFactoryRegistry = [[mapId, SharedMap.getFactory()]];
const testContainerConfig: ITestContainerConfig = {
    fluidDataObjectType: DataObjectFactoryType.Test,
    registry,
};

const getSnapshot = (container): any =>
        container.context.runtime.pendingStateManager.snapshot();

const tests = (args: ICompatLocalTestObjectProvider) => {
    it("asdf", async function() {
        const loader = args.makeTestLoader(testContainerConfig);
        const container = await createAndAttachContainer(
            "defaultDocumentId",
            args.defaultCodeDetails,
            loader,
            args.urlResolver);
        args.opProcessingController.addDeltaManagers(container.deltaManager as any);
        await args.opProcessingController.pauseProcessing(container.deltaManager as any);
        const dataStore = await requestFluidObject<ITestFluidObject>(container, "default");
        const map = await dataStore.getSharedObject<SharedMap>(mapId);
        map.set("asdfasdfas", "asdfasdf");

        console.log(getSnapshot(container));
    });
};

describe("asdf", () => {
    // TODO: add back compat test once N-2 is 0.28
    generateTest(tests);
});
