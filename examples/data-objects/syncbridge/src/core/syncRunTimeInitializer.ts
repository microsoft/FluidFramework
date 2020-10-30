import {v4 as uuid} from 'uuid';

export interface ISyncRunTimeInitializer {
  execute(action: Action): void;
}

export type Operation = (args?: any) => void;

interface Action {
  code: string;
  op: Operation;
  args?: any;
}
/**
 * During load process of a component hasInitialized gets call many times
 * and doing setup sometimes require
 */
export class SyncRunTimeInitializer implements ISyncRunTimeInitializer {
  private actions: Action[] = [];
  private executedOps: Map<string, Action> = new Map<string, Action>();
  private pointer: number = 0;
  private interval: number = 4;
  private executionHandle: any;
  private processedAtLeastOne = false;
  private instanceId = uuid();

  private static _instance: SyncRunTimeInitializer;

  private constructor() {
    this.process();
  }

  static get Instance(): SyncRunTimeInitializer {
    return this._instance || (this._instance = new SyncRunTimeInitializer());
  }

  execute = (action: Action): void => {
    this.actions.push(action);
  };

  private process = (): void => {
    // this.timerId = setTimeout(() => {
    //   this.timerId = setTimeout(this.processCore, this.delay);
    // }, this.delay);
    this.executionHandle = setInterval(this.processCore, this.interval);
  };

  private processCore = (): void => {
    console.log('InstanceId Initializer: ', this.instanceId);
    if (this.actions.length > 0 && this.actions.length > this.pointer) {
      console.log('Executing action : ', this.actions[this.pointer].code);
      this.processedAtLeastOne = true;
      let action = this.actions[this.pointer];
      // Short-circuit if already executed.
      if (this.executedOps.has(action.code)) {
        this.pointer += 1;
        return;
      }

      if (action.args) {
        action.op(action.args);
      } else {
        action.op();
      }
      this.executedOps.set(action.code, action);
      this.pointer += 1;
    } else if (this.processedAtLeastOne) {
      if (this.actions.length - 1 <= this.pointer && this.processedAtLeastOne) {
        console.log('Stopping Initializer');
        this.stopProcessing();
      } else {
        console.log('Skipping : ', this.actions[this.pointer].code);
      }
    }
  };

  private stopProcessing = (): void => {
    if (this.executionHandle) {
      this.actions = [];
      clearInterval(this.executionHandle);
    }
  };
}
