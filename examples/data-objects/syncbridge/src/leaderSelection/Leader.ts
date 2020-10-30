import { EventEmitter } from 'events';
import { IFluidDataStoreContext } from '@fluidframework/runtime-definitions';
import { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions';
import { IFluidObject } from '@fluidframework/core-interfaces';

export enum LeaderChangeEvent {
  selected = 'selected',
  released = 'released',
  lost = 'lost'
}

export enum LeaderHandlertype {
  default = 'scheduler',
  custom = 'custom'
}

export interface LeaderHandler {
  type: LeaderHandlertype;

  invoke(callback: any): Promise<void>;
}

// tslint:disable-next-line: interface-name
export interface ILeader {
  isLeader: Boolean;

  isSyncFrommRemoteEnabled?: Boolean;

  leaderHandler: any;

  registerScheduler(key: string): Promise<void>;

  on(event: 'selected' | 'released' | 'lost', listener: (SyncBridgeClientId: string) => void): this;
}

export class LeaderSelection extends EventEmitter implements ILeader {
  public isLeader: Boolean = false;
  // private isSyncFrommRemoteEnabled: Boolean = false;
  public leaderHandler: any;

  constructor(leaderHandler?: any) {
    super();
    this.leaderHandler = leaderHandler;
  }

  private leaderSchedulerKey: string | undefined;

  public async registerScheduler(key: string): Promise<void> {
    this.leaderSchedulerKey = key;
  }

  public async attachCustomHandler(leaderHandler: any) {
    this.leaderHandler = leaderHandler;
  }

  public async getScheduler(runtime: IFluidDataStoreRuntime) {
    const taskManagerResponse = await runtime.request({ url: '/_scheduler' });
    const schedulerComponent = taskManagerResponse.value as IFluidObject;
    const leaderAgent = schedulerComponent.IAgentScheduler;
    return leaderAgent;
  }

  public async handleLeaderSelection(key: string, runtime: IFluidDataStoreRuntime, context: IFluidDataStoreContext) {
    await this.registerScheduler(key);
    if (this.leaderHandler) {
      await this.leaderHandler.invoke();
      return;
    }

    const leaderAgent = await this.getScheduler(runtime);
    if (context.deltaManager.clientDetails.capabilities.interactive) {
      // tslint:disable-next-line: no-floating-promises
      await leaderAgent!.pick(this.leaderSchedulerKey!, async () => {
        this.isLeader = true;
        this.emit(LeaderChangeEvent.selected, this.leaderSchedulerKey);
      });

      leaderAgent!.on('lost', async (key: any) => {
        if (key === this.leaderSchedulerKey && this.isLeader) {
          this.isLeader = false;
          this.emit(LeaderChangeEvent.lost, this.leaderSchedulerKey);
        }
      });
    }
    return;
  }
}
