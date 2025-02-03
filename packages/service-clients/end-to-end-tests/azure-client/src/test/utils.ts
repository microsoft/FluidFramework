/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AzureMember, IAzureAudience } from "@fluidframework/azure-client";
import type { ConfigTypes, IConfigProviderBase } from "@fluidframework/core-interfaces";
import { IMember } from "fluid-framework";
// eslint-disable-next-line import/no-internal-modules -- Used in helper logic for tests
import { type ISharedMap, IValueChanged } from "fluid-framework/legacy";

export const waitForMember = async (
	audience: IAzureAudience,
	id: string,
): Promise<AzureMember> => {
	const allMembers = audience.getMembers();
	const member = allMembers.get(id);
	if (member !== undefined) {
		return member;
	}
	return new Promise((resolve) => {
		const handler = (clientId: string, newMember: IMember): void => {
			if (newMember.id === id) {
				resolve(newMember as AzureMember);
			}
		};
		audience.on("memberAdded", handler);
	});
};

export const mapWait = async <T>(map: ISharedMap, key: string): Promise<T> => {
	const maybeValue = map.get<T>(key);
	if (maybeValue !== undefined) {
		return maybeValue;
	}

	return new Promise((resolve) => {
		const handler = (changed: IValueChanged): void => {
			if (changed.key === key) {
				map.off("valueChanged", handler);
				const value = map.get<T>(changed.key);
				if (value === undefined) {
					throw new Error("Unexpected valueChanged result");
				}
				resolve(value);
			}
		};
		map.on("valueChanged", handler);
	});
};

export const configProvider = (
	settings: Record<string, ConfigTypes>,
): IConfigProviderBase => ({
	getRawConfig: (name: string): ConfigTypes => settings[name],
});

/**
 * This function creates a test matrix which allows the Azure Client to run the same tests against different sets of parameters.
 * Currently, there is only a test-set for Durable containers and one for Ephemeral containers.
 * The Ephemeral container tests will not run for local tests.
 *
 * @returns - The test matrix
 */
export function getTestMatrix(): { variant: string; options: { isEphemeral: boolean } }[] {
	const testMatrix = [
		{
			variant: "Durable Container",
			options: {
				isEphemeral: false,
			},
		},
	];

	// We only need to test ephemeral container behaviors when running against an azure container
	const useAzure = process.env.FLUID_CLIENT === "azure";
	if (useAzure) {
		testMatrix.push({
			variant: "Ephemeral Container",
			options: {
				isEphemeral: true,
			},
		});
	}

	return testMatrix;
}
