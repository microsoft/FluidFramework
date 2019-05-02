import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { URLToLoaderProps } from "./urlParser";
import { Loader } from "@prague/container-loader";
import { InsecureUrlResolver } from "./urlResolver";
import { HostPlatform } from "./hostPlatform";
import { registerAttach, initializeChaincode } from "./utils";
import { LocalLoader } from "./localLoader";

export interface ILoaderProps {
  containerId: string; // ID of the container
  ordererUrl: string; // "Alfred" "localhost:3000" "alfred.wu2..."
  storageUrl: string; // "Historian" "localhost:3003" "historian.wu2..."
  // (registryUrl is a different endpoint than verdaccio)
  registryUrl: string; // "Auspkn" "localhost:3002" https://pragueauspkn-3873244262.azureedge.net"
  chaincode: string;
  path: string;
  tenant: string;
  token: string;
}

/**
 * Entry point for loading a routerlicious component against wu2
 * TODO: clean this up so that it get's rid of all the fluff from the vanilla-loader
 * @param div div element for th component to be rendered in
 * @param documentId the id for the local component to connect to
 */ 
export async function LoadPragueRouterliciousComponent(div: HTMLDivElement, documentId: string): Promise<any> {
  const url = `https://www.wu2.prague.office-int.com/loader/prague/${documentId}?chaincode=@chaincode/counter@0.0.5449`;
  const loaderParams = URLToLoaderProps(url);

  const insecureResolver = new InsecureUrlResolver(
    loaderParams.ordererUrl,
    loaderParams.storageUrl,
    "anonymous-coward",
    loaderParams.token,
  );
console.log(loaderParams.path);
  const containerUrl =
  // tslint:disable-next-line:max-line-length
  `${loaderParams.ordererUrl.replace(/^[^:]+/, "prague")}/${encodeURIComponent(loaderParams.tenant)}/${encodeURIComponent(loaderParams.containerId)}`; // /${encodeURIComponent(loaderParams.path)}`;

  const baseUrl = `${containerUrl}${
    // Ensure '/' separator when concatenating 'baseUrl' and 'path'.
    (loaderParams.path && loaderParams.path.charAt(0)) !== "/" ? "/" : ""
  }${loaderParams.path}`;

  const codeLoader = new LocalLoader(loaderParams.registryUrl);
  const documentServiceFactory = new RouterliciousDocumentServiceFactory();

  const loader = new Loader(
    { resolver: insecureResolver },
    documentServiceFactory,
    codeLoader,
    { blockUpdateMarkers: true }
  );

  const container = await loader.resolve({ url: baseUrl });
  console.log("resolved container");

  const platform = new HostPlatform(div);
  console.log("Got Platform");
  registerAttach(loader, container, baseUrl, platform);

  console.log("Attaching");

      // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
    // package.
  if (!container.existing) {
    await initializeChaincode(container, loaderParams.chaincode)
        .catch((error) => console.error("chaincode error", error));
  }
}