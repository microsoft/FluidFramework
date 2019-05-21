// tslint:disable:no-console
import { AgentScheduler } from "@chaincode/agent-scheduler";
import { Component } from "@prague/app-component";
import { IContainerContext, IRuntime } from "@prague/container-definitions";

const AgentSchedulerType = "@chaincode/agent-scheduler";

export class TestScheduler extends Component {

  public scheduler: AgentScheduler;

  public async opened() {
    await this.connected;
    this.scheduler = await this.runtime.openComponent<AgentScheduler>("scheduler", true);
    console.log(`Ready...`);
  }

  protected async create() {
    await this.runtime.createAndAttachComponent("scheduler", AgentSchedulerType);
  }
}

export async function instantiateRuntime(
  context: IContainerContext,
): Promise<IRuntime> {
  return Component.instantiateRuntime(
    context,
    "@chaincode/agent-scheduler-test",
    new Map(
    [
      ["@chaincode/agent-scheduler-test", Promise.resolve(Component.createComponentFactory(TestScheduler))],
      [AgentSchedulerType, Promise.resolve(Component.createComponentFactory(AgentScheduler))],
    ]));
}
