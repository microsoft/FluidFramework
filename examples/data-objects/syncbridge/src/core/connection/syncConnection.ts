import { ISyncMessageHandler, SyncMessage } from '../../SyncBridgeTypes';
import { ISyncChannel, SyncDirection } from '../channel/internalContracts';
import { ISyncBridgeClientHandle, SyncBridgeClientContext } from '../client/internalContracts';
import { ISyncConnection } from './internalContracts';
import { SyncChannelProcessor } from '../channel/syncChannelProcessor';
import {v4 as uuid} from 'uuid';

// TODO: Would be good to have component and connector id/meta etc.
export class SyncConnection implements ISyncConnection {
  // Set as part of framework and thus not making it nullable.
  // TODO: Remove if not required in next 4 weeks. Date when TODO was added: 10/08/2020
  // TODO: Write unit test for set function being called as type is not nullable.
  // @ts-ignore
  private outgoingClientHandle!: ISyncBridgeClientHandle;
  // @ts-ignore
  private incomingClientHandle!: ISyncBridgeClientHandle;

  private readonly connectionId: string;

  // TODO: Revisit. Processors are probably not required here.
  //  But for now a sync-connection holds state of a connection
  //  between two actors and builds the object graph
  // TODO: Access (visibility).
  constructor(readonly outgoingChannel: ISyncChannel,
              readonly incomingChannel: ISyncChannel,
              readonly outgoingSyncChannelProcessor: SyncChannelProcessor,
              readonly incomingSyncChannelProcessor: SyncChannelProcessor) {

    this.connectionId = uuid();
  }

  /**
   * Per process-session based id is being generated for now. As we only
   * support in-memory registry for now.
   */
  getConnectionId = (): string => {
    return this.connectionId;
  }

  // TODO: Add sync direction to client handle and converge to a single method.
  setOutgoingClientHandle = (handle: ISyncBridgeClientHandle): void => {
    this.outgoingClientHandle = handle;
  }

  setIncomingClientHandle = (handle: ISyncBridgeClientHandle): void => {
    this.incomingClientHandle = handle;
  }

  registerSyncMessageHandler = (handler: ISyncMessageHandler, clientContext: SyncBridgeClientContext): void => {
    /**
     * Note: Below the assignment is in OPPOSITE direction (linguistically) as
     * outgoing data needs to be received by the actor
     * producing the incoming data and vice-versa.
     */
    if (clientContext.syncDirection === SyncDirection.Outgoing) {
      this.incomingChannel.registerSyncMessageHandler(handler);
      this.outgoingChannel.registerSyncErrorHandler(handler);
    } else {
      this.outgoingChannel.registerSyncMessageHandler(handler);
      this.incomingChannel.registerSyncErrorHandler(handler);
    }
  }

  // TODO: The path should be async. Revisit and correct.
  submit = (message: SyncMessage, clientContext: SyncBridgeClientContext): void => {
    this.getChannel(clientContext).submit(message);
  }

  getFirstFailedMessage = (clientContext: SyncBridgeClientContext): Promise<SyncMessage | undefined> => {
    return this.getChannel(clientContext).getFirstFailedMessage();
  }

  removeFirstFailedMessage = (clientContext: SyncBridgeClientContext): Promise<void> => {
    return this.getChannel(clientContext).removeFirstFailedMessage();
  }

  private getChannel = (clientContext: SyncBridgeClientContext): ISyncChannel => {
    return clientContext.syncDirection === SyncDirection.Outgoing ? this.outgoingChannel : this.incomingChannel;
  }
}