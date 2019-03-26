import { InjectionToken } from "@angular/core";
import { SharedMap } from "@prague/map";

export const PRAGUE_PATH = new InjectionToken<string>("prague.path");
export const PRAGUE_ROOT = new InjectionToken<SharedMap>("prague.root");
