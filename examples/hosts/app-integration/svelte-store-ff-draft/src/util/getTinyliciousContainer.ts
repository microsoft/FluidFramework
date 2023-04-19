// getTinyliciousContainer.ts
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SharedMap } from "@fluidframework/map";
import type { IFluidContainer, ContainerSchema } from "fluid-framework";

const containerSchema: ContainerSchema = {
  initialObjects: {
    root: SharedMap,
  },
};

export async function getTinyliciousContainer(
  containerId?: string
): Promise<IFluidContainer> {
  const client = new TinyliciousClient();
  let container: IFluidContainer;

  if (containerId) {
    try {
      ({ container } = await client.getContainer(containerId, containerSchema));
    } catch {
      ({ container } = await client.createContainer(containerSchema));
      const id = await container.attach();
      location.hash = id;
    }
  } else {
    ({ container } = await client.createContainer(containerSchema));
    const id = await container.attach();
    location.hash = id;
  }

  return container;
}
