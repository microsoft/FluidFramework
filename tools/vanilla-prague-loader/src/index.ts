/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
  // tslint:disable: max-line-length no-unsafe-any

import { Loader } from "@prague/container-loader";
import { WebLoader } from "@prague/loader-web";
import { OdspDocumentServiceFactory } from "@prague/odsp-socket-storage";
import { RouterliciousDocumentServiceFactory } from "@prague/routerlicious-socket-storage";
import { MultiDocumentServiceFactory } from "./multiDocumentServiceFactory";
import { UrlResolver } from "./url-resolvers/urlResolver";
import { Host, initializeChaincode, registerAttach } from "./utils";

// tslint:disable-next-line: no-var-requires no-require-imports
const packageJson = require("../package.json");

/**
 * A single line, basic function for loading Prague Components.
 *
 * This function purposefully does not expose all functionality.
 *
 * @param url Url of the Prague component to be loaded (spo and spo-df will both be loaded against odsp)
 * @param getToken A function that either returns an SPO token, or a Routerlicious tenant token
 * @param div The div to load the component into
 * @param appId The SPO appId. If no SPO AppId available, a consistent and descriptive app name is acceptable
 */
export function loadPragueComponent(
  url: string,
  getToken: () => Promise<string>,
  div: HTMLDivElement,
  appId: string,
): Promise<any> {

  let componentP: Promise<any>;
  if (isRouterliciousUrl(url)) {
    componentP = loadPragueRouterliciousComponent(url, div, getToken);
  } else if (isSpoUrl(url)) {
    throw new Error("Office.com URLs are not yet supported.");
  } else {
    throw new Error("Non-Compatible Url.");
  }
  return componentP;
}

export async function loadPragueRouterliciousComponent(
  url: string,
  div: HTMLDivElement,
  getToken: () => Promise<string>,
): Promise<any> {

  const registryUrl = "https://pragueauspkn-3873244262.azureedge.net";

  const urlResolver = new UrlResolver(url, getToken);

  // Document service factories
  const r11sDocumentServiceFactory = new RouterliciousDocumentServiceFactory();
  const odspDocumentServiceFactory = new OdspDocumentServiceFactory();
  const documentServiceFactory = new MultiDocumentServiceFactory(
    {
      "prague-odsp:": odspDocumentServiceFactory,
      "prague:": r11sDocumentServiceFactory,
    });

  const codeLoader = new WebLoader(registryUrl);

  const loader = new Loader(
    { resolver: urlResolver },
    documentServiceFactory,
    codeLoader,
    { blockUpdateMarkers: true },
  );

  const container = await loader.resolve({ url });
  const platform = new Host(div);

  registerAttach(loader, container, url, platform);

  // If this is a new document we will go and instantiate the chaincode. For old documents we assume a legacy
  // package.
  if (!container.existing) {
    await initializeChaincode(container, urlResolver.chaincode)
      .catch((error) => {
        console.error("chaincode error", error);
      });
  }
}

/**
 * Create an IFrame for loading Prague Components.
 *
 * @param url Url of the Prague component to be loaded
 * @param getToken A function that either returns an SPO token, or a Routerlicious tenant token
 * @param div The div to load the component into
 * @param appId The SPO appId. If no SPO AppId available, a consistent and descriptive app name is acceptable
 * @param loaderScriptUrl The loader script url you'd lke to use in place of the latest in auspackn
 */
export async function loadIFramedPragueComponent(
  url: string,
  getToken: () => Promise<string>,
  div: HTMLDivElement,
  appId: string,
  loaderScriptUrl?: string): Promise<any> {

  // main.bundle.js refers to the output of webpacking this file.
  const scriptUrl = loaderScriptUrl ? loaderScriptUrl : `https://pragueauspkn-3873244262.azureedge.net/@prague/r11s-vanilla-loader@${packageJson.version}/dist/main.bundle.js`;

  const iframe = document.createElement("iframe");
  iframe.id = "containerid";

  iframe.srcdoc = `
  <!DOCTYPE html>
  <html>

  <head>
  <script type="text/javascript" src=${scriptUrl}></script>
  </head>

  <body>
      <div id="componentDiv"></div>
      <script>
              console.log("Welcome to the IFrame");
              function start(url, token, appId) {
                  console.log(window.vanilla);
                  window.vanilla.loadPragueComponent(url, () => token, document.getElementById("componentDiv"), appId)
              }

              window.addEventListener("message", (message) => {
                  console.log(message);
                  start(message.data.url, message.data.token, message.data.appId);
              })
          </script>
  </body>
  </html>  `;

  div.appendChild(iframe);
  iframe.onload = async () => {
    iframe.contentWindow.postMessage({
      appId,
      token: await getToken(),
      url,
    }, "*");
  };

  return;
}

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

export function isRouterliciousUrl(url: string): boolean {
  return url.match(routerliciousRegex) ? true : false;
}

export function isSpoUrl(url: string): boolean {
  return url.match(spoRegex) ? true : false;
}
