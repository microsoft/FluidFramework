import { DataObject, DataObjectFactory } from '@fluidframework/aqueduct';
import { IFluidHandle } from '@fluidframework/core-interfaces';
import { ConsensusQueue, ConsensusCallback, ConsensusResult } from '@fluidframework/ordered-collection';
import { SyncMessage, SyncPayload, SyncMessageHandlerResult, ISyncMessageHandler } from '../SyncBridgeTypes';
import { CommandProcessor } from './CommandProcessor';
import { SyncBridge } from '../bridge';

export class SyncBridgeChannel extends DataObject {
  private readonly keyPrimaryQueue: string = 'primaryQueue';
  private readonly keySidelineQueue: string = 'sidelineQueue';

  private primaryQueue: ConsensusQueue<SyncMessage> | undefined;
  private sidelineQueue: ConsensusQueue<SyncMessage> | undefined;

  private commandProcessor: CommandProcessor | undefined;
  private syncBridge: SyncBridge | undefined;

  public static get ComponentName() {
    return 'SyncBridgeChannel';
  }

  public static getFactory() {
    return this.factory;
  }

  public static readonly factory = new DataObjectFactory(
    SyncBridgeChannel.ComponentName,
    SyncBridgeChannel,
    /* sharedObjects */ [ConsensusQueue.getFactory()],
    /* optionalProviders */ {},
    /* registryEntries */ undefined,
    /* onDemandInstantiation */ false
  );

  protected async initializingFirstTime() {
    console.log('SyncBridgeChannel componentInitializingFirstTime');

    this.primaryQueue = ConsensusQueue.create<SyncMessage>(this.runtime, this.keyPrimaryQueue);
    this.root.set(this.keyPrimaryQueue, this.primaryQueue.handle);

    this.sidelineQueue = ConsensusQueue.create<SyncMessage>(this.runtime, this.keySidelineQueue);
    this.root.set(this.keySidelineQueue, this.sidelineQueue.handle);
  }

  protected async hasInitialized(): Promise<void> {
    console.log('SyncBridgeChannel componentHasInitialized');

    this.primaryQueue = await this.root.get<IFluidHandle<ConsensusQueue>>(this.keyPrimaryQueue).get();
    this.sidelineQueue = await this.root.get<IFluidHandle<ConsensusQueue>>(this.keySidelineQueue).get();

    this.commandProcessor = new CommandProcessor(this, this.primaryQueue);
    this.commandProcessor.initialize();
  }

  /**
   * Enqueue incoming command into primary queue
   */
  public send(message: SyncMessage) {
    console.log('SyncBridgeChannel send');
    if (!this.primaryQueue) {
      throw new Error('Primary queue is undefined');
    }

    this.primaryQueue.add(message);
  }

  /**
   * Returns failed message at the top of sideline queue without removing it from queue if any, for this component
   */
  public async getFirstFailedMessage(): Promise<SyncMessage | undefined> {
    let response: Promise<SyncMessage | undefined> | undefined = undefined;
    this.sidelineQueue?.acquire((message) => {
      response = Promise.resolve(message);
      return Promise.resolve(ConsensusResult.Release);
    });

    if (!response) {
      response = Promise.resolve(undefined);
    }
    return response;
  }

  /**
   * Deletes failed message at the top of sideline queue if any, for this component.
   */
  public async removeFirstFailedMessage(): Promise<void> {
    this.sidelineQueue?.acquire((_message) => {
      return Promise.resolve(ConsensusResult.Complete);
    });
  }

  // TODO define peek methods

  public async processNextCommand(): Promise<boolean> {
    console.log('SyncBridgeChannel processNextCommand');
    if (!this.primaryQueue) {
      throw new Error('Primary queue is undefined');
    }

    const result = await this.primaryQueue?.acquire(this.callback);
    console.log('-------After executing command----------');
    console.log(this.primaryQueue);
    console.log(this.sidelineQueue);
    return result;
  }

  private callback: ConsensusCallback<SyncMessage> = async (message: SyncMessage): Promise<ConsensusResult> => {
    console.log(`ConsensusCallback: ${message}`);
    const connector: ISyncMessageHandler | undefined = this.syncBridge?.getConnector();
    if (!connector) {
      console.log('ConsensusCallback connector is undefined');
      return ConsensusResult.Release; // TODO it would cause to go into loop
    }

    const response: SyncMessageHandlerResult | undefined = await connector.handleSyncMessage(message);
    // In case of success, remove from primary queue
    if (!response || !response.success) {
      // Failed to execute command, move to sideline queue
      console.log('Connector failed to handle message properly. Moving command to sideline queue');
      message.payload = { data: message.payload?.data, error: response?.error } as SyncPayload;
      await this.sidelineQueue?.add(message);
    } else {
      console.log('Message processed successfully!');
    }

    return ConsensusResult.Complete;
  };

  public setSyncBridge(syncBridge: SyncBridge) {
    this.syncBridge = syncBridge;
  }
}
