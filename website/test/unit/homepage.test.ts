/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const { appInsights, initializeAppInsights } = vi.hoisted(() => ({
	appInsights: { context: { user: { id: "sdk-user-id" } } },
	initializeAppInsights: vi.fn(),
}));

vi.mock("@theme/Layout", () => ({ default: vi.fn() }));
vi.mock("@site/src/components/home", () => ({ Homepage: vi.fn() }));
vi.mock("@site/src/appInsights", () => {
	initializeAppInsights();
	return { default: appInsights };
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.resetModules();
});

describe("Homepage telemetry", () => {
	for (const cookies of ["", "userId=existing-user-id"]) {
		it(`does not access cookies or replace the SDK user ID with document.cookie=${JSON.stringify(cookies)}`, async () => {
			const readCookie = vi.fn(() => cookies);
			const writeCookie = vi.fn();
			vi.stubGlobal(
				"document",
				Object.defineProperty({}, "cookie", { get: readCookie, set: writeCookie }),
			);

			await vi.importActual("../../src/pages/index.js");

			expect(initializeAppInsights).toHaveBeenCalledOnce();
			expect(readCookie).not.toHaveBeenCalled();
			expect(writeCookie).not.toHaveBeenCalled();
			expect(appInsights.context.user.id).toBe("sdk-user-id");
		});
	}
});
