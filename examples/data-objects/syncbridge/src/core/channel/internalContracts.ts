// Channel constants
import { ISyncMessageHandler, SyncMessage } from '../../SyncBridgeTypes';
import { IKeyValueStore } from './syncKeyValueStore';
import { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions';

export const primaryQueueKey = 'primaryQueueKey';
export const sidelineQueueKey = 'sidelineQueueKey';

//#region Sync channel events
// TODO: Maybe add other events like MessageDeleted (as required) etc.
export enum SyncChannelOpType {
  MessageAdded
}

export interface SyncChannelEvent {
  // TODO: Channel Meta Info
  readonly direction: SyncDirection;
  readonly opType: SyncChannelOpType;
  readonly data?: any;
}

export type SyncChannelChangeListener = (event: SyncChannelEvent) => void;
//#endregion

//#region Acquire sync message
export enum AcquireResultType {
  Release,
  Complete
}

export interface AcquireCallbackResult {
  resultCode: AcquireResultType;
}

export type AcquireCallback = (syncMessage: SyncMessage) => Promise<AcquireCallbackResult>;
//#endregion

/**
 * Here 'Outgoing' means channel taking data away from Fluid (e.g. AIM to Planner).
 * 'Incoming' channel bringing data into Fluid (e.g. from Planner to AIM).
 */
export enum SyncDirection {
  Outgoing = 'Outgoing',
  Incoming = 'Incoming'
}

export interface ISyncChannel {
  // Channel messaging APIs
  submit(message: SyncMessage): void | Promise<void>;
  registerSyncMessageHandler(handler: ISyncMessageHandler): void;
  registerSyncErrorHandler(handler: ISyncMessageHandler): void;

  // Sideline queue error access APIs
  getFirstFailedMessage(): Promise<SyncMessage | undefined>;
  removeFirstFailedMessage(): Promise<void>;
}

export interface ISyncChannelFrameworkHandle extends ISyncChannel {
  // Acquire
  acquire(): Promise<boolean>;
  registerAcquireCallback(callback: AcquireCallback): void;

  // Channel change listener APIs
  channelChangeListener(listener: SyncChannelChangeListener): void;
  removeChannelChangeListener(listener: SyncChannelChangeListener): void;

  getSyncDirection(): SyncDirection;
  getMessageHandler(): ISyncMessageHandler | undefined;
  onError(message: SyncMessage): Promise<void>;
}

export interface SyncChannelInitConfig {
  syncDirection: SyncDirection;
  store: IKeyValueStore;
  runtime: IFluidDataStoreRuntime;
}
