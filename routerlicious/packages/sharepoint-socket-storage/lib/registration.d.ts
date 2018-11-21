import * as api from "@prague/client-api";
import * as resources from "@prague/gitresources";
import { ITokenProvider, IUser } from "@prague/runtime-definitions";
export declare function load(snapshotUrl: string, deltaFeedUrl: string, webSocketUrl: string, id: string, tenantId: string, user: IUser, tokenProvider: ITokenProvider, options?: any, version?: resources.ICommit, connect?: boolean): Promise<api.Document>;
