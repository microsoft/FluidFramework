/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint no-unused-expressions: 0 */

// Lint disable to avoid needing to place `async` on many test functions
// as validity of testing is in general questionable and trying to avoid
// changes.
/* eslint-disable @typescript-eslint/promise-function-async */

/**
 * @fileoverview In this file, we will test template validation.
 */

import { constants } from "@fluid-experimental/property-common";
import { expect } from "chai";
import semver from "semver";

import { TemplateValidator } from "../../templateValidator.js";
import type { SchemaValidationResult } from "../../validationResultBuilder.js";
import {
	badInvalidSemverInTypeid,
	badMissingSemverInTypeid,
	badPrimitiveTypeid,
	goodPointId,
	goodReservedTypes,
	goodUIBorder,
} from "../schemas/index.js";
import { SchemaValidator } from "../schemaValidator.js";

(() => {
	const MSG = constants.MSG;

	const performValidation = (
		async: boolean,
		template,
		templatePrevious,
		skipSemver,
		asyncErrorMessage?,
	): Promise<SchemaValidationResult> => {
		const schemaValidator = new SchemaValidator();

		// @ts-expect-error - per the catch and no throw below
		return async
			? schemaValidator
					.validate(template, templatePrevious, async, skipSemver)
					.catch((error) => {
						expect(error.message).to.have.string(asyncErrorMessage);
						// This really should re-throw the error. As it stands this
						// catch returns `undefined` which is not SchemaValidationResult.
						// Throwing will cause "fail: previous template: invalid semver"
						// test case to fail with uncaught error.
						// This also has impact on the malformed validate function below.
						// throw error;
					})
			: // A better pattern is simply Promise.resolve(...). However without all callers
				// properly specifying they are `async` (lint disabled for file), they may fail.
				// In particular see test case
				//   "should fail if map with context key type typeid is not constant"
				new Promise((resolve) => {
					resolve(
						schemaValidator.validate(
							template,
							templatePrevious,
							async,
							skipSemver,
						),
					);
				});
	};

	// Performs both synchronous and asynchronous validation
	const validate = (
		expectations: (result: SchemaValidationResult) => SchemaValidationResult,
		template?,
		templatePrevious?,
		skipSemver?,
		asyncErrorMessage?,
	) =>
		performValidation(false, template, templatePrevious, skipSemver)
			.then(expectations)
			.then(
				// This patten is invalid. The `then` parameter is expected to be callable.
				// Instead performValidation is called and its result is is called. Or at least
				// should be. As set up the following .then is executed (apparently) on the
				// results of the prior performValidation. This could be address with this prefix:
				//   async () =>
				// However doing so causes tests to fail. Testing coming through here appears
				// invalid.
				// @ts-expect-error
				performValidation(
					true,
					template,
					templatePrevious,
					skipSemver,
					asyncErrorMessage,
				),
			)
			.then(expectations);

	describe("Template Validation", () => {
		// --- INPUT ---
		describe("input validation", () => {
			it("fail: empty template", () => {
				const expectations = (result) => {
					expect(result).property("isValid", false);
					expect(result.errors.length).to.be.at.least(1);
					expect(result.errors[0].message).to.have.string(MSG.NO_TEMPLATE);
					return result;
				};
				return validate(expectations);
			});

			it("fail: template with no typeid", () => {
				const expectations = (result) => {
					expect(result).property("isValid", false);
					expect(result.errors.length).to.be.at.least(1);
					expect(result.errors[0].message).to.have.string(MSG.MISSING_TYPE_ID);
					return result;
				};
				return validate(expectations, {});
			});
		});

		// --- TYPEID ---
		describe("typeid validation", () => {
			it("pass: valid typeid", () => {
				const template = JSON.parse(JSON.stringify(goodPointId.templateSchema));

				const expectations = (result) => {
					expect(result).property("isValid", true);
					expect(result.typeid).to.equal(template.typeid);
					expect(result.errors).to.be.empty;
					expect(result.warnings).to.be.empty;
					return result;
				};

				return validate(expectations, template);
			});

			it("fail: missing semver", () => {
				const template = JSON.parse(
					JSON.stringify(badMissingSemverInTypeid.templateSchema),
				);
				const expectations = (result) => {
					expect(result).property("isValid", false);
					expect(result.typeid).to.equal(template.typeid);
					expect(result.errors.length).to.be.at.least(1);
					expect(result.errors[0].message).to.have.string(
						"'TeamLeoValidation2:PointID' is not valid",
					);
					expect(result.errors[0].instancePath).to.equal("/typeid");
					return result;
				};
				return validate(expectations, template);
			});

			it("fail: invalid semver 1", () => {
				const template = JSON.parse(
					JSON.stringify(badInvalidSemverInTypeid.templateSchema),
				);

				const expectations = (result) => {
					expect(result).property("isValid", false);
					expect(result.typeid).to.equal(template.typeid);
					expect(result.errors.length).to.be.at.least(1);
					expect(result.errors[0].instancePath).to.equal("/typeid");
					return result;
				};

				return validate(expectations, template);
			});

			it("fail: invalid semver 2", () => {
				const template = JSON.parse(
					JSON.stringify(badInvalidSemverInTypeid.templateSchema),
				);
				template.typeid = "TeamLeoValidation2:PointID-1.0.01";
				const expectations = (result) => {
					expect(result).property("isValid", false);
					expect(result.typeid).to.equal(template.typeid);
					expect(result.errors.length).to.be.at.least(1);
					expect(result.errors[0].message).to.have.string(
						MSG.INVALID_VERSION_1,
					);
					return result;
				};
				return validate(expectations, template);
			});

			it("fail: previous template: invalid semver", () => {
				const templatePrevious = JSON.parse(
					JSON.stringify(goodPointId.templateSchema),
				);
				const template = JSON.parse(JSON.stringify(templatePrevious));
				const badTypeId = "TeamLeoValidation2:PointID-1.0.0.1";
				templatePrevious.typeid = badTypeId;
				const expectations = (result) => {
					expect(result).property("isValid", false);
					expect(result.typeid).to.equal(badTypeId);
					expect(result.errors.length).to.be.at.least(1);
					expect(result.errors[0].message).to.have.string(
						`'${badTypeId}' is not valid`,
					);
					return result;
				};
				return validate(
					expectations,
					template,
					templatePrevious,
					false,
					"Invalid Version: 1.0.0.1",
				);
			});
		});

		// --- Template versioning ---
		describe("template versioning", () => {
			it("fail: version regression: 1.0.0 -> 0.9.9", () => {
				const templatePrevious = JSON.parse(
					JSON.stringify(goodPointId.templateSchema),
				);
				const template = JSON.parse(JSON.stringify(templatePrevious));
				template.typeid = "TeamLeoValidation2:PointID-0.9.9";
				const expectations = (result) => {
					expect(result).property("isValid", false);
					expect(result.errors.length).to.be.at.least(1);
					expect(result.errors[0].message).to.have.string(
						MSG.VERSION_REGRESSION_1,
					);
					return result;
				};
				return validate(expectations, template, templatePrevious);
			});

			describe("same version", () => {
				it("pass: same content", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("fail: changed 'annotation'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.annotation.description = "Changed!";
					const expectations = (result) => {
						expect(result).property("isValid", false);
						expect(result.errors.length).to.be.at.least(1);
						expect(result.errors[0].message).to.have.string(
							MSG.MODIFIED_TEMPLATE_SAME_VERSION_1,
						);
						return result;
					};

					return validate(expectations, template, templatePrevious);
				});

				it("fail: deleted 'annotation'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					delete template.annotation;

					const expectations = (result) => {
						expect(result).property("isValid", false);
						expect(result.errors.length).to.be.at.least(1);
						expect(result.errors[0].message).to.have.string(
							MSG.MODIFIED_TEMPLATE_SAME_VERSION_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("fail: added 'annotation'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.annotation = { description: "Test" };

					const expectations = (result) => {
						expect(result).property("isValid", false);
						expect(result.errors.length).to.be.at.least(1);
						expect(result.errors[0].message).to.have.string(
							MSG.MODIFIED_TEMPLATE_SAME_VERSION_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("fail: changed 'value'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodUIBorder.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.properties[0].properties[0].value = 123456;

					const expectations = (result) => {
						expect(result).property("isValid", false);
						expect(result.errors.length).to.be.at.least(1);
						expect(result.errors[0].message).to.have.string(
							MSG.MODIFIED_TEMPLATE_SAME_VERSION_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("fail: changed 'id'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.properties[0].properties[0].id = "xx";

					const expectations = (result) => {
						expect(result).property("isValid", false);
						expect(result.errors.length).to.be.at.least(1);
						expect(result.errors[0].message).to.have.string(
							MSG.MODIFIED_TEMPLATE_SAME_VERSION_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("fail: changed 'inherits'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodReservedTypes.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.inherits = "Reference<Adsk.Core:Math.Color-1.0.0>";

					const expectations = (result) => {
						expect(result).property("isValid", false);
						expect(result.errors.length).to.be.at.least(1);
						expect(result.errors[0].message).to.have.string(
							MSG.MODIFIED_TEMPLATE_SAME_VERSION_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("fail: added property", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.properties[0].properties.push({
						id: "newPropId",
						typeid: "Float32",
					});

					const expectations = (result) => {
						expect(result).property("isValid", false);
						expect(result.errors.length).to.be.at.least(1);
						expect(result.errors[0].message).to.have.string(
							MSG.MODIFIED_TEMPLATE_SAME_VERSION_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("fail: deleted property", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.properties[0].properties.pop();

					const expectations = (result) => {
						expect(result).property("isValid", false);
						expect(result.errors.length).to.be.at.least(1);
						expect(result.errors[0].message).to.have.string(
							MSG.MODIFIED_TEMPLATE_SAME_VERSION_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});
			});

			describe("incremented patch level", () => {
				it("pass: same content", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "patch");

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: unstable with major content change: 0.0.1 -> 0.0.2", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.typeid = "TeamLeoValidation2:PointID-0.0.1";
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid = "TeamLeoValidation2:PointID-0.0.2";
					template.properties[1].typeid = "TeamLeoValidation2:ColorID-9.0.0";

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: changed 'annotation'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "patch");
					template.annotation.description = "Changed!";

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: deleted 'annotation'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "patch");
					delete template.annotation;

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: added 'annotation'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "patch");
					template.annotation = { description: "Test" };

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("warn: changed 'value'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodUIBorder.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"Adsk.Core:UI.Border-" + semver.inc("1.0.0", "patch");
					template.properties[0].properties[0].value = 123456;

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings.length).to.be.at.least(1);
						expect(result.warnings[0]).to.have.string(
							MSG.CHANGE_LEVEL_TOO_LOW_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("warn: changed 'id' (delete, add)", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "patch");
					template.properties[0].properties[0].id = "xx";

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings.length).to.be.at.least(2); // 1st for the delete and the 2nd for the add
						expect(result.warnings[0]).to.have.string(
							MSG.CHANGE_LEVEL_TOO_LOW_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("warn: changed 'inherits'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodReservedTypes.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:Example-" + semver.inc("1.0.0", "patch");
					template.inherits = "Reference<Adsk.Core:Math.Color-1.0.0>";

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings.length).to.be.at.least(1);
						expect(result.warnings[0]).to.have.string(
							MSG.CHANGE_LEVEL_TOO_LOW_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("warn: added property", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "patch");
					template.properties[0].properties.push({
						id: "newPropId",
						typeid: "Float32",
					});

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings.length).to.be.at.least(1);
						expect(result.warnings[0]).to.have.string(
							MSG.CHANGE_LEVEL_TOO_LOW_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("warn: deleted property", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "patch");
					template.properties[0].properties.pop();

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings.length).to.be.at.least(1);
						expect(result.warnings[0]).to.have.string(
							MSG.CHANGE_LEVEL_TOO_LOW_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});
			});

			describe("incremented minor level", () => {
				it("pass: same content", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "minor");

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: changed 'annotation'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "minor");
					template.annotation.description = "Changed!";

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: deleted 'annotation'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "minor");
					delete template.annotation;

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: added 'annotation'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "minor");
					template.annotation = { description: "Test" };

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: changed 'value'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodUIBorder.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"Adsk.Core:UI.Border-" + semver.inc("1.0.0", "minor");
					template.properties[0].properties[0].value = 123456;

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("warn: changed 'id' (delete, add)", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "minor");
					template.properties[0].properties[0].id = "xx";

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings.length).to.be.at.least(1);
						expect(result.warnings[0]).to.have.string(
							MSG.CHANGE_LEVEL_TOO_LOW_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("warn: changed 'inherits'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodReservedTypes.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:Example-" + semver.inc("1.0.0", "minor");
					template.inherits = "Reference<Adsk.Core:Math.Color-1.0.0>";

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings.length).to.be.at.least(1);
						expect(result.warnings[0]).to.have.string(
							MSG.CHANGE_LEVEL_TOO_LOW_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: added property", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "minor");
					template.properties[0].properties.push({
						id: "newPropId",
						typeid: "Float32",
					});

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("warn: deleted property", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "minor");
					template.properties[0].properties.pop();

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings.length).to.be.at.least(1);
						expect(result.warnings[0]).to.have.string(
							MSG.CHANGE_LEVEL_TOO_LOW_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});
			});

			describe("incremented major level", () => {
				it("pass: same content", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "major");

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: changed 'annotation'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "major");
					template.annotation.description = "Changed!";

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: deleted 'annotation'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "major");
					delete template.annotation;

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: added 'annotation'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "major");
					template.annotation = { description: "Test" };

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: changed 'value'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodUIBorder.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"Adsk.Core:UI.Border-" + semver.inc("1.0.0", "major");
					template.properties[0].properties[0].value = 123456;

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: changed 'id' (delete, add)", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "major");
					template.properties[0].properties[0].id = "xx";

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: changed 'inherits'", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodReservedTypes.templateSchema),
					);
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:Example-" + semver.inc("1.0.0", "major");
					template.inherits = "Reference<Adsk.Core:Math.Color-1.0.0>";

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: added property", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "major");
					template.properties[0].properties.push({
						id: "newPropId",
						typeid: "Float32",
					});

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});

				it("pass: deleted property", () => {
					const templatePrevious = JSON.parse(
						JSON.stringify(goodPointId.templateSchema),
					);
					templatePrevious.annotation = { description: "Test" };
					const template = JSON.parse(JSON.stringify(templatePrevious));
					template.typeid =
						"TeamLeoValidation2:PointID-" + semver.inc("1.0.0", "major");
					template.properties[0].properties.pop();

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious);
				});
			});
		});

		describe("skip semver validation", () => {
			it("pass: deep equal on scrambled arrays", () => {
				const templatePrevious = JSON.parse(
					JSON.stringify(goodPointId.templateSchema),
				);
				const template = JSON.parse(JSON.stringify(templatePrevious));
				let tmp = template.properties[0].properties[0];
				template.properties[0].properties[0] =
					template.properties[0].properties[2];
				template.properties[0].properties[2] = tmp;
				tmp = template.properties[1];
				template.properties[1] = template.properties[2];
				template.properties[2] = tmp;
				// Skip semver validation to cause a deep compare

				const expectations = (result) => {
					expect(result).property("isValid", true);
					expect(result.errors).to.be.empty;
					expect(result.warnings).to.be.empty;
					return result;
				};
				return validate(expectations, template, templatePrevious, true);
			});

			it("pass: deep equal with version regression", () => {
				const templatePrevious = JSON.parse(
					JSON.stringify(goodPointId.templateSchema),
				);
				const template = JSON.parse(JSON.stringify(templatePrevious));

				const expectations = (result) => {
					expect(result).property("isValid", true);
					expect(result.errors).to.be.empty;
					expect(result.warnings).to.be.empty;
					return result;
				};
				return validate(expectations, template, templatePrevious, true);
			});

			it("pass: preserves input templates", () => {
				const templatePrevious = JSON.parse(
					JSON.stringify(goodPointId.templateSchema),
				);
				const template = JSON.parse(JSON.stringify(templatePrevious));

				const copies = [
					JSON.parse(JSON.stringify(templatePrevious)),
					JSON.parse(JSON.stringify(template)),
				];

				const expectations = (result) => {
					expect(result).property("isValid", true);
					expect(result.errors).to.be.empty;
					expect(result.warnings).to.be.empty;
					expect(templatePrevious).to.deep.equal(copies[0]);
					expect(template).to.deep.equal(copies[1]);
					return result;
				};
				return validate(expectations, template, templatePrevious);
			});

			it("fail: changed value", () => {
				const templatePrevious = JSON.parse(
					JSON.stringify(goodUIBorder.templateSchema),
				);
				const template = JSON.parse(JSON.stringify(templatePrevious));
				template.properties[0].properties[0].value = 123456;

				const expectations = (result) => {
					expect(result).property("isValid", false);
					expect(result.warnings).to.be.empty;
					expect(result.errors.length).to.be.at.least(1);
					expect(result.errors[0].message).to.have.string(
						MSG.MODIFIED_TEMPLATE_1,
					);
					return result;
				};

				return validate(expectations, template, templatePrevious, true);
			});
		});

		describe("syntax validation", () => {
			it("pass: validate a simple file", () => {
				const template = goodPointId.templateSchema;

				const expectations = (result) => {
					expect(result.isValid).to.equal(true);
					return result;
				};
				return validate(expectations, template, null, true);
			});

			it("fail: invalid file", () => {
				const template = badPrimitiveTypeid.templateSchema;

				const expectations = (result) => {
					expect(result.isValid).to.equal(false);
					expect(result.errors.length).to.be.greaterThan(0);
					expect(result.unresolvedTypes.length).to.equal(1);
					return result;
				};
				return validate(expectations, template, null, true);
			});

			it("should pass a schema with an empty array of properties", () => {
				const EmptyPropertySchema = {
					typeid: "Test:EmptyPropertySchema-1.0.0",
					properties: [],
				};

				const expectations = (result) => {
					expect(result.isValid).to.equal(true);
					return result;
				};
				return validate(expectations, EmptyPropertySchema, null);
			});
		});

		describe("bugs", () => {
			describe("@bugfix Template validation with multiple inheritance", () => {
				it("pass: deep equal with multiple inheritance", () => {
					const templateString =
						'{"typeid":"autodesk.core:translation.controller-1.0.0","inherits":["NamedProperty","NodeProperty"]}';
					const templatePrevious = JSON.parse(templateString);
					const template = JSON.parse(templateString);

					const expectations = (result) => {
						expect(result).property("isValid", true);
						expect(result.errors).to.be.empty;
						expect(result.warnings).to.be.empty;
						return result;
					};
					return validate(expectations, template, templatePrevious, true);
				});

				it("fail: deep equal with out of order multiple inheritance", () => {
					const template = JSON.parse(
						'{"typeid":"autodesk.core:translation.controller-1.0.0",' +
							'"inherits":["NamedProperty","NodeProperty"]}',
					);
					const templatePrevious = JSON.parse(
						'{"typeid":"autodesk.core:translation.controller-1.0.0",' +
							'"inherits":["NodeProperty","NamedProperty"]}',
					);

					const expectations = (result) => {
						expect(result).property("isValid", false);
						expect(result.errors.length).to.be.greaterThan(0);
						expect(result.errors[0].message).to.have.string(
							MSG.MODIFIED_TEMPLATE_1,
						);
						return result;
					};
					return validate(expectations, template, templatePrevious, true);
				});
			});

			describe(
				"@bugfix Local templates with 'abstract' properties fail validation " +
					"with remote one.",
				() => {
					describe("pass: deep equal between no properties and an empty properties array", () => {
						const templateArray = {
							typeid: "SimpleTest:Shape-1.0.0",
							properties: [],
						};
						const templateAbstract = {
							typeid: "SimpleTest:Shape-1.0.0",
						};

						it("source is abstract and target is an empty properties array", () => {
							const expectations = (result) => {
								expect(result).property("isValid", true);
								expect(result.errors).to.be.empty;
								expect(result.warnings).to.be.empty;
								return result;
							};

							return validate(expectations, templateAbstract, templateArray);
						});

						it("target is abstract and source is an empty properties array", () => {
							const expectations = (result) => {
								expect(result).property("isValid", true);
								expect(result.errors).to.be.empty;
								expect(result.warnings).to.be.empty;
								return result;
							};

							return validate(expectations, templateArray, templateAbstract);
						});
					});
				},
			);
		});

		describe("Constants", () => {
			before(() => {
				const schemaValidator = new SchemaValidator();

				new TemplateValidator({
					skipSemver: true,
					inheritsFrom: schemaValidator.inheritsFrom as any,
					hasSchema: schemaValidator.hasSchema as any,
				});
			});

			const expectationsGenerator = (msg) => (result) => {
				expect(result.isValid).to.equal(false);
				expect(result.errors.length).to.equal(1);
				expect(result.errors[0].message).to.equal(msg);

				return result;
			};

			it("should pass a valid template", () => {
				const ConstantValid = {
					typeid: "ConstantTest:ConstantValid-1.0.0",
					constants: [{ id: "valid", typeid: "String", value: "value" }],
				};

				const expectations = (result) => {
					expect(result.isValid).to.equal(true);
					return result;
				};

				return validate(expectations, ConstantValid, null);
			});

			it("should fail if constants array has no elements", () => {
				const ConstantEmptyArray = {
					typeid: "ConstantTest:ConstantEmptyArray-1.0.0",
					constants: [],
				};

				return validate(
					expectationsGenerator("/constants must NOT have fewer than 1 items"),
					ConstantEmptyArray,
					null,
					true,
				);
			});

			it("should fail if constant does not have an id", () => {
				const ConstantNoId = {
					typeid: "ConstantTest:ConstantNoId-1.0.0",
					constants: [{ typeid: "String", value: "value" }],
				};

				return validate(
					expectationsGenerator(
						"/constants/0 must have required property 'id'",
					),
					ConstantNoId,
					null,
					true,
				);
			});

			it("should fail if constant does not have a typeid", () => {
				const ConstantNoTypeid = {
					typeid: "ConstantTest:ConstantNoTypeid-1.0.0",
					constants: [{ id: "id", value: "value" }],
				};

				return validate(
					(result) => {
						expect(result.isValid).to.equal(false);
						// console.log(result.errors);
						expect(result.errors.length).to.equal(5);
						expect(result.errors[3].message).to.include(
							"must have required property 'inherits'",
						);
						expect(result.errors[4].message).to.include(
							"/constants/0 must have required property 'typeid'",
						);
						return result;
					},
					ConstantNoTypeid,
					null,
					true,
				);
			});

			it("should pass if constant does not have a typeid but maybe inherits from elsewhere", () => {
				const ConstantNoTypeid = {
					typeid: "ConstantTest:ConstantNoTypeid-1.0.0",
					inherits: "ConstantTest:ConstantParentWithTypeid-1.0.0",
					constants: [{ id: "id", value: "value" }],
				};

				const expectations = (result) => {
					expect(result.isValid).to.equal(true);
					return result;
				};

				return validate(expectations, ConstantNoTypeid, null);
			});

			it("should not fail if constant does not have a value or typedValue", () => {
				const ConstantNoValue = {
					typeid: "ConstantTest:ConstantNoValue-1.0.0",
					constants: [{ id: "id", typeid: "String" }],
				};

				const expectations = (result) => {
					expect(result.isValid).to.equal(true);
					return result;
				};

				return validate(expectations, ConstantNoValue, null, true);
			});

			it("should pass if constant map with context key type typeid has typeids as keys", () => {
				const Constant = {
					typeid: "ConstantTest:Constant-1.0.0",
					constants: [
						{
							id: "map",
							typeid: "Int32",
							context: "map",
							contextKeyType: "typeid",
							value: {
								"SimpleTest:ConstantTemplate1-1.0.0": 1,
								"SimpleTest:ConstantTemplate2-1.0.0": -1,
							},
						},
					],
				};

				const expectations = (result) => {
					expect(result.isValid).to.equal(true);
					return result;
				};

				return validate(expectations, Constant, null, true);
			});

			it("should fail if constant map with context key type that is not a valid value", () => {
				const ConstantNoValue = {
					typeid: "ConstantTest:ConstantNoValue-1.0.0",
					constants: [
						{
							id: "map",
							typeid: "Int32",
							context: "map",
							contextKeyType: "badvalue",
							value: {
								"SimpleTest:ConstantTemplate1-1.0.0": 1,
								"SimpleTest:ConstantTemplate2-1.0.0": -1,
							},
						},
					],
				};

				return validate(
					(result) => {
						expect(result.isValid).to.equal(false);
						expect(result.errors.length).to.equal(1);
						expect(result.errors[0].message).to.include(
							"should match one of the following: typeid,string",
						);
						return result;
					},
					ConstantNoValue,
					null,
					true,
				);
			});

			it("should fail if constant map with context key type typeid has invalid typeids as keys", () => {
				const ConstantMapWithBadKeys = {
					typeid: "ConstantTest:ConstantMapWithBadKeys-1.0.0",
					constants: [
						{
							id: "map",
							typeid: "Int32",
							context: "map",
							contextKeyType: "typeid",
							value: { NotATypeId: 1, AlsoNotATypeId: -1 },
						},
					],
				};

				const expectations = (result) => {
					expect(result.isValid).to.equal(false);
					expect(result.errors.length).to.equal(2);
					expect(result.errors[0].message).to.include(
						MSG.KEY_MUST_BE_TYPEID + "NotATypeId",
					);
					expect(result.errors[1].message).to.include(
						MSG.KEY_MUST_BE_TYPEID + "AlsoNotATypeId",
					);

					return result;
				};

				return validate(expectations, ConstantMapWithBadKeys, null, true);
			});

			it("should fail if map with context key type typeid is not constant", () => {
				const ConstantMapWithProperty = {
					typeid: "ConstantTest:Outerprop-1.0.0",
					properties: [
						{
							id: "map",
							typeid: "Int32",
							context: "map",
							contextKeyType: "typeid",
							value: {
								"SimpleTest:ConstantTemplate1-1.0.0": 1,
								"SimpleTest:ConstantTemplate2-1.0.0": -1,
							},
						},
					],
				};

				const expectations = (result) => {
					throw new Error("This should not be called");
				};
				const failExpectations = (error) => {
					expect(error.toString()).to.include(
						"SV-013: A map with typeids as keys must be constant",
					);
				};
				return performValidation(false, ConstantMapWithProperty, null, true)
					.then(expectations)
					.catch(failExpectations);
			});
		});

		describe("Async validation", () => {
			it("can perform context validation asynchronously", (done) => {
				const schemaValidator = new SchemaValidator();

				const templateValidator = new TemplateValidator({
					inheritsFromAsync: schemaValidator.inheritsFromAsync as any,
					hasSchemaAsync: schemaValidator.hasSchemaAsync as any,
				});

				// Doesn't inherit from 'NamedProperty'. Will cause an error
				const grandParentSchema = {
					typeid: "test:grandparentschema-1.0.0",
				};

				const parentSchema = {
					typeid: "test:parentschema-1.0.0",
					inherits: ["test:grandparentschema-1.0.0"],
				};

				const childSchema = {
					typeid: "test:childchema-1.0.0",
					properties: [
						{
							id: "set",
							typeid: "test:parentschema-1.0.0",
							context: "set",
						},
					],
				};

				schemaValidator.register(grandParentSchema);
				schemaValidator.register(parentSchema);

				templateValidator.validateAsync(childSchema as any).then(
					() => {
						done(new Error("Should not be valid!"));
					},
					(error) => {
						expect(error).to.exist;
						done();
					},
				);
			});
		});
	});
})();
