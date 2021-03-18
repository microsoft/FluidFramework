/**
 * Sample connector to test SyncBridge
 */
import { DataObject, DataObjectFactory } from '@fluidframework/aqueduct';
import {
  SyncMessage,
  SyncMessageType,
  SyncMessageHandlerResult,
  SyncBridgeConnectorContext,
  ISyncBridgeConnector,
  ISyncMessageHandler,
  SyncPayload,
  SyncBridgeOpCodes
} from '../SyncBridgeTypes';

export const SyncBridgeTestConnectorType = 'TestConnector';
export class TestConnector extends DataObject implements ISyncBridgeConnector, ISyncMessageHandler {
  private connectorContext!: SyncBridgeConnectorContext;
  private count = 0;

  public static get ComponentName() {
    return 'TestConnector';
  }

  public static getFactory() {
    return this.factory;
  }

  public static readonly factory = new DataObjectFactory(TestConnector.ComponentName, TestConnector, [], {});

  protected async initializingFirstTime() {
    console.log('TestConnector initializingFirstTime');
  }

  protected async hasInitialized() {
    console.log('TestConnector hasInitialized');
  }

  /*==================
  ISyncBridgeConnector
  ====================*/
  public get ISyncBridgeConnector() {
    return this;
  }

  public init(context: SyncBridgeConnectorContext) {
    this.connectorContext = context;
    this.connectorContext.client.registerSyncMessageHandler(this);
  }

  /*==================
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
        `TestConnector received control message with: opCode => ${syncMessage.opCode}, type => ${syncMessage.type}`
      );
      console.log(
        `TestConnector received control message with: original Message: opCode => ${message.opCode}, type => ${message.type}`
      );
      console.log(`TestConnector received control message with: error => ${error}`);
    } else {
      console.log(`TestConnector received: opCode => ${syncMessage.opCode}, type => ${syncMessage.type}`);
    }
    return await this.handleSyncMessageInternal(syncMessage);
  };

  /*===================*/

  private handleSyncMessageInternal = async (message: SyncMessage): Promise<SyncMessageHandlerResult> => {
    switch (message.opCode) {
      case 'TEST_SUCCESS':
        return {
          success: true
        } as SyncMessageHandlerResult;

      case 'TEST_FAILURE':
        return {
          success: false,
          error: 'FATAL ERROR'
        } as SyncMessageHandlerResult;

      case 'TEST_DATA_UPDATE':
        setTimeout(() => {
          this.createDataUpdateMessage(message.opCode).then(() => {});
        }, 1000);
        return {
          success: true
        } as SyncMessageHandlerResult;
    }

    return {
      success: false,
      error: 'UNSUPPORTED_COMMAND'
    } as SyncMessageHandlerResult;
  };

  private createDataUpdateMessage = async (messageId: string) => {
    this.count = this.count + 1;
    if (this.count >= 5) {
      console.log('Connector: Stopping scheduled updates.');
    } else {
      console.log('Connector: Creating scheduled Data update message');
      const message = {
        opCode: 'CONNECTOR_DATA_UPDATE',
        type: SyncMessageType.SyncOperation,
        packet: { data: messageId } as SyncPayload
      } as SyncMessage;

      if (!this.connectorContext || !this.connectorContext.client) {
        throw new Error('SyncBridgeClient is undefined');
      }

      this.connectorContext.client.submit(message);
      setTimeout(() => {
        this.createDataUpdateMessage(messageId).then(() => {});
      }, 5000);
    }
  };
}
