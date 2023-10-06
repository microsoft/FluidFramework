/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type IChannelAttributes,
	type IFluidDataStoreRuntime,
	type IChannelServices,
	type IChannelFactory,
} from "@fluidframework/datastore-definitions";
import { DataProcessingError } from "@fluidframework/telemetry-utils";
import { type SharedObject } from "@fluidframework/shared-object-base";
import { Spanner } from "./spanner";
import { SpannerChannelServices } from "./spannerChannelServices";
import { attributesMatch } from "./utils";

/**
 * {@link @fluidframework/datastore-definitions#IChannelFactory} for {@link Spanner}.
 *
 * Creates the spanner class that allows it to transition between two different SharedObjects.
 *
 * @sealed
 */
export class SpannerFactory<TOld extends SharedObject, TNew extends SharedObject>
	implements IChannelFactory
{
	public constructor(
		private readonly oldFactory: IChannelFactory,
		private readonly newFactory: IChannelFactory,
	) {}

	/**
	 * Not sure what this should look like as the type needs to match whatever shared object we are trying to load.
	 *
	 * {@link @fluidframework/datastore-definitions#IChannelFactory."type"}
	 */
	public get type(): string {
		return this.oldFactory.type;
	}

	/**
	 * Not sure what this should look like as the attributes are different depending on whether we're loading from the
	 * old SharedObject or new SharedObject. There should only be one factory per Spanner.
	 *
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.attributes}
	 */
	public get attributes(): IChannelAttributes {
		return this.oldFactory.attributes;
	}

	/**
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.load}
	 *
	 * Not sure the optimal load flow, the pieces are
	 * 1. Creating the SpannerChannelServices to intercept the deltaHandler
	 * 2. Loading the old SharedObject or the new SharedObject depending on the attributes
	 * 3. Creating the Spanner which needs to know either if it's getting the old SharedObject and new Factory or the
	 * new SharedObject.
	 * 4. Connecting the Spanner to the SpannerChannelServices
	 * 5. Connecting the SpannerChannelServices to the Spanner
	 * The hardest challenge here is the ordering of creation so steps 2, 4, and 5 are done in a clean way.
	 */
	public async load(
		runtime: IFluidDataStoreRuntime,
		id: string,
		services: IChannelServices,
		attributes: IChannelAttributes,
	): Promise<Spanner<TOld, TNew>> {
		// delta connection intercept generated here
		// The challenge here is that the Spanner needs to be able to intercept the delta connection and give its delta
		// connection a special SpannerDeltaHandler that can process the migrate/barrier op,
		const spannerServices = new SpannerChannelServices(services);

		// Not sure if the spanner should be taking in both factories. It makes sense to do loading at the factory
		// level, but then the intercept SpannerChannelServices, which acts like an adapter layer between the Spanner
		// and the DDS's submit and process layers. SharedObject.load in an attached or attaching state should call
		// SharedObject.connect. There doesn't seem to be a reason to call SharedObject.loadCore between setting
		// SharedObject.services and calling SharedObject.attachDeltaHandler. It would be duplicate work to write a
		// custom SharedObject.load, so calling the factory.load here makes the most sense. The only issue is that the
		// SpannerChannelServices need a reference to the Spanner as well as the Spanner needing a reference to the
		// SpannerChannelService, or something inside of it. It's a chicken and egg problem.
		let oldChannel: TOld | undefined;
		let newChannel: TNew | undefined;
		if (attributesMatch(attributes, this.oldFactory.attributes)) {
			oldChannel = (await this.oldFactory.load(
				runtime,
				id,
				spannerServices,
				attributes,
			)) as TOld;
		} else if (attributesMatch(attributes, this.newFactory.attributes)) {
			newChannel = (await this.newFactory.load(
				runtime,
				id,
				spannerServices,
				attributes,
			)) as TNew;
		} else {
			throw DataProcessingError.create(
				"Channel attributes do not match either factory",
				"SpannerFactory.load",
			);
		}
		const spanner = new Spanner<TOld, TNew>(
			id,
			runtime,
			this.newFactory,
			oldChannel,
			newChannel,
		);
		spanner.load(spannerServices);
		return spanner;
	}

	/**
	 * {@link @fluidframework/datastore-definitions#IChannelFactory.create}
	 *
	 * Eventually create will need to be a way to determine if the factory should create a v1 or v2 object.
	 * For now the prototype only creates a v1 object. The factory can take a flag or something and that could
	 * work. The best option is to create SpannerProps, which will pair needing either an old SharedObject with a new
	 * Factory or just a new SharedObject, where the Spanner logic will essentially be obsolete.
	 *
	 * Another concern is chaining of multiple SharedObject transitions. The Spanner will need to be expanded to be
	 * able to encompass v1 to v2 to v3 transition or the migrate function itself will need to be updated.
	 */
	public create(runtime: IFluidDataStoreRuntime, id: string): Spanner<TOld, TNew> {
		const oldChannel = this.oldFactory.create(runtime, id) as TOld;
		return new Spanner<TOld, TNew>(id, runtime, this.newFactory, oldChannel);
	}
}
