/*!
 * Copyright (c) Autodesk, Inc. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint no-unused-expressions: 0 */
/* eslint-disable no-unused-vars */
/* eslint-disable no-undef */
/* eslint-disable max-nested-callbacks */
/**
 * @fileoverview In this file, we will test template validation.
 */

(function() {
  var _ = require('underscore');
  var MSG = require('@fluid-experimental/property-common').constants.MSG;
  var semver = require('semver');
  var SchemaValidator = require('../schema_validator');
  var TemplateValidator = require('../..').TemplateValidator;

  var performValidation = function(async, template, templatePrevious, skipSemver, asyncErrorMessage) {
    var schemaValidator = new SchemaValidator();

    if (async) {
      return schemaValidator.validate(template, templatePrevious, async, skipSemver).catch((error) => {
        expect(error.message).to.have.string(asyncErrorMessage);
      });
    } else {
      return new Promise(resolve => {
        resolve(schemaValidator.validate(template, templatePrevious, async, skipSemver));
      });
    }
  };

  // Performs both synchronous and asynchronous validation
  var validate = function(expectations, template, templatePrevious, skipSemver, asyncErrorMessage) {
    return performValidation(false, template, templatePrevious, skipSemver)
      .then(expectations)
      .then(performValidation(true, template, templatePrevious, skipSemver, asyncErrorMessage))
      .then(expectations);
  };

  describe('Template Validation', function() {
    // --- INPUT ---
    describe('input validation', function() {
      it('fail: empty template', function() {
        var expectations = function(result) {
          expect(result).property('isValid', false);
          expect(result.errors.length).to.be.at.least(1);
          expect(result.errors[0].message).to.have.string(MSG.NO_TEMPLATE);
          return result;
        };
        return validate(expectations);
      });

      it('fail: template with no typeid', function() {
        var expectations = function(result) {
          expect(result).property('isValid', false);
          expect(result.errors.length).to.be.at.least(1);
          expect(result.errors[0].message).to.have.string(MSG.MISSING_TYPE_ID);
          return result;
        };
        return validate(expectations, {});
      });
    });

    // --- TYPEID ---
    describe('typeid validation', function() {
      it('pass: valid typeid', function() {
        var template = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));

        var expectations = function(result) {
          expect(result).property('isValid', true);
          expect(result.typeid).to.equal(template.typeid);
          expect(result.errors).to.be.empty;
          expect(result.warnings).to.be.empty;
          return result;
        };

        return validate(expectations, template);
      });

      it('fail: missing semver', function() {
        var template = JSON.parse(JSON.stringify(require('../schemas/bad_missing_semver_in_typeid')));
        var expectations = function(result) {
          expect(result).property('isValid', false);
          expect(result.typeid).to.equal(template.typeid);
          expect(result.errors.length).to.be.at.least(1);
          expect(result.errors[0].message).to.have.string('\'TeamLeoValidation2:PointID\' is not valid');
          expect(result.errors[0].dataPath).to.equal('/typeid');
          return result;
        };
        return validate(expectations, template);
      });

      it('fail: invalid semver 1', function() {
        var template = JSON.parse(JSON.stringify(require('../schemas/bad_invalid_semver_in_typeid')));

        var expectations = function(result) {
          expect(result).property('isValid', false);
          expect(result.typeid).to.equal(template.typeid);
          expect(result.errors.length).to.be.at.least(1);
          expect(result.errors[0].dataPath).to.equal('/typeid');
          return result;
        };

        return validate(expectations, template);
      });

      it('fail: invalid semver 2', function() {
        var template = JSON.parse(JSON.stringify(require('../schemas/bad_invalid_semver_in_typeid')));
        template.typeid = 'TeamLeoValidation2:PointID-1.0.01';
        var expectations = function(result) {
          expect(result).property('isValid', false);
          expect(result.typeid).to.equal(template.typeid);
          expect(result.errors.length).to.be.at.least(1);
          expect(result.errors[0].message).to.have.string(MSG.INVALID_VERSION_1);
          return result;
        };
        return validate(expectations, template);
      });

      it('fail: previous template: invalid semver', function() {
        var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
        var template = JSON.parse(JSON.stringify(templatePrevious));
        var badTypeId = 'TeamLeoValidation2:PointID-1.0.0.1';
        templatePrevious.typeid = badTypeId;
        var expectations = function(result) {
          expect(result).property('isValid', false);
          expect(result.typeid).to.equal(badTypeId);
          expect(result.errors.length).to.be.at.least(1);
          expect(result.errors[0].message).to.have.string(`'${badTypeId}' is not valid`);
          return result;
        };
        return validate(expectations, template, templatePrevious, false, 'Invalid Version: 1.0.0.1');
      });
    });

    // --- Template versioning ---
    describe('template versioning', function() {
      it('fail: version regression: 1.0.0 -> 0.9.9', function() {
        var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
        var template = JSON.parse(JSON.stringify(templatePrevious));
        template.typeid = 'TeamLeoValidation2:PointID-0.9.9';
        var expectations = function(result) {
          expect(result).property('isValid', false);
          expect(result.errors.length).to.be.at.least(1);
          expect(result.errors[0].message).to.have.string(MSG.VERSION_REGRESSION_1);
          return result;
        };
        return validate(expectations, template, templatePrevious);
      });

      describe('same version', function() {
        it('pass: same content', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("fail: changed 'annotation'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.annotation.description = 'Changed!';
          var expectations = function(result) {
            expect(result).property('isValid', false);
            expect(result.errors.length).to.be.at.least(1);
            expect(result.errors[0].message).to.have.string(MSG.MODIFIED_TEMPLATE_SAME_VERSION_1);
            return result;
          };

          return validate(expectations, template, templatePrevious);
        });

        it("fail: deleted 'annotation'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          delete template.annotation;

          var expectations = function(result) {
            expect(result).property('isValid', false);
            expect(result.errors.length).to.be.at.least(1);
            expect(result.errors[0].message).to.have.string(MSG.MODIFIED_TEMPLATE_SAME_VERSION_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("fail: added 'annotation'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.annotation = {description: 'Test'};

          var expectations = function(result) {
            expect(result).property('isValid', false);
            expect(result.errors.length).to.be.at.least(1);
            expect(result.errors[0].message).to.have.string(MSG.MODIFIED_TEMPLATE_SAME_VERSION_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("fail: changed 'value'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_ui_border')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.properties[0].properties[0].value = 123456;

          var expectations = function(result) {
            expect(result).property('isValid', false);
            expect(result.errors.length).to.be.at.least(1);
            expect(result.errors[0].message).to.have.string(MSG.MODIFIED_TEMPLATE_SAME_VERSION_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("fail: changed 'id'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.properties[0].properties[0].id = 'xx';

          var expectations = function(result) {
            expect(result).property('isValid', false);
            expect(result.errors.length).to.be.at.least(1);
            expect(result.errors[0].message).to.have.string(MSG.MODIFIED_TEMPLATE_SAME_VERSION_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("fail: changed 'inherits'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(
            require('../schemas/good_reserved_types')
          ));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.inherits = 'Reference<Adsk.Core:Math.Color-1.0.0>';

          var expectations = function(result) {
            expect(result).property('isValid', false);
            expect(result.errors.length).to.be.at.least(1);
            expect(result.errors[0].message).to.have.string(MSG.MODIFIED_TEMPLATE_SAME_VERSION_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it('fail: added property', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.properties[0].properties.push({'id': 'newPropId', 'typeid': 'Float32'});

          var expectations = function(result) {
            expect(result).property('isValid', false);
            expect(result.errors.length).to.be.at.least(1);
            expect(result.errors[0].message).to.have.string(MSG.MODIFIED_TEMPLATE_SAME_VERSION_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it('fail: deleted property', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.properties[0].properties.pop();

          var expectations = function(result) {
            expect(result).property('isValid', false);
            expect(result.errors.length).to.be.at.least(1);
            expect(result.errors[0].message).to.have.string(MSG.MODIFIED_TEMPLATE_SAME_VERSION_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });
      });

      describe('incremented patch level', function() {
        it('pass: same content', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'patch');

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it('pass: unstable with major content change: 0.0.1 -> 0.0.2', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.typeid = 'TeamLeoValidation2:PointID-0.0.1';
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-0.0.2';
          template.properties[1].typeid = 'TeamLeoValidation2:ColorID-9.0.0';

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: changed 'annotation'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'patch');
          template.annotation.description = 'Changed!';

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: deleted 'annotation'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'patch');
          delete template.annotation;

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: added 'annotation'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'patch');
          template.annotation = {description: 'Test'};

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("warn: changed 'value'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_ui_border')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'Adsk.Core:UI.Border-' + semver.inc('1.0.0', 'patch');
          template.properties[0].properties[0].value = 123456;

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings.length).to.be.at.least(1);
            expect(result.warnings[0]).to.have.string(MSG.CHANGE_LEVEL_TOO_LOW_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("warn: changed 'id' (delete, add)", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'patch');
          template.properties[0].properties[0].id = 'xx';

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings.length).to.be.at.least(2); // 1st for the delete and the 2nd for the add
            expect(result.warnings[0]).to.have.string(MSG.CHANGE_LEVEL_TOO_LOW_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("warn: changed 'inherits'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(
            require('../schemas/good_reserved_types')
          ));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:Example-' + semver.inc('1.0.0', 'patch');
          template.inherits = 'Reference<Adsk.Core:Math.Color-1.0.0>';

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings.length).to.be.at.least(1);
            expect(result.warnings[0]).to.have.string(MSG.CHANGE_LEVEL_TOO_LOW_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it('warn: added property', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'patch');
          template.properties[0].properties.push({'id': 'newPropId', 'typeid': 'Float32'});

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings.length).to.be.at.least(1);
            expect(result.warnings[0]).to.have.string(MSG.CHANGE_LEVEL_TOO_LOW_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it('warn: deleted property', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'patch');
          template.properties[0].properties.pop();

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings.length).to.be.at.least(1);
            expect(result.warnings[0]).to.have.string(MSG.CHANGE_LEVEL_TOO_LOW_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });
      });

      describe('incremented minor level', function() {
        it('pass: same content', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'minor');

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: changed 'annotation'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'minor');
          template.annotation.description = 'Changed!';

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: deleted 'annotation'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'minor');
          delete template.annotation;

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: added 'annotation'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'minor');
          template.annotation = {description: 'Test'};

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: changed 'value'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_ui_border')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'Adsk.Core:UI.Border-' + semver.inc('1.0.0', 'minor');
          template.properties[0].properties[0].value = 123456;

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("warn: changed 'id' (delete, add)", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'minor');
          template.properties[0].properties[0].id = 'xx';

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings.length).to.be.at.least(1);
            expect(result.warnings[0]).to.have.string(MSG.CHANGE_LEVEL_TOO_LOW_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("warn: changed 'inherits'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(
            require('../schemas/good_reserved_types')
          ));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:Example-' + semver.inc('1.0.0', 'minor');
          template.inherits = 'Reference<Adsk.Core:Math.Color-1.0.0>';

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings.length).to.be.at.least(1);
            expect(result.warnings[0]).to.have.string(MSG.CHANGE_LEVEL_TOO_LOW_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it('pass: added property', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'minor');
          template.properties[0].properties.push({'id': 'newPropId', 'typeid': 'Float32'});

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it('warn: deleted property', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'minor');
          template.properties[0].properties.pop();

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings.length).to.be.at.least(1);
            expect(result.warnings[0]).to.have.string(MSG.CHANGE_LEVEL_TOO_LOW_1);
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });
      });

      describe('incremented major level', function() {
        it('pass: same content', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'major');

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: changed 'annotation'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'major');
          template.annotation.description = 'Changed!';

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: deleted 'annotation'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'major');
          delete template.annotation;

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: added 'annotation'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'major');
          template.annotation = {description: 'Test'};

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: changed 'value'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_ui_border')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'Adsk.Core:UI.Border-' + semver.inc('1.0.0', 'major');
          template.properties[0].properties[0].value = 123456;

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: changed 'id' (delete, add)", function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'major');
          template.properties[0].properties[0].id = 'xx';

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it("pass: changed 'inherits'", function() {
          var templatePrevious = JSON.parse(JSON.stringify(
            require('../schemas/good_reserved_types')
          ));
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:Example-' + semver.inc('1.0.0', 'major');
          template.inherits = 'Reference<Adsk.Core:Math.Color-1.0.0>';

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it('pass: added property', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'major');
          template.properties[0].properties.push({'id': 'newPropId', 'typeid': 'Float32'});

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });

        it('pass: deleted property', function() {
          var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
          templatePrevious.annotation = {description: 'Test'};
          var template = JSON.parse(JSON.stringify(templatePrevious));
          template.typeid = 'TeamLeoValidation2:PointID-' + semver.inc('1.0.0', 'major');
          template.properties[0].properties.pop();

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious);
        });
      });
    });

    describe('skip semver validation', function() {
      it('pass: deep equal on scrambled arrays', function() {
        var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
        var template = JSON.parse(JSON.stringify(templatePrevious));
        var tmp = template.properties[0].properties[0];
        template.properties[0].properties[0] = template.properties[0].properties[2];
        template.properties[0].properties[2] = tmp;
        tmp = template.properties[1];
        template.properties[1] = template.properties[2];
        template.properties[2] = tmp;
        // Skip semver validation to cause a deep compare

        var expectations = function(result) {
          expect(result).property('isValid', true);
          expect(result.errors).to.be.empty;
          expect(result.warnings).to.be.empty;
          return result;
        };
        return validate(expectations, template, templatePrevious, true);
      });

      it('pass: deep equal with version regression', function() {
        var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
        var template = JSON.parse(JSON.stringify(templatePrevious));

        var expectations = function(result) {
          expect(result).property('isValid', true);
          expect(result.errors).to.be.empty;
          expect(result.warnings).to.be.empty;
          return result;
        };
        return validate(expectations, template, templatePrevious, true);
      });

      it('pass: preserves input templates', function() {
        var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_point_id')));
        var template = JSON.parse(JSON.stringify(templatePrevious));

        var copies = [
          JSON.parse(JSON.stringify(templatePrevious)),
          JSON.parse(JSON.stringify(template))
        ];

        var expectations = function(result) {
          expect(result).property('isValid', true);
          expect(result.errors).to.be.empty;
          expect(result.warnings).to.be.empty;
          expect(templatePrevious).to.deep.equal(copies[0]);
          expect(template).to.deep.equal(copies[1]);
          return result;
        };
        return validate(expectations, template, templatePrevious);
      });

      it('fail: changed value', function() {
        var templatePrevious = JSON.parse(JSON.stringify(require('../schemas/good_ui_border')));
        var template = JSON.parse(JSON.stringify(templatePrevious));
        template.properties[0].properties[0].value = 123456;

        var expectations = function(result) {
          expect(result).property('isValid', false);
          expect(result.warnings).to.be.empty;
          expect(result.errors.length).to.be.at.least(1);
          expect(result.errors[0].message).to.have.string(MSG.MODIFIED_TEMPLATE_1);
          return result;
        };

        return validate(expectations, template, templatePrevious, true);
      });
    });

    describe('syntax validation', function() {
      it('pass: validate a simple file', function() {
        var template = require('../schemas/good_point_id');

        var expectations = function(result) {
          expect(result.isValid).to.equal(true);
          return result;
        };
        return validate(expectations, template, null, true);
      });

      it('fail: invalid file', function() {
        var template = require('../schemas/bad_primitive_typeid');

        var expectations = function(result) {
          expect(result.isValid).to.equal(false);
          expect(result.errors.length).to.be.greaterThan(0);
          expect(result.unresolvedTypes.length).to.equal(1);
          return result;
        };
        return validate(expectations, template, null, true);
      });

      it('should pass a schema with an empty array of properties', function() {
        var EmptyPropertySchema = {
          typeid: 'Test:EmptyPropertySchema-1.0.0',
          properties: []
        };

        var expectations = function(result) {
          expect(result.isValid).to.equal(true);
          return result;
        };
        return validate(expectations, EmptyPropertySchema, null);
      });
    });

    describe('bugs', function() {
      describe('@bugfix Template validation with multiple inheritance', function() {
        it('pass: deep equal with multiple inheritance', function() {
          var templateString =
            '{"typeid":"autodesk.core:translation.controller-1.0.0","inherits":["NamedProperty","NodeProperty"]}';
          var templatePrevious = JSON.parse(templateString);
          var template = JSON.parse(templateString);

          var expectations = function(result) {
            expect(result).property('isValid', true);
            expect(result.errors).to.be.empty;
            expect(result.warnings).to.be.empty;
            return result;
          };
          return validate(expectations, template, templatePrevious, true);
        });

        it('fail: deep equal with out of order multiple inheritance', function() {
          var template = JSON.parse('{"typeid":"autodesk.core:translation.controller-1.0.0",' +
            '"inherits":["NamedProperty","NodeProperty"]}'
          );
          var templatePrevious = JSON.parse('{"typeid":"autodesk.core:translation.controller-1.0.0",' +
            '"inherits":["NodeProperty","NamedProperty"]}'
          );

          var expectations = function(result) {
            expect(result).property('isValid', false);
            expect(result.errors.length).to.be.greaterThan(0);
            expect(result.errors[0].message).to.have.string(MSG.MODIFIED_TEMPLATE_1);
            return result;
          };
          return validate(expectations, template, templatePrevious, true);
        });
      });

      describe('@bugfix Local templates with \'abstract\' properties fail validation ' +
        'with remote one.', () => {
        describe('pass: deep equal between no properties and an empty properties array', () => {
          var templateArray = {
            typeid: 'SimpleTest:Shape-1.0.0',
            properties: []
          };
          var templateAbstract = {
            typeid: 'SimpleTest:Shape-1.0.0'
          };

          it('source is abstract and target is an empty properties array', function() {
            var expectations = function(result) {
              expect(result).property('isValid', true);
              expect(result.errors).to.be.empty;
              expect(result.warnings).to.be.empty;
              return result;
            };

            return validate(expectations, templateAbstract, templateArray);
          });

          it('target is abstract and source is an empty properties array', function() {
            var expectations = function(result) {
              expect(result).property('isValid', true);
              expect(result.errors).to.be.empty;
              expect(result.warnings).to.be.empty;
              return result;
            };

            return validate(expectations, templateArray, templateAbstract);
          });
        });
      });
    });

    describe('Constants', function() {
      var validator;
      before(function() {
        var schemaValidator = new SchemaValidator();

        validator = new TemplateValidator({
          skipSemver: true,
          inheritsFrom: schemaValidator.inheritsFrom,
          hasSchema: schemaValidator.hasSchema
        });
      });

      var expectationsGenerator = function(msg) {
        return function(result) {
          expect(result.isValid).to.equal(false);
          expect(result.errors.length).to.equal(1);
          expect(result.errors[0].message).to.equal(msg);

          return result;
        };
      };

      it('should pass a valid template', function() {
        var ConstantValid = {
          typeid: 'ConstantTest:ConstantValid-1.0.0',
          constants: [{ id: 'valid',  typeid: 'String', value: 'value' }]
        };

        var expectations = function(result) {
          expect(result.isValid).to.equal(true);
          return result;
        };

        return validate(expectations, ConstantValid, null);
      });

      it('should fail if constants array has no elements', function() {
        var ConstantEmptyArray = {
          typeid: 'ConstantTest:ConstantEmptyArray-1.0.0',
          constants: []
        };

        return validate(expectationsGenerator('/constants should NOT have fewer than 1 items'),
        ConstantEmptyArray, null, true);
      });

      it('should fail if constant does not have an id', function() {
        var ConstantNoId = {
          typeid: 'ConstantTest:ConstantNoId-1.0.0',
          constants: [{ typeid: 'String', value: 'value' }]
        };

        return validate(expectationsGenerator('/constants/0 should have required property \'id\''),
        ConstantNoId, null, true);
      });

      it('should fail if constant does not have a typeid', function() {
        var ConstantNoTypeid = {
          typeid: 'ConstantTest:ConstantNoTypeid-1.0.0',
          constants: [{ id: 'id', value: 'value' }]
        };

        return validate(
          function(result) {
            expect(result.isValid).to.equal(false);
            //console.log(result.errors);
            expect(result.errors.length).to.equal(5);
            expect(result.errors[3].message).to.include("should have required property 'inherits'");
            expect(result.errors[4].message).to.include("/constants/0 should have required property 'typeid'");
            return result;
          },
          ConstantNoTypeid, null, true
        );
      });

      it('should pass if constant does not have a typeid but maybe inherits from elsewhere', function() {
        var ConstantNoTypeid = {
          typeid: 'ConstantTest:ConstantNoTypeid-1.0.0',
          inherits: 'ConstantTest:ConstantParentWithTypeid-1.0.0',
          constants: [{ id: 'id', value: 'value' }]
        };

        var expectations = function(result) {
          expect(result.isValid).to.equal(true);
          return result;
        };

        return validate(expectations, ConstantNoTypeid, null);
      });

      it('should not fail if constant does not have a value or typedValue', function() {
        var ConstantNoValue = {
          typeid: 'ConstantTest:ConstantNoValue-1.0.0',
          constants: [{ id: 'id', typeid: 'String' }]
        };

        var expectations = function(result) {
          expect(result.isValid).to.equal(true);
          return result;
        };

        return validate(expectations, ConstantNoValue, null, true);
      });

      it('should pass if constant map with context key type typeid has typeids as keys', function() {
        var Constant = {
          typeid: 'ConstantTest:Constant-1.0.0',
          constants: [{
            id: 'map',
            typeid: 'Int32',
            context: 'map',
            contextKeyType: 'typeid',
            value: { 'SimpleTest:ConstantTemplate1-1.0.0': 1, 'SimpleTest:ConstantTemplate2-1.0.0': -1 }
          }]
        };

        var expectations = function(result) {
          expect(result.isValid).to.equal(true);
          return result;
        };

        return validate(expectations, Constant, null, true);
      });

      it('should fail if constant map with context key type that is not a valid value', function() {
        var ConstantNoValue = {
          typeid: 'ConstantTest:ConstantNoValue-1.0.0',
          constants: [{
            id: 'map',
            typeid: 'Int32',
            context: 'map',
            contextKeyType: 'badvalue',
            value: { 'SimpleTest:ConstantTemplate1-1.0.0': 1, 'SimpleTest:ConstantTemplate2-1.0.0': -1 }
          }]
        };

        return validate(
          function(result) {
            expect(result.isValid).to.equal(false);
            expect(result.errors.length).to.equal(1);
            expect(result.errors[0].message).to.include('should match one of the following: typeid,string');
            return result;
          },
          ConstantNoValue,
          null,
          true
        );
      });

      it('should fail if constant map with context key type typeid has invalid typeids as keys', function() {
        var ConstantMapWithBadKeys = {
          typeid: 'ConstantTest:ConstantMapWithBadKeys-1.0.0',
          constants: [{
            id: 'map',
            typeid: 'Int32',
            context: 'map',
            contextKeyType: 'typeid',
            value: { 'NotATypeId': 1, 'AlsoNotATypeId': -1 }
          }]
        };

        var expectations = function(result) {
          expect(result.isValid).to.equal(false);
          expect(result.errors.length).to.equal(2);
          expect(result.errors[0].message).to.include(
            MSG.KEY_MUST_BE_TYPEID + 'NotATypeId');
          expect(result.errors[1].message).to.include(
            MSG.KEY_MUST_BE_TYPEID + 'AlsoNotATypeId');

          return result;
        };

        return validate(expectations, ConstantMapWithBadKeys, null, true);
      });

      it('should fail if map with context key type typeid is not constant', function() {
        var ConstantMapWithProperty = {
          typeid: 'ConstantTest:Outerprop-1.0.0',
          properties: [{
            id: 'map',
            typeid: 'Int32',
            context: 'map',
            contextKeyType: 'typeid',
            value: { 'SimpleTest:ConstantTemplate1-1.0.0': 1, 'SimpleTest:ConstantTemplate2-1.0.0': -1 }
          }]
        };

        var expectations = function(result) {
          throw new Error('This should not be called');
        };
        var failExpectations = function(error) {
          expect(error.toString()).to.include(
            'SV-013: A map with typeids as keys must be constant');
        };
        return performValidation(false, ConstantMapWithProperty, null, true)
          .then(expectations).catch(failExpectations);
      });
    });

    describe('Async validation', function() {
      it('can perform context validation asynchronously', function(done) {
        var schemaValidator = new SchemaValidator();

        var templateValidator = new TemplateValidator({
          inheritsFromAsync: schemaValidator.inheritsFromAsync,
          hasSchemaAsync: schemaValidator.hasSchemaAsync
        });

        // Doesn't inherit from 'NamedProperty'. Will cause an error
        var grandParentSchema = {
          'typeid': 'test:grandparentschema-1.0.0'
        };

        var parentSchema = {
          'typeid': 'test:parentschema-1.0.0',
          'inherits': ['test:grandparentschema-1.0.0']
        };

        var childSchema = {
          'typeid': 'test:childchema-1.0.0',
          properties: [
            { id: 'set',
              typeid: 'test:parentschema-1.0.0',
              context: 'set'
            }
          ]
        };

        schemaValidator.register(grandParentSchema);
        schemaValidator.register(parentSchema);

        templateValidator.validateAsync(childSchema).then(
          () => {
            done(new Error('Should not be valid!'));
          },
          error => {
            expect(error).to.exist;
            done();
          }
        );
      });
    });
  });
})();
