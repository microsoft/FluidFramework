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
  token?: string;
}

export function URLToLoaderProps(urlString: string): ILoaderProps {
  const url = UrlParse(urlString, true);
  const pathParts = url.pathname.split("/");
  const container = pathParts[3];
  const tenant = pathParts[2];
  const query = url.query;
  const prePath = `${pathParts[0]}\\${pathParts[1]}\\${pathParts[2]}\\${pathParts[3]}`;
  const path = url.pathname.substr(prePath.length);

  const propsWithoutDiv = {
    containerId: container,
    ordererUrl: "https://" + url.host.replace("www", "alfred"),
    storageUrl: "https://" + url.host.replace("www", "historian"),
    registryUrl: "https://pragueauspkn-3873244262.azureedge.net",
    tenant: tenant,
    token: fetchSecret(tenant),
    path: path,
    chaincode: query["chaincode"]
  };
  return propsWithoutDiv;
}


function fetchSecret(tenant: string): string {
    switch(tenant) {
        case "stupefied-kilby": {
            return "4a9211594f7c3daebca3deb8d6115fe2"
        }
        case "prague": {
            return "43cfc3fbf04a97c0921fd23ff10f9e4b";
        }
        default: {
            throw new Error("Tenant Not Recognized. Use stupefied kilby.")
        }
    }
}