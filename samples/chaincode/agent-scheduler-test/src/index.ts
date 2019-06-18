/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

// tslint:disable no-console
// tslint:disable variable-name
import { IAgentScheduler, instantiateComponent, ITask } from "@chaincode/agent-scheduler";
import { Component } from "@prague/app-component";
import { IComponent, IContainerContext, IRuntime } from "@prague/container-definitions";
import { IComponentRegistry } from "@prague/container-runtime";
import { IComponentFactory } from "@prague/runtime-definitions";

export class TestScheduler extends Component {

  public scheduler!: IAgentScheduler;

  public async opened() {
    await this.connected;
    const response = await this.context.hostRuntime.request({ url: `/scheduler`});
    const component = response.value as IComponent;
    console.log(component.list());
    this.scheduler = component.query<IAgentScheduler>("IAgentScheduler");
    console.log(`Picked tasks`);
    console.log(this.scheduler.pickedTasks());
    for (let i = 0; i < 10; ++i) {
      const taskId = `test${i}`;
      const task = this.createTask(taskId);
      console.log(`Picking ${taskId}`);
      this.scheduler.pick(task).catch((err) => {
        console.log(`Error picking ${taskId}: ${err}`);
      });
    }
    if (this.scheduler.leader) {
      console.log(`LEADER`);
    } else {
      this.scheduler.on("leader", () => {
        console.log(`LEADER NOW`);
      });
    }
  }

  protected async create() {
    await this.runtime.createAndAttachComponent("scheduler", "@chaincode/agent-scheduler");
  }

  private createTask(id: string): ITask {
    return {
      callback: () => {
        console.log(`Running task ${id}`);
      },
      id,
    };
  }
}

class MyRegistry implements IComponentRegistry {
  constructor() {
  }

  public async get(name: string): Promise<IComponentFactory> {
      if (name === "@chaincode/agent-scheduler-test") {
          return Component.createComponentFactory(TestScheduler);
      } else if (name === "@chaincode/agent-scheduler") {
        return { instantiateComponent };
      }
  }
}

export async function instantiateRuntime(
  context: IContainerContext,
): Promise<IRuntime> {
  return Component.instantiateRuntime(
    context,
    "@chaincode/agent-scheduler-test",
    new MyRegistry());
}
