import { ConsensusQueue, ConsensusResult } from '@fluidframework/ordered-collection';
import { ISyncMessageHandler, SyncBridgeOpCodes, SyncMessage } from '../../SyncBridgeTypes';
import { IKeyValueStore } from './syncKeyValueStore';
import { EventEmitter } from 'events';
import {
  AcquireCallback,
  AcquireResultType,
  ISyncChannel,
  ISyncChannelFrameworkHandle,
  SyncChannelChangeListener,
  SyncChannelOpType,
  SyncDirection
} from './internalContracts';
import { Deferred } from '@fluidx/utilities';

const channelChanged = 'channelChanged';
const addKey = 'add';

export class SyncChannel extends EventEmitter implements ISyncChannel, ISyncChannelFrameworkHandle {
  protected readonly direction: SyncDirection;
  protected readonly store: IKeyValueStore;
  protected acquireCallback?: AcquireCallback;
  protected messageHandler?: ISyncMessageHandler;
  protected errorHandler?: ISyncMessageHandler;

  // TODO: Remove root: ISharedDirectory (move instantiation outside this layer)
  public constructor(
    channelType: SyncDirection,
    store: IKeyValueStore,
    readonly primaryQueue: ConsensusQueue<SyncMessage>,
    readonly sidelineQueue: ConsensusQueue<SyncMessage>
  ) {
    super();
    this.direction = channelType;
    this.store = store;
    // Register for CQ change add event.
    this.primaryQueue.on(addKey, this.onAddMessage);
  }

  protected onAddMessage = (): void => {
    this.emit(channelChanged, { opType: SyncChannelOpType.MessageAdded, direction: this.direction });
  };

  public getSyncDirection(): SyncDirection {
    return this.direction;
  }

  public registerAcquireCallback(callback: AcquireCallback): void {
    this.acquireCallback = callback;
  }

  public submit = async (message: SyncMessage) => {
    await this.primaryQueue.add(message);
  };

  public getFirstFailedMessage = async (): Promise<SyncMessage | undefined> => {
    let response: Promise<SyncMessage | undefined> | undefined = undefined;
    if (!this.sidelineQueue) {
      return Promise.resolve(undefined);
    }

    this.sidelineQueue?.acquire((message) => {
      response = Promise.resolve(message);
      return Promise.resolve(ConsensusResult.Release);
    });

    if (!response) {
      response = Promise.resolve(undefined);
    }
    return response;
  };

  public removeFirstFailedMessage = async (): Promise<void> => {
    this.sidelineQueue?.acquire((_message) => {
      return Promise.resolve(ConsensusResult.Complete);
    });
  };

  public acquire = async (): Promise<boolean> => {
    return this.primaryQueue.acquire(
      (message): Promise<ConsensusResult> => {
        let promise = new Deferred<ConsensusResult>();
        if (this.acquireCallback) {
          this.acquireCallback(message).then((result) => {
            if (result.resultCode === AcquireResultType.Complete) {
              promise.resolve(ConsensusResult.Complete);
            } else {
              promise.resolve(ConsensusResult.Complete);
            }
          });
        } else {
          promise.resolve(ConsensusResult.Complete);
        }
        return promise;
      }
    );
  };

  public channelChangeListener(listener: SyncChannelChangeListener): void {
    this.on(channelChanged, listener);
  }

  public removeChannelChangeListener(listener: SyncChannelChangeListener): void {
    this.off(channelChanged, listener);
  }

  public getMessageHandler(): ISyncMessageHandler | undefined {
    return this.messageHandler;
  }

  public registerSyncMessageHandler(handler: ISyncMessageHandler): void {
    this.messageHandler = handler;
  }

  public onError = async (message: SyncMessage): Promise<void> => {
    if (message.opCode === SyncBridgeOpCodes.PROCESSING_ERROR) {
      // TODO: Discuss if error details need to go into sideline queue as well?
      let sidelineQueueMessage = message.payload!.data as SyncMessage;
      sidelineQueueMessage.payload!.error = message.payload!.error;
      await this.sidelineQueue.add(sidelineQueueMessage);

      // Notify sender with a control message
      this.errorHandler?.handleSyncMessage(message);
    } else {
      throw new Error('Logic error.');
    }
  };

  public registerSyncErrorHandler(handler: ISyncMessageHandler): void {
    this.errorHandler = handler;
  }
}
