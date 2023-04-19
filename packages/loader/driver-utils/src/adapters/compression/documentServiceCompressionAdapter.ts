/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDocumentService, IDocumentStorageService } from "@fluidframework/driver-definitions";
import { ICompressionStorageConfig } from "../predefinedAdapters";
import { DocumentServiceProxy } from "../../documentServiceProxy";

export class DocumentServiceFactoryCompressionAdapter extends DocumentServiceProxy {

  constructor(
	service: IDocumentService,
	private readonly _config: ICompressionStorageConfig,
  ) {
	super(service);
  }

  public async connectToStorage(): Promise<IDocumentStorageService> {
	return this.service.connectToStorage();		
}



}