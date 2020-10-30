/**
 * Sample component to test SyncBridge
 */
import { DataObject, DataObjectFactory } from '@fluidframework/aqueduct';
import {
  ISyncMessageHandler,
  SyncBridgeOpCodes,
  SyncMessage,
  SyncMessageHandlerResult,
  SyncMessageType
} from '../SyncBridgeTypes';
import { SyncBridge } from '../bridge';
import {TestConnector} from './test-connector';
import { NamedFluidDataStoreRegistryEntries } from "@fluidframework/runtime-definitions";
import { IFluidHandle } from '@fluidframework/core-interfaces';

export class TestComponent extends DataObject implements ISyncMessageHandler {
  private readonly sbClientKey: string = 'sbClientKey';
  private syncBridge!: SyncBridge;

  public static get ComponentName() {
    return 'TestComponent';
  }

  public static getFactory() {
    return this.factory;
  }

  public static readonly factory = new DataObjectFactory(
    TestComponent.ComponentName,
    TestComponent,
    /* sharedObjects */ [],
    /* optionalProviders */ {},
    /* registryEntries */ <NamedFluidDataStoreRegistryEntries>[
            [SyncBridge.name, import("../bridge").then((m) => m.SyncBridge.getFactory())],
            [TestConnector.name, import("./test-connector").then((m) => m.TestConnector.getFactory())]
        ],
    /* onDemandInstantiation */ false
  );

  protected async initializingFirstTime() {
    console.log('TestComponent componentInitializingFirstTime');
    // const response = await this.context.containerRuntime.request({
    //   url: `_create?registryType=SyncBridge`,
    //   headers: { initialConfig: { connectorType: `TestConnector` } }
    // });

    // if (response.status !== 200 || response.mimeType !== 'fluid/object' || response.value == undefined) {
    //   throw new Error('Could not create SyncBridgeClient');
    // }

    const testConnector = await TestConnector.getFactory().createChildInstance(this.context);
    
    const syncBridge = await SyncBridge.getFactory().createChildInstance(this.context, {connectorHandle: testConnector.handle});
    this.root.set(this.sbClientKey, syncBridge.handle);
  }

  protected async hasInitialized() {
    console.log('TestComponent componentHasInitialized');
    // const key = await this.root.wait<string>(this.sbClientKey);
    this.syncBridge = await this.root.get<IFluidHandle<SyncBridge>>(this.sbClientKey).get();
    // this.syncBridge = (await this.requestFluidObject_UNSAFE(key)) as SyncBridge;
    if (!this.syncBridge) {
      throw new Error('Could not load SyncBridge');
    }

    console.log(this.syncBridge);
    // TODO: Ensure sync-bridge fails to instantiate if can't create connections
    //  but never will have null client.
    const client = await this.syncBridge?.ISyncBridgeClientProvider.getSyncBridgeClient();
    client.registerSyncMessageHandler(this);

    await this.testCommands();
  }

  /*====================
    ISyncMessageHandler
    ====================*/

  public get ISyncMessageHandler() {
    return this;
  }

  public handleSyncMessage = async (syncMessage: SyncMessage): Promise<SyncMessageHandlerResult | undefined> => {
    if (
      syncMessage.type === SyncMessageType.ControlMessage &&
      syncMessage.opCode === SyncBridgeOpCodes.PROCESSING_ERROR
    ) {
      const message = syncMessage.payload?.data as SyncMessage;
      const error = syncMessage.payload?.error;
      console.log(
        `TestComponent received control message with: opCode => ${syncMessage.opCode}, type => ${syncMessage.type}`
      );
      console.log(
        `TestComponent received control message with: original Message: opCode => ${message.opCode}, type => ${message.type}`
      );
      console.log(`TestComponent received control message with: error => ${error}`);
    } else {
      console.log(`TestComponent received: opCode => ${syncMessage.opCode}, type => ${syncMessage.type}`);
    }
    return { success: true };
  };

  private testCommands = async (): Promise<void> => {
    console.log('Sending messages from TestComponent');
    // TODO: Ensure sync-bridge fails to instantiate if can't create connections
    //  but never will have null client.
    const client = await this.syncBridge?.ISyncBridgeClientProvider.getSyncBridgeClient();
    const testSuccess = {
      opCode: 'TEST_SUCCESS',
      type: SyncMessageType.SyncOperation,
      payload: {}
    } as SyncMessage;
    client.submit(testSuccess);

    const testFailure = {
      opCode: 'TEST_FAILURE',
      type: SyncMessageType.SyncOperation,
      payload: {}
    } as SyncMessage;
    client.submit(testFailure);

    const testDataUpdate = {
      opCode: 'TEST_DATA_UPDATE',
      type: SyncMessageType.SyncOperation,
      payload: {}
    } as SyncMessage;
    client.submit(testDataUpdate);
  };
}
