import { loadSharepointPragueComponent } from "@ms/office-prague-container";
import { Loader } from "@prague/container-loader";
import { WebLoader } from "@prague/loader-web";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { HostPlatform } from "./hostPlatform";
import { URLToLoaderProps } from "./urlParser";
import { InsecureUrlResolver } from "./urlResolver";
import { initializeChaincode, registerAttach } from "./utils";

const spoRegex = "^http(s)?:\/\/\\w{0,12}\.www\.office\.com\/content\/bohemia\?.*";
const routerliciousRegex = "^(http(s)?:\/\/)?www\..{3,9}\.prague\.office-int\.com\/loader\/.*";

/**
 * Simple function to test if a URL is a valid SPO or Routerlicious Prague link
 *
 * const spoRegex = "^http(s)?:\/\/\\w{0,12}\.www\.office\.com\/content\/bohemia\?.*";
 *
 * const routerliciousRegex = "^(http(s)?:\/\/)?www\..{3,9}\.prague\.office-int\.com\/loader\/.*"
 *
 * @param url Url to Test
 */
export function isPragueURL(url: string): boolean {
  if (isRouterliciousUrl(url)) {
    return true;
  } else if (isSpoUrl(url)) {
    return true;
  }
  return false;
}

/**
 * A single line, basic function for loading Prague Components.
 *
 * This function purposefully does not expose all functionality.
 *
 * @param url Url of the Prague component to be loaded
 * @param getToken A function that either returns an SPO token, or a Routerlicious tenant token
 * @param div The div to load the component into
 * @param appId The SPO appId. If no SPO AppId available, a consistent and descriptive app name is acceptable
 */
export function LoadPragueComponent(
    url: string,
    getToken: () => Promise<string>,
    div: HTMLDivElement,
    appId: string,
  ): Promise<any> {

  let componentP: Promise<any>;
  if (isRouterliciousUrl(url)) {
    console.log("Routerlicious");
    componentP = LoadPragueRouterliciousComponent(url, div);
  } else if (isSpoUrl(url)) {
    console.log("SPO");
    componentP = loadSharepointPragueComponent(div, url, getToken, undefined, appId);
  }
  return componentP;
}

async function LoadPragueRouterliciousComponent(
    url: string,
    div: HTMLDivElement,
    getToken?: () => Promise<string>,
  ): Promise<any> {
  const loaderParams = await URLToLoaderProps(url, getToken);

  const insecureResolver = new InsecureUrlResolver(
    loaderParams.ordererUrl,
    loaderParams.storageUrl,
    "anonymous-coward",
    loaderParams.token,
  );

  const containerUrl =
  // tslint:disable-next-line: max-line-length
    `${loaderParams.ordererUrl.replace(/^[^:]+/, "prague")}/${encodeURIComponent(loaderParams.tenant)}/${encodeURIComponent(loaderParams.containerId)}`;

  // Ensure '/' separator when concatenating 'baseUrl' and 'path'.
  const baseUrl = `${containerUrl}${
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

function isRouterliciousUrl(url: string): boolean {
  return url.match(routerliciousRegex) ? true : false;
}

function isSpoUrl(url: string): boolean {
  return url.match(spoRegex) ? true : false;
}
