import { DataObject, DataObjectFactory } from "@fluidframework/aqueduct";
import { ISyncBridgeConnector, ISyncMessageHandler, SyncBridgeConnectorContext, SyncMessage, SyncMessageHandlerResult } from "syncbridge";
import { IStorageUtil, StorageUtil } from "../storage";

export class AzureBlobConnector extends DataObject implements ISyncBridgeConnector, ISyncMessageHandler {
    private connectorContext!: SyncBridgeConnectorContext;
    public StorageUtilModule: IStorageUtil;

    public static get ComponentName() {
        return 'AzureBlobConnector';
      }
    
      public static readonly factory = new DataObjectFactory(AzureBlobConnector.ComponentName, AzureBlobConnector, [], {});

      protected async initializingFirstTime() {
        console.log('TestConnector initializingFirstTime');
      }
    
      protected async hasInitialized() {
        if (!isWebClient()){
            this.StorageUtilModule = new StorageUtil(this.context.documentId);

        }
        else{
        this.StorageUtilModule = new StorageUtil(this.context.documentId, true);
        }
        console.log('TestConnector hasInitialized');
      }
    
      public get ISyncBridgeConnector() {
        return this;
      }

      public get ISyncMessageHandler() {
        return this;
      }

      public init(context: SyncBridgeConnectorContext) {
        this.connectorContext = context;
        this.connectorContext.client.registerSyncMessageHandler(this);
      }
    

      public handleSyncMessage = async (syncMessage: SyncMessage): Promise<SyncMessageHandlerResult | undefined> => {
        
        return await this.handleSyncMessageInternal(syncMessage);
      };

      private handleSyncMessageInternal = async (message: SyncMessage): Promise<SyncMessageHandlerResult> => {
        switch (message.opCode) {
            case 'UPDATE_STORE_DATA':
                this.StorageUtilModule.storeEditorStateAsMarkdown("", message.payload.data);

              return {
                success: true
              } as SyncMessageHandlerResult;
            }
      }
    
      public static getFactory() {
        return this.factory;
      }
}


const isWebClient = () => {
    return typeof window !== "undefined" && typeof window.document !== "undefined";
};