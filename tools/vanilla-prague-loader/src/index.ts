import { loadSharepointPragueComponent } from "@ms/office-prague-container";
import { Loader } from "@prague/container-loader";
import { WebLoader } from "@prague/loader-web";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { HostPlatform } from "./hostPlatform";
import { URLToLoaderProps } from "./urlParser";
import { InsecureUrlResolver } from "./urlResolver";
import { initializeChaincode, registerAttach } from "./utils";

export function LoadPragueComponent(
    url: string,
    getToken: () => Promise<string>,
    div: HTMLDivElement,
    appId: string,
  ): Promise<any> {

  let componentP: Promise<any>;
  if (url.match("^(http(s)?:\/\/)?www\..{3,9}\.prague\.office-int\.com\/loader\/.*")) {
    console.log("Routerlicious");
    componentP = LoadPragueRouterliciousComponent(url, div);
  } else if ((url.includes("weuprodprv") || url.includes("ncuprodprv")) && url.includes("bohemia")) {
    console.log("SPO");
    componentP = loadSharepointPragueComponent(div, url, getToken, undefined, appId);
  }
  return componentP;
}

async function LoadPragueRouterliciousComponent(url: string, div: HTMLDivElement): Promise<any> {
  const loaderParams = URLToLoaderProps(url);

  const insecureResolver = new InsecureUrlResolver(
    loaderParams.ordererUrl,
    loaderParams.storageUrl,
    "anonymous-coward",
    loaderParams.token,
  );

  const containerUrl =
    `${loaderParams.ordererUrl.replace(/^[^:]+/, "prague")}
    /${encodeURIComponent(loaderParams.tenant)}
    /${encodeURIComponent(loaderParams.containerId)}`;

  const baseUrl = `${containerUrl}${
    // Ensure '/' separator when concatenating 'baseUrl' and 'path'.
    (loaderParams.path && loaderParams.path.charAt(0)) !== "/" ? "/" : ""
  }${loaderParams.path}`;

  const codeLoader = new WebLoader(loaderParams.registryUrl);
  const documentServiceFactory = new RouterliciousDocumentServiceFactory();

  const loader = new Loader(
    { resolver: insecureResolver },
    documentServiceFactory,
    codeLoader,
    { blockUpdateMarkers: true },
  );

  const container = await loader.resolve({ url: baseUrl });
  const platform = new HostPlatform(div);
  registerAttach(loader, container, baseUrl, platform);

  // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
  // package.
  if (!container.existing) {
    await initializeChaincode(container, loaderParams.chaincode)
        .catch((error) => console.error("chaincode error", error));
  }
}
