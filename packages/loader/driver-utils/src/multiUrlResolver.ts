/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IRequest } from "@fluidframework/core-interfaces";
import { IResolvedUrl, IUrlResolver } from "@fluidframework/driver-definitions";

/**
 * Resolver that takes a list of url resolvers and then try each of them to resolve the url.
 * @param resolversList - List of url resolvers to be used to resolve the request.
 * @param request - Request to be resolved.
 *
 * @deprecated 2.0.0-internal.3.2.0 Not recommended for general purpose use.
 */
export async function configurableUrlResolver(
	resolversList: IUrlResolver[],
	request: IRequest,
): Promise<IResolvedUrl | undefined> {
	let resolved: IResolvedUrl | undefined;
	for (const resolver of resolversList) {
		resolved = await resolver.resolve({ ...request });
		if (resolved !== undefined) {
			return resolved;
		}
	}
	return undefined;
}

/**
 * @deprecated 2.0.0-internal.3.2.0 Not recommended for general purpose use.
 */
export class MultiUrlResolver implements IUrlResolver {
	/**
	 * @deprecated 2.0.0-internal.3.2.0 Not recommended for general purpose use.
	 */
	public static create(urlResolver: IUrlResolver | IUrlResolver[]) {
		if (Array.isArray(urlResolver)) {
			if (urlResolver.length === 1) {
				return urlResolver[0];
			}
			return new MultiUrlResolver(urlResolver);
		}
		return urlResolver;
	}

	private constructor(private readonly urlResolvers: IUrlResolver[]) {}

	/**
	 * @deprecated 2.0.0-internal.3.2.0 Not recommended for general purpose use.
	 */
	async resolve(request: IRequest): Promise<IResolvedUrl | undefined> {
		return configurableUrlResolver(this.urlResolvers, request);
	}

	/**
	 * @deprecated 2.0.0-internal.3.2.0 Not recommended for general purpose use.
	 */
	public async getAbsoluteUrl(resolvedUrl: IResolvedUrl, relativeUrl: string): Promise<string> {
		throw new Error("Not implmented");
	}
}
