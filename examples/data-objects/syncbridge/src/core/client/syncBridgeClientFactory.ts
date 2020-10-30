import { ISyncBridgeClient, SyncBridgeClientConfig, SyncBridgeConnectorContext } from '../../SyncBridgeTypes';
import { IDirectory, ISharedDirectory } from '@fluidframework/map';
import { SyncKeyValueStore } from '../channel/syncKeyValueStore';
import { SyncChannelFactory } from '../channel/syncChannelFactory';
import { ISyncChannelFrameworkHandle, SyncDirection } from '../channel/internalContracts';
import { SyncConnection } from '../connection/syncConnection';
import { ISyncBridgeClientHandle } from './internalContracts';
import { SyncBridgeClient } from './syncBridgeClient';
import { SyncChannelProcessor } from '../channel/syncChannelProcessor';
import { ISyncConnectionRegistry } from '../connection/syncConnectionRegistry';
import { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions';
import { IFluidObject } from '@fluidframework/core-interfaces';


// TODO: For 1:1 interaction between single component and connector this is hardcoded.
//  Routing scheme and maybe registry should be thought of when multi-connector support
//  needs to be added. Or, in next version (even before multi-connector) component and
//  connector Id could be utilized to make it more dynamic.
const outgoingChannelStorePath = '/channel/out/meta';
const incomingChannelStorePath = '/channel/in/meta';

export class SyncBridgeClientFactory {
  constructor(private readonly root: ISharedDirectory,
              private readonly runtime: IFluidDataStoreRuntime) {}

  public create = async (_config: SyncBridgeClientConfig, connector: IFluidObject, connectionRegistry: ISyncConnectionRegistry): Promise<ISyncBridgeClient> =>{
    // create channels
    let outgoingChannel = await this.createChannel(SyncDirection.Outgoing, this.getOutgoingChannelStorePath());
    let incomingChannel = await this.createChannel(SyncDirection.Incoming, this.getIncomingChannelStorePath());

    // create processors
    let outChannelProcessor = new SyncChannelProcessor((outgoingChannel as ISyncChannelFrameworkHandle));
    let inChannelProcessor = new SyncChannelProcessor((incomingChannel as ISyncChannelFrameworkHandle));

    outChannelProcessor.registerListeners();
    inChannelProcessor.registerListeners();

    // Establish connection between all actors of interaction and create object-graph relative to connection
    let connection = new SyncConnection(outgoingChannel, incomingChannel, outChannelProcessor, inChannelProcessor);
    connectionRegistry.registerConnection(connection);

    // create outgoing and incoming clients.
    let outgoingClient = new SyncBridgeClient({ syncDirection: SyncDirection.Outgoing}, connection);
    let incomingClient = new SyncBridgeClient({ syncDirection: SyncDirection.Incoming}, connection);

    // Set querying, callback client handles with connection.
    connection.setIncomingClientHandle((incomingClient as ISyncBridgeClientHandle));
    connection.setOutgoingClientHandle((outgoingClient as ISyncBridgeClientHandle));

    // Provide client to connector
    const context = {
      client: incomingClient
    } as SyncBridgeConnectorContext;
    connector.ISyncBridgeConnector?.init(context);

    return new SyncBridgeClient({syncDirection: SyncDirection.Outgoing}, connection);
  }

  private createChannel = (channelType: SyncDirection, path: string) => {
    // create subdirectories if not already present.
    let directory: IDirectory = this.createOrGetWorkingDirectory(path);
    let store = new SyncKeyValueStore(path, directory);
    let factory = new SyncChannelFactory();
    return factory.createChannel({ syncDirection: channelType, store: store, runtime: this.runtime});
  }

  private createOrGetWorkingDirectory = (path: string) => {
    let directory: IDirectory = this.root.getWorkingDirectory(path);
    if (!directory) {
      directory = this.root;
      const parts = path.split('/');
      for (const part of parts) {
        if (part.length > 0) {
          let tempDirectory = directory.getSubDirectory(part);
          // Directory might have been created already but
          // the sub-directory might need to be created.
          if (!tempDirectory) {
            directory = directory.createSubDirectory(part);
          } else {
            directory = tempDirectory;
          }
        }
      }
    }
    return directory;
  }

  // TODO: Make it dynamic and unique later.
  private getOutgoingChannelStorePath = (): string => {
    return outgoingChannelStorePath;
  }

  // TODO: Make it dynamic and unique later.
  private getIncomingChannelStorePath = (): string => {
    return incomingChannelStorePath;
  }
}
