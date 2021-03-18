import { ISyncMessageHandler, SyncMessage } from '../../SyncBridgeTypes';
import { ISyncBridgeClientHandle, SyncBridgeClientContext } from '../client/internalContracts';

export interface ISyncConnection {
  submit(message: SyncMessage, clientContext: SyncBridgeClientContext): void;
  registerSyncMessageHandler(handler: ISyncMessageHandler, clientContext: SyncBridgeClientContext): void;

  setOutgoingClientHandle(handle: ISyncBridgeClientHandle): void;
  setIncomingClientHandle(handle: ISyncBridgeClientHandle): void;

  // Sideline queue error access APIs
  getFirstFailedMessage(clientContext: SyncBridgeClientContext): Promise<SyncMessage | undefined>;
  removeFirstFailedMessage(clientContext: SyncBridgeClientContext): Promise<void>;

  getConnectionId(): string;
}
