import { ISyncBridgeClient, SyncBridgeClientConfig } from '../SyncBridgeTypes';
import { ISharedDirectory } from '@fluidframework/map';
import { SyncBridgeClientFactory } from './client/syncBridgeClientFactory';
import { ISyncConnectionRegistry, SyncConnectionRegistry } from './connection/syncConnectionRegistry';
import { IFluidObject } from '@fluidframework/core-interfaces';
import { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions';
import { Deferred } from '@fluidx/utilities';

// TODO: Load connector via runtime later.
export interface ISyncRuntime {
  initialize(config: SyncBridgeClientConfig, connector: IFluidObject): Promise<void>
  getOutgoingClient(): Promise<ISyncBridgeClient>;
}

export class SyncRuntime implements ISyncRuntime {
  private readonly clientFactory: SyncBridgeClientFactory;
  private readonly connectionRegistry: ISyncConnectionRegistry;
  // Return promise of SyncBridgeClient as SyncRuntime initializes asynchronously.
  private readonly clientPromise = new Deferred<ISyncBridgeClient>();

  // There can only be one outgoing client
  private outgoingClient?: ISyncBridgeClient;

  constructor(private readonly root: ISharedDirectory,
              private readonly runtime: IFluidDataStoreRuntime,
              clientFactory?: SyncBridgeClientFactory,
              connectionRegistry?: ISyncConnectionRegistry) {
    this.clientFactory = clientFactory ? clientFactory : new SyncBridgeClientFactory(this.root, this.runtime);
    this.connectionRegistry = connectionRegistry ? connectionRegistry : new SyncConnectionRegistry();
    console.log('SyncRuntime ctor');
  }

  initialize = async (config: SyncBridgeClientConfig, connector: IFluidObject): Promise<void> => {
    console.log('syn-runtime initialize called');
    try{
      const client = await this.clientFactory.create(config, connector, this.connectionRegistry);
      this.setOutgoingClient(client);
    } catch (error) {
      //TODO: Better error handling
      console.log(error);
      // TODO: Check the code path and make sure we bubble the error up
      //  and remove this try to let the component know that syn-bridge
      //  has failed to initialize for provided configuration.
      throw new Error(error);
    }
  }

  getOutgoingClient = (): Promise<ISyncBridgeClient> => {
    return this.clientPromise;
  }

  private setOutgoingClient = (client: ISyncBridgeClient): void => {
    this.outgoingClient = client;
    this.clientPromise.resolve(this.outgoingClient);
  }
}