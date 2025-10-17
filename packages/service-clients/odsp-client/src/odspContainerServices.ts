/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { IContainer } from "@fluidframework/container-definitions/internal";
import { createServiceAudience } from "@fluidframework/fluid-static/internal";

import type {
	IOdspAudience,
	OdspContainerServices as IOdspContainerServices,
	IOdspContainerServicesEvents,
} from "./interfaces.js";
import { createOdspAudienceMember } from "./odspAudience.js";
import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IDisposable } from "@fluidframework/core-interfaces";

/**
 * @internal
 */
export class OdspContainerServices
	extends TypedEventEmitter<IOdspContainerServicesEvents>
	implements IOdspContainerServices, IDisposable
{
	private _disposed = false;

	public readonly audience: IOdspAudience;

	public constructor(private readonly container: IContainer) {
		super();
		this.container.on("readonly", this.readonlyEventHandler);
		this.container.on("metadataUpdate", this.metadataUpdateEventHandler);
		this.audience = createServiceAudience({
			container,
			createServiceMember: createOdspAudienceMember,
		});
	}

	private readonly readonlyEventHandler = (readonly: boolean) => {
		this.emit("readOnlyStateChanged", readonly);
	};

	private readonly metadataUpdateEventHandler = (metadata: Record<string, string>) => {
		if (metadata?.sensitivityLabelsInfo !== undefined) {
			this.emit("sensitivityLabelChanged", metadata.sensitivityLabelsInfo);
		}
	};

	public get disposed() {
		return this._disposed;
	}

	public dispose() {
		if (this._disposed) {
			return;
		}

		this._disposed = true;
		this.container.off("readonly", this.readonlyEventHandler);
		this.container.off("metadataUpdate", this.metadataUpdateEventHandler);
		this.removeAllListeners();
	}

	public getReadOnlyState(): boolean | undefined {
		return this.container.readOnlyInfo.readonly;
	}
}
