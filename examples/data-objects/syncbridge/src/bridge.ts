import { DataObject, DataObjectFactory } from '@fluidframework/aqueduct';
import { IFluidHandle, IFluidObject } from '@fluidframework/core-interfaces';
import {
  // SyncBridgeChannelType,
  ISyncMessageHandler,
  ISyncBridgeClient,
  ISyncBridgeClientProvider,
  IProduceLeaderSelection
} from './SyncBridgeTypes';
import { LeaderManager } from './leaderSelection';
import { LeaderSelection } from './leaderSelection/Leader';
import { ISyncRuntime, SyncRuntime } from './core/syncRuntime';
import { ConsensusQueue } from '@fluidframework/ordered-collection';
import { SyncRunTimeInitializer } from './core/syncRunTimeInitializer';
import { Deferred } from '@fluidx/utilities';

export const SyncBridgeType = "SyncBridge";
export class SyncBridge extends DataObject implements ISyncBridgeClientProvider, IProduceLeaderSelection {
  private readonly connectorKey = 'connectorKey';
  private connector!: IFluidObject;
  private leadersManager!: LeaderManager;
  private syncRuntime!: ISyncRuntime;
  private initializedSyncRuntime = false;

  // Eagerly initializing in hope that singleton instance would be created eagerly.
  private readonly executor = SyncRunTimeInitializer.Instance;
  // Return promise of SyncBridgeClient as SyncRuntime initializes asynchronously.
  private readonly clientPromise = new Deferred<ISyncBridgeClient>();

  public static get ComponentName() {
    return 'SyncBridge';
  }

  public static getFactory() {
    return this.factory;
  }

  public static readonly factory = new DataObjectFactory(SyncBridge.ComponentName, SyncBridge, [ConsensusQueue.getFactory()], {});

  public async initializingFirstTime(initialComponentConfiguration: any | undefined) {
    console.log('SyncBridge initializingFirstTime');
    // Create Connector
    const connectorHandle = initialComponentConfiguration.connectorHandle;
    if (connectorHandle) {
      this.root.set(this.connectorKey, connectorHandle);
    }
  }

  async hasInitialized() {
    console.log('SyncBridge hasInitialized');
    // Load connector
    this.connector = await this.root.get<IFluidHandle<IFluidObject>>(this.connectorKey).get();
    // const connectorKey = await this.root.get<string>(this.connectorKey);
    // console.log(`SyncBridge hasInitialized connectorKey: ${connectorKey}`);
    if (!this.connector) {
      throw new Error('Connector is undefined');
    }
    // if (connectorKey) {
      // this.connector = (await this.requestFluidObject_UNSAFE(connectorKey)) as IFluidObject;
      

      /**
       * Initialize sync-runtime and setup component and connector connection.
       * sync-runtime is the root of sync core object-graph.
       */
      this.executor.execute({
        code: 'InitializeSyncRunTime',
        op: () => {
          if (!this.initializedSyncRuntime && !this.syncRuntime) {
            this.initializedSyncRuntime = true;
            const syncRuntime = new SyncRuntime(this.root, this.runtime);
            syncRuntime.initialize({}, this.connector).then(() => {});
            this.setSyncRuntime(syncRuntime);
          }
        }
      });
    // }
  }

  /*=========================
    ISyncBridgeClientProvider
    =========================*/
  public get ISyncBridgeClientProvider() {
    return this;
  }

  public getSyncBridgeClient(): Promise<ISyncBridgeClient> {
    return this.syncRuntime ? this.syncRuntime.getOutgoingClient() : this.clientPromise;
  }

  private setSyncRuntime = async (syncRuntime: SyncRuntime): Promise<void> => {
    this.syncRuntime = syncRuntime;

    this.syncRuntime.getOutgoingClient().then((client) => {
      this.clientPromise.resolve(client);
    })
  }

  /*===============================
    IProduceLeaderSelection
    ===============================*/
  public get IProduceLeaderSelection() {
    return this;
  }

  public async onLeaderSelected(callback: any) {
    const leaderInstance: LeaderSelection | undefined = await this.leadersManager?.getLeaderInstance(this.id);
    if (leaderInstance) {
      leaderInstance.on('selected', callback);
    }
  }

  public async onLeaderLost(callback: any) {
    const leaderInstance: LeaderSelection | undefined = await this.leadersManager?.getLeaderInstance(this.id);
    if (leaderInstance) {
      leaderInstance.on('lost', callback);
    }
  }

  public async enableLeaderSelection(handler?: any) {
    let leaderInstance: LeaderSelection | undefined = await this.leadersManager?.getLeaderInstance(this.id);
    //  const instance: LeaderSelection = await this.leaderInstancePromise(this.id);
    if (!leaderInstance) {
      leaderInstance = await this.leadersManager?.createAndTrackLeaderInstance(this.id);
    }
    if (leaderInstance) {
      if (handler) {
        await leaderInstance.attachCustomHandler(handler);
      }
      await leaderInstance.handleLeaderSelection(this.id, this.runtime, this.context);
    }
  }
  /*===============================*/

  getConnector(): ISyncMessageHandler | undefined {
    console.log(`SyncBridge getConnector ${this.connector}`);
    return this.connector.ISyncMessageHandler;
  }

  // private async loadConnector(connectorType: string): Promise<IFluidObject> {
  //   const response = await this.context.containerRuntime
  //     url: `_create?registryType=${connectorType}`
  //   });

  //   if (response.status !== 200 || response.mimeType !== 'fluid/object' || response.value == undefined) {
  //     throw new Error(`Could not load connector of type ${connectorType}`);
  //   }

  //   return response.value as IFluidObject;
  // }

  public async isLeader() {
    const leaderInstance: LeaderSelection | undefined = await this.leadersManager?.getLeaderInstance(this.id);
    if (leaderInstance) {
      return leaderInstance.isLeader;
    }
    return Promise.resolve(false);
  }
}
