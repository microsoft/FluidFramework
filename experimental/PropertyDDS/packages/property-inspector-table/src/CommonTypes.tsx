/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { ExpiryTimeType } from "@fluid-experimental/property-properties";

export type IExpiryState = "live" | "expired";
export type IExpiryAction = "expire" | "destroy";

/**
 * The expiry information retrieved by the `getExpiry` method.
 */
export interface IExpiryInfo {
  state: IExpiryState;
  action?: IExpiryAction;
  when?: number;
}

export type IRepoExpiryGetter = (repoUrn: string) => Promise<IExpiryInfo>;

export type IRepoExpirySetter = (repoUrn: string, expiryTime: ExpiryTimeType) => Promise<void>;
