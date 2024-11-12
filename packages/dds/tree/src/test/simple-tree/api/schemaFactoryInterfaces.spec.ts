/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";
import { SchemaFactory, TreeViewConfiguration } from "../../../simple-tree/index.js";
import { TreeFactory } from "../../../treeFactory.js";
import { testIdCompressor } from "../../utils.js";

const schema = new SchemaFactory("test");

describe("schemaFactory Interfaces", () => {
	// Using a potential solution here. Was able to build more concise solutions
	// Using limited string values here
	it("enum interop - limitedString<Type>() solution", () => {
		enum Day {
			Today = "today",
			Tomorrow = "tomorrow",
		}

		class DayObject extends schema.object("DayObject", {
			value: schema.limitedString<Day>(),
			name: schema.string,
		}) {}

		function getDay(value: string): Day {
			switch (value) {
				case "today":
					return Day.Today;
				case "tomorrow":
					return Day.Tomorrow;
				default:
					throw new Error(`Invalid value: ${value}`);
			}
		}
		const dayObject1 = new DayObject({ value: Day.Today, name: "1" });
		const dayObject2 = new DayObject({ value: getDay("today"), name: "2" });
	});

	it("string interop", () => {
		const factory = new TreeFactory({});
		const tree = factory.create(
			new MockFluidDataStoreRuntime({ idCompressor: testIdCompressor }),
			"tree",
		);

		type AnimalType = "cat" | "dog" | "lizard";

		interface IAnimal {
			aType: AnimalType;
			hasFur: boolean;
			legs: number;
		}

		class SomeAnimal
			extends schema.object("tag", {
				aType: schema.limitedString<AnimalType>(),
				hasFur: schema.boolean,
				legs: schema.number,
			})
			implements IAnimal {}

		const view = tree.viewWith(
			new TreeViewConfiguration({ schema: schema.array(SomeAnimal) }),
		);

		const goodCat: IAnimal = {
			aType: "cat",
			hasFur: true,
			legs: 4,
		};

		const goodDog: IAnimal = {
			aType: "dog",
			hasFur: true,
			legs: 4,
		};

		const badDog = {
			aType: "badDog",
			hasFur: true,
			legs: 4,
		};

		view.initialize([goodCat, goodDog]);
		view.root.insertAtEnd(goodDog);

		function insertBadDog() {
			// @ts-expect-error badDog is not a valid IAnimal
			view.root.insertAtEnd(badDog);
		}

		function badInitialize() {
			// @ts-expect-error badDog is not a valid IAnimal
			view.initialize([goodCat, badDog]);
		}
	});
});
