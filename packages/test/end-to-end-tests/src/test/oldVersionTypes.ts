/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as old from "./oldVersion";
import * as old2 from "./oldVersion2";

export type OldApi = typeof old | typeof old2;

export type IContainer = old.IContainer | old2.IContainer;
export type IDocumentServiceFactory = old.IDocumentServiceFactory | old2.IDocumentServiceFactory;
export type IFluidCodeDetails = old.IFluidCodeDetails | old2.IFluidCodeDetails;
export type IFluidDataStoreFactory = old.IFluidDataStoreFactory | old2.IFluidDataStoreFactory;
export type IFluidPackage = old.IFluidPackage | old2.IFluidPackage;
export type ILoader = old.ILoader | old2.ILoader;
export type IRuntimeFactory = old.IRuntimeFactory | old2.IRuntimeFactory;
export type IUrlResolver = old.IUrlResolver | old2.IUrlResolver;
export type LocalResolver = old.LocalResolver | old2.LocalResolver;
export type OldTestDataObject = old.OldTestDataObject | old2.OldTestDataObject;
export type OpProcessingController = old.OpProcessingController | old2.OpProcessingController;
