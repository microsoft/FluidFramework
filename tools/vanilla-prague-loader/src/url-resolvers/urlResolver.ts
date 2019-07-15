/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  IRequest,
  IResolvedUrl,
  ITokenClaims,
  IUrlResolver,
} from "@prague/container-definitions";
import { IClientConfig, IODSPTokens } from "@prague/odsp-utils";
import * as jwt from "jsonwebtoken";
import * as UrlParse from "url-parse";
import { isSpoTenant, spoJoinSession } from "../utils/odsp-utils";

export class UrlResolver implements IUrlResolver {
  public chaincode: string;
  public container: string;
  public tenant: string;

  constructor(
    private urlString: string,
    private getToken?: () => Promise<string>,
  ) {

    const url = UrlParse(this.urlString, true);
    const pathParts = url.pathname.split("/");
    const container = pathParts[3];
    const tenant = pathParts[2];
    const query = url.query;

    this.chaincode = query.chaincode;
    this.tenant = tenant;
    this.container = container;
  }

  public async resolve(request: IRequest): Promise<IResolvedUrl> {
    const url = UrlParse(request.url, true);
    const pathParts = url.pathname.split("/");
    const prePath = `${pathParts[0]}/${pathParts[1]}/${pathParts[2]}/${pathParts[3]}`;
    const base = `${url.host.replace("www", "alfred")}${prePath}`;
    console.log(url);
    // TODO: we should probably not use base, we should just use the request.url

    if (isSpoTenant(this.tenant)) {
      // resolve to SPO
      const microsoftLogin: IClientConfig = {
        clientId: "",
        clientSecret: "",
      };

      const token: IODSPTokens = {
        accessToken: await this.getToken(),
        refreshToken: await this.getToken(),
      };

      const tokens = {
        "microsoft-my.sharepoint-df.com": token,
        "microsoft-my.sharepoint.com": token,
      };

      return spoJoinSession(this.tenant, this.container, tokens, microsoftLogin);

    } else {
      const storageUrl = `https://${url.host.replace("www", "historian")}/repos/${this.tenant}`;
      const ordererUrl = `https://${url.host.replace("www", "alfred")}`;
      const deltaStorageUrl = `${ordererUrl}/deltas/${this.tenant}/${this.container}`;

      return {
        endpoints: {
          deltaStorageUrl,
          ordererUrl,
          storageUrl,
        },
        tokens: {
          jwt: auth(this.tenant, this.container, await fetchSecret(this.tenant, this.getToken)),
          socketToken: "tokenB",
          storageToken: "tokenA",
        },
        type: "prague",
        url: `prague://${base.replace("loader/", "")}`,
      };
    }
  }
}

export async function fetchSecret(tenant: string, getToken: () => Promise<string>): Promise<string> {
  switch (tenant) {
    case "prague": {
      return "43cfc3fbf04a97c0921fd23ff10f9e4b";
    }
    case "stupefied-kilby":
    case "elastic-dijkstra":
    case "github":
      throw new Error("In preparation for Fluid going open source, these tenants have been deprecated. " +
        "Please use the \"prague\" tenant, or provide your own tenant");
    default: {
      if (!getToken) {
        throw new Error("Tenant Not Recognized. No getToken function provided.");

      }
      return getToken();
    }
  }
}

function auth(tenantId: string, documentId: string, secret: string) {
  const claims: ITokenClaims = {
    documentId,
    permission: "read:write",
    tenantId,
    user: { id: "anonymous-coward" },
  };

  // tslint:disable-next-line: no-unsafe-any
  return jwt.sign(claims, secret);
}
