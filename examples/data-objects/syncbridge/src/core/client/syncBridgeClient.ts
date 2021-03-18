import { ISyncBridgeClient, ISyncMessageHandler, SyncMessage } from '../../SyncBridgeTypes';
import { ISyncBridgeClientHandle, SyncBridgeClientContext } from './internalContracts';
import {v4 as uuid} from 'uuid';
import { ISyncConnection } from '../connection/internalContracts';

export class SyncBridgeClient implements ISyncBridgeClient, ISyncBridgeClientHandle {
  private readonly clientId: string;
  public readonly ISyncBridgeClient: ISyncBridgeClient;

  constructor(private readonly clientContext: SyncBridgeClientContext, private readonly connection: ISyncConnection) {
    this.ISyncBridgeClient = this;
    // Changes on every re-instantiation.
    this.clientId = uuid();
  }

  //#region ISyncBridgeClientHandle implementation
  getClientId = (): string => {
    return this.clientId;
  };

  // TODO: In future an outgoing client could have multiple connections.
  getConnection = (): ISyncConnection => {
    return this.connection;
  };

  getClientContext = (): SyncBridgeClientContext => {
    return this.clientContext;
  };
  //#endregion

  //#region ISyncBridgeClient implementation
  public registerSyncMessageHandler = (handler: ISyncMessageHandler): void => {
    this.connection.registerSyncMessageHandler(handler, this.clientContext);
  };

  public submit = async (message: SyncMessage): Promise<void> => {
    console.log(`SyncBridgeClient with direction ${this.clientContext.syncDirection} submit: ${message.opCode}`);
    this.connection.submit(message, this.clientContext);
  };

  /**
   * Returns failed message at the top of sideline queue without removing it from queue if any, for this component
   */
  public async getFirstFailedMessage(): Promise<SyncMessage | undefined> {
    return this.connection.getFirstFailedMessage(this.clientContext);
  }

  /**
   * Deletes failed message at the top of sideline queue if any, for this component.
   */
  public async removeFirstFailedMessage(): Promise<void> {
    await this.connection.removeFirstFailedMessage(this.clientContext);
  }
  //#endregion
}
