import {
  primaryQueueKey,
  sidelineQueueKey,
  SyncChannelInitConfig
} from './internalContracts';
import { ConsensusQueue } from '@fluidframework/ordered-collection';
import { SyncMessage } from '../../SyncBridgeTypes';
import { IFluidHandle } from '@fluidframework/core-interfaces';
import { SyncChannel } from './syncChannel';
import {v4 as uuid} from 'uuid';

export class SyncChannelFactory {
  public createChannel = async (config: SyncChannelInitConfig): Promise<SyncChannel> => {
    const queues = await this.createOrGetSyncQueues(config);
    const primaryQueue = queues[0];
    const sidelineQueue = queues[1];
    return new SyncChannel(config.syncDirection,config.store, primaryQueue, sidelineQueue);
  };

  private getPrimaryQueueKey(_config: SyncChannelInitConfig): string {
    return primaryQueueKey;
  }

  private getSidelineQueueKey(_config: SyncChannelInitConfig): string {
    return sidelineQueueKey;
  }

  private createOrGetSyncQueues = async (config: SyncChannelInitConfig): Promise<[ConsensusQueue<SyncMessage>, ConsensusQueue<SyncMessage>]> => {
    const primaryQueueKey = this.getPrimaryQueueKey(config);
    const sidelineQueueKey = this.getSidelineQueueKey(config);

    let primaryQueue: ConsensusQueue<SyncMessage> | undefined;
    let sidelineQueue: ConsensusQueue<SyncMessage> | undefined;


    let primaryQueueId: string | undefined = await config.store.get(primaryQueueKey);
    let sidelineQueueId: string | undefined = await config.store.get(sidelineQueueKey);
    if (primaryQueueId && sidelineQueueId) {
      primaryQueue = await config.store.get<IFluidHandle<ConsensusQueue>>(primaryQueueId)?.get();
      sidelineQueue = await config.store.get<IFluidHandle<ConsensusQueue>>(sidelineQueueId)?.get();
    } else {
      primaryQueueId = uuid();
      primaryQueue = ConsensusQueue.create<SyncMessage>(config.runtime, primaryQueueId);
      config.store.set(primaryQueueKey, primaryQueueId);
      config.store.set(primaryQueueId, primaryQueue.handle);

      sidelineQueueId = uuid();
      sidelineQueue = ConsensusQueue.create<SyncMessage>(config.runtime, sidelineQueueId);
      config.store.set(sidelineQueueKey, sidelineQueueId);
      config.store.set(sidelineQueueId, sidelineQueue.handle);
    }

    if (primaryQueue && sidelineQueue) {
      return [primaryQueue, sidelineQueue];
    }
    // TODO: Revisit. Better error handling
    throw new Error('Failed to initialize/load Queues');
  };
}