import { DataStore } from "@prague/app-datastore";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { WebLoader } from "@prague/loader-web";
import { URLToLoaderProps } from "./url-resolver";
import { loadSharepointPragueComponent } from '@ms/office-prague-container';

export function LoadPragueComponent(url: string, token: string, div: HTMLDivElement) {
  if (url.includes("weuprodprv")) {
    console.log("SPO");
    loadSharepointPragueComponent(url, token, div); 
  } else {
    LoadPragueRouterliciousComponent(url, div);
  }
}

async function LoadPragueRouterliciousComponent(url: string, div: HTMLDivElement): Promise<any> {
  const dataStoreParams = URLToLoaderProps(url);

  const dataStore = new DataStore(
    dataStoreParams.ordererUrl,
    dataStoreParams.storageUrl,
    new WebLoader(dataStoreParams.registryUrl),
    new RouterliciousDocumentServiceFactory(),
    dataStoreParams.token,
    dataStoreParams.tenant,
    "anonymous-coward"
  );

  const services: ReadonlyArray<[string, Promise<any>]> = [
    ["div", Promise.resolve(div)],
  ];

  return await dataStore.open(
    dataStoreParams.containerId,
    dataStoreParams.chaincode,
    dataStoreParams.path,
    services
  );
}
