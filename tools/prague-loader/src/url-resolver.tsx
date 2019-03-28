import * as UrlParse from "url-parse";

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

export interface ILoaderUrl {
  url: string;
}

export function URLToLoaderProps(urlString: string): ILoaderProps {
  const url = UrlParse(urlString, true);
  const pathParts = url.pathname.split("/");
  const container = pathParts[3];
  const tenant = pathParts[2];
  const query = url.query;

  const propsWithoutDiv = {
    containerId: container,
    ordererUrl: "https://" + url.host.replace("www", "alfred"),
    storageUrl: "https://" + url.host.replace("www", "historian"),
    registryUrl: "https://pragueauspkn-3873244262.azureedge.net",
    tenant: tenant,
    token: fetchSecret(tenant),
    path: "",
    chaincode: query["chaincode"]
  };
  return propsWithoutDiv;
}


function fetchSecret(tenant: string): string {
    switch(tenant) {
        case "stupefied-kilby": {
            return "4a9211594f7c3daebca3deb8d6115fe2"
        }
        default: {
            throw new Error("Tenant Not Recognized. Use stupefied kilby.")
        }
    }
}