import { SyncDirection } from '../channel/internalContracts';
import { ISyncConnection } from '../connection/internalContracts';

export interface SyncBridgeClientContext {
  syncDirection: SyncDirection;
}

export interface ISyncBridgeClientHandle {
  getClientId(): string;
  getConnection(): ISyncConnection;
  getClientContext(): SyncBridgeClientContext;
}
