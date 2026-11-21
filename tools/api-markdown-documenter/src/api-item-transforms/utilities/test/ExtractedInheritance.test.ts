/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import path from "node:path";

import {
	ApiClass,
	ApiInterface,
	type ApiItem,
	ApiItemKind,
	ApiModel,
} from "@microsoft/api-extractor-model";
import { expect } from "chai";

import { getApiItemTransformationConfigurationWithDefaults } from "../../configuration/index.js";
import { getInheritedMembers } from "../InheritedMembers.js";

describe("getInheritedMembers with API Extractor declarations", () => {
	/**
	 * Loads the API Extractor report for the inheritance edge cases and its top-level declarations.
	 *
	 * @remarks
	 * These tests depend on which references API Extractor emits for ambiguous names and symbols.
	 * Building the references by hand would assume the very behavior the fixture needs to exercise.
	 */
	function loadFixture(): { model: ApiModel; items: readonly ApiItem[] } {
		const model = new ApiModel();
		const report = path.resolve(
			import.meta.dirname,
			"../../../../src/test/test-data/extracted-inheritance/test-inheritance.api.json",
		);
		const testPackage = model.loadPackage(report);
		return { model, items: testPackage.entryPoints[0].members };
	}

	it("does not mistake a same-named interface for the instance returned by a constructor value", () => {
		const { model, items } = loadFixture();
		const derived = items.find(
			(item): item is ApiClass =>
				item instanceof ApiClass && item.name === "TestClassExtendingConstructorValue",
		);
		if (derived === undefined) {
			throw new Error("Missing TestClassExtendingConstructorValue fixture.");
		}

		// A class extends the constructor value, but this report points to the unrelated interface of the same name.
		// Returning no members is preferable to publishing the interface's properties as class members.
		const reference = derived.extendsType?.excerpt.spannedTokens[0].canonicalReference;
		expect(reference?.toString()).to.equal(
			"test-inheritance!TestConstructorTypeAndValue:interface",
		);
		const config = getApiItemTransformationConfigurationWithDefaults({ apiModel: model });
		expect(getInheritedMembers(derived, config).size).to.equal(0);
	});

	it("includes a merged interface's own members and bases, with their original owners and type arguments", () => {
		const { model, items } = loadFixture();
		const derived = items.find(
			(item): item is ApiClass =>
				item instanceof ApiClass && item.name === "TestClassExtendingMergedClass",
		);
		const augment = items.find(
			(item): item is ApiInterface =>
				item instanceof ApiInterface && item.name === "TestClassWithMergedInterface",
		);
		if (derived === undefined || augment === undefined) {
			throw new Error("Missing merged class/interface fixture.");
		}
		const config = getApiItemTransformationConfigurationWithDefaults({ apiModel: model });
		const result = getInheritedMembers(derived, config);

		// The derived class supplies `number` once. It must reach both the merged interface's T
		// and that interface's base's T[], without moving either member to the class for linking.
		expect([...result.keys()].map((item) => item.name)).to.have.members([
			"classProperty",
			"mergedInterfaceProperty",
			"inheritedArrayProperty",
		]);
		const [mergedProperty] = augment.findMembersByName("mergedInterfaceProperty");
		expect(
			[...result].find(([member]) => member === mergedProperty)?.[1].excerpt.text,
		).to.equal("number");
		const inheritedProperty = [...result].find(
			([member]) => member.name === "inheritedArrayProperty",
		);
		expect(inheritedProperty?.[0].parent?.displayName).to.equal("TestMergedInterfaceBase");
		expect(inheritedProperty?.[1].excerpt.text).to.equal("number[]");

		// A filtered interface must not leak its own members or inherited members through its class sibling.
		const filtered = getInheritedMembers(derived, {
			...config,
			exclude: (item) => item === augment,
		});
		expect([...filtered.keys()].map((item) => item.name)).to.deep.equal(["classProperty"]);
	});

	it("retains well-known and declared symbol members with canonical declaration links", () => {
		const { model, items } = loadFixture();
		const derived = items.find(
			(item): item is ApiInterface =>
				item instanceof ApiInterface && item.name === "TestInterfaceInheritingSymbolKeys",
		);
		const base = items.find(
			(item) =>
				item.kind === ApiItemKind.Interface &&
				item.displayName === "TestInterfaceWithSymbolKeys",
		);
		if (derived === undefined || base === undefined) {
			throw new Error("Missing computed-member fixture.");
		}
		const result = getInheritedMembers(
			derived,
			getApiItemTransformationConfigurationWithDefaults({ apiModel: model }),
		);

		// The report identifies both built-in symbols and the package's own symbol. Matching names
		// alone would not ensure that the returned members still belong to the canonical base declaration.
		expect([...result.keys()]).to.have.members(base.members);
		expect([...result.keys()].map((item) => item.name)).to.have.members([
			"[Symbol.iterator]",
			"[Symbol.toStringTag]",
			"[testInheritedMemberKey]",
		]);
	});
});
