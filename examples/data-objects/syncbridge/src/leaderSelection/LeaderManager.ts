import { LeaderSelection } from './Leader';
import { IFluidDataStoreRuntime } from '@fluidframework/datastore-definitions';
import { IFluidDataStoreContext } from '@fluidframework/runtime-definitions';
import { EventEmitter } from 'events';

export class LeaderManager extends EventEmitter {
  protected leaderInstanceMap: Map<string, LeaderSelection> = new Map();

  constructor(private readonly runtime: IFluidDataStoreRuntime, private readonly context: IFluidDataStoreContext) {
    super();
  }

  public addLeaderInstance(key: string, leaderInstance: LeaderSelection) {
    this.leaderInstanceMap.set(key, leaderInstance);
  }

  public removeLeaderInstance(key: string) {
    this.leaderInstanceMap.delete(key);
  }

  public invokeAllLeaderSync() {
    this.leaderInstanceMap.forEach(async (leaderSelection: LeaderSelection, key: string) => {
      await leaderSelection.handleLeaderSelection(key, this.runtime, this.context);
    });
  }

  public async getLeaderInstance(key: string) {
    return this.leaderInstanceMap.get(key);
  }

  public async invokeLeaderSelection(key: string) {
    this.leaderInstanceMap.get(key)?.handleLeaderSelection(key, this.runtime, this.context);
  }

  public async createAndTrackLeaderInstance(key: string, handler?: any) {
    const leaderInstance = new LeaderSelection(handler);
    this.addLeaderInstance(key, leaderInstance);
    return leaderInstance;
  }
}
