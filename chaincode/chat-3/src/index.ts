import {
  IContainerContext,
  IPlatform,
} from "@prague/container-definitions";
import { renderChat } from "./chat";
import { Runtime } from "./runtime/runtime";

export class ChatRunner {
  constructor(private runtime: Runtime) {
  }

  public async attach(platform: IPlatform): Promise<IPlatform> {
      const hostContent: HTMLElement = await platform.queryInterface<HTMLElement>("div");
      if (!hostContent) {
          return;
      }
      renderChat(this.runtime, hostContent);
  }
}

export async function instantiateRuntime(context: IContainerContext): Promise<Runtime> {
  const runtime = await Runtime.Load(context);

  runtime.registerRequestHandler(async (request) => {
    return { status: 200, mimeType: "prague/component", value: new ChatRunner(runtime) };
  });

  return runtime;
}
