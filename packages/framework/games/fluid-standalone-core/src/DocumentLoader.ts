import { IFluidCodeDetails } from '@fluidframework/container-definitions';
import { Container } from '@fluidframework/container-loader';
import { ComponentData, DataComponentInstantiationFactory } from './DataComponent';
import { ContainerRuntimeFactoryWithDefaultComponent, PrimedComponent } from '@fluidframework/aqueduct';
import { getTinyliciousContainer } from "@fluidframework/get-tinylicious-container";

const documentId = window.location.hash.substring(1);

export interface FluidLoaderConfig {
  pkgName: string;
  pkgVersion: string;
}

function getFactory(name: string) {
    new ContainerRuntimeFactoryWithDefaultComponent(
        name,
        new Map([
            [name, Promise.resolve(DataComponentInstantiationFactory)],
        ]),
    );
  }

async function getDocumentFromContainer(container: Container, url: string): Promise<PrimedComponent> {
    const response = await container.request({ url });

    // Verify the response
    if (response.status !== 200 || response.mimeType !== "fluid/component") {
        throw new Error(`Unable to retrieve component at URL: "${url}"`);
    } else if (response.value === undefined) {
        throw new Error(`Empty response from URL: "${url}"`);
    }

    return response.value;
}


export const loadDocument = async (
  url: string,
  config: FluidLoaderConfig,
): Promise<ComponentData> => {
  const { pkgName, pkgVersion } = config;
  const container = await getTinyliciousContainer(documentId, getFactory(pkgName));
  const document = await getDocumentFromContainer(container, url);
  // Wait for connection
  if (!container.connected){
    await new Promise<void>((resolve) => document.on('connected', () => resolve()));
  }

  if (!container.existing) {
    const details: IFluidCodeDetails = {
      config: {},
      package: `${pkgName}@${pkgVersion}`,
    };

    const quorum = container.getQuorum();

    // And then make the proposal if a code proposal has not yet been made
    if (!quorum.has('code')) {
      await quorum.propose('code', details);
    }
  }

  return await container.attach(url);
};
