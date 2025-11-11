/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter } from "@fluid-internal/client-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IDisposable } from "@fluidframework/core-interfaces";
import { createServiceAudience } from "@fluidframework/fluid-static/internal";

import type {
	IOdspAudience,
	OdspContainerServices as IOdspContainerServices,
	IOdspContainerServicesEvents,
} from "./interfaces.js";
import { createOdspAudienceMember } from "./odspAudience.js";

/**
 * @internal
 */
export class OdspContainerServices
	extends TypedEventEmitter<IOdspContainerServicesEvents>
	implements IOdspContainerServices, IDisposable
{
	#disposed = false;
	readonly #container: IContainer;

	public readonly audience: IOdspAudience;

	public constructor(container: IContainer) {
		super();
		this.#container = container;
		this.#container.on("readonly", this.#readonlyEventHandler);
		this.#container.on("metadataUpdate", this.#metadataUpdateEventHandler);
		this.audience = createServiceAudience({
			container: this.#container,
			createServiceMember: createOdspAudienceMember,
		});
	}

	readonly #readonlyEventHandler = (readonly: boolean): void => {
		this.emit("readOnlyStateChanged", readonly);
	};

	readonly #metadataUpdateEventHandler = (metadata: Record<string, string>): void => {
		if (metadata?.sensitivityLabelsInfo !== undefined) {
			this.emit("sensitivityLabelChanged", metadata.sensitivityLabelsInfo);
		}
	};

	public get disposed(): boolean {
		return this.#disposed;
	}

	public dispose(): void {
		if (this.#disposed) {
			return;
		}

		this.#disposed = true;
		this.#container.off("readonly", this.#readonlyEventHandler);
		this.#container.off("metadataUpdate", this.#metadataUpdateEventHandler);
		this.removeAllListeners();
	}

	public getReadOnlyState(): boolean | undefined {
		return this.#container.readOnlyInfo.readonly;
	}
}
