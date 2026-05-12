/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createEmitter } from "@fluid-internal/client-utils";
import type { IContainer } from "@fluidframework/container-definitions/internal";
import type { IDisposable, Listenable } from "@fluidframework/core-interfaces";
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
export class OdspContainerServices implements IOdspContainerServices, IDisposable {
	#disposed = false;
	readonly #container: IContainer;

	public readonly audience: IOdspAudience;

	readonly #events = createEmitter<IOdspContainerServicesEvents>();
	public get events(): Listenable<IOdspContainerServicesEvents> {
		return this.#events;
	}

	public constructor(container: IContainer) {
		this.#container = container;
		this.#container.on("readonly", this.#readonlyEventHandler);
		this.#container.on("metadataUpdate", this.#metadataUpdateEventHandler);
		this.audience = createServiceAudience({
			container,
			createServiceMember: createOdspAudienceMember,
		});
	}

	readonly #readonlyEventHandler = (): void => {
		this.#events.emit("readOnlyStateChanged");
	};

	readonly #metadataUpdateEventHandler = (metadata: Record<string, string>): void => {
		if (metadata.sensitivityLabelsInfo !== undefined) {
			this.#events.emit("sensitivityLabelsInfoChanged");
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
	}

	public getReadOnlyState(): boolean | undefined {
		return this.#container.readOnlyInfo.readonly;
	}

	public getSensitivityLabelsInfo(): string | undefined {
		return this.#container.containerMetadata.sensitivityLabelsInfo;
	}
}
