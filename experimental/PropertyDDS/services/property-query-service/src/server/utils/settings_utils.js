/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview A location for methods shared between the sync and async settings code.
 */

var chalk = require('chalk');

// default help which gets injected into the config values
module.exports.HELP = {
  describe: 'Display help and exit.'
};

module.exports.HFDM_SETTINGS = 'settings.json';
module.exports.HFDM_SETTINGS_DIR = '.hfdm';
module.exports.CLASS_SEPARATOR = ':';
module.exports.ENV_CLASS_SEPARATOR = '__';

/**
 * Function to convert paths with the CLASS_SEPARATOR into an actual class entry.
 * @param {Object} in_defaults The arbitrary json object.
 * @return {Object} The settings paths convert to objects.
 * @private
 */
module.exports._classify = function(in_defaults) {

  var classedDefaults = {};
  var defaultKeys = Object.keys(in_defaults);
  for (var keyItr = 0; keyItr < defaultKeys.length; keyItr++) {

    var classPath = defaultKeys[keyItr].split(module.exports.CLASS_SEPARATOR);
    var classItr;
    if (classPath.length > 1) {
      var currentObj =  classedDefaults;
      for (classItr = 0; classItr < classPath.length - 1; classItr++) {
        currentObj[classPath[classItr]] = currentObj[classPath[classItr]] || {};
        currentObj = currentObj[classPath[classItr]];
      }
      currentObj[classPath[classItr]] = in_defaults[defaultKeys[keyItr]];
    } else {
      classedDefaults[defaultKeys[keyItr]] = in_defaults[defaultKeys[keyItr]];
    }
  }

  return classedDefaults;
};

/**
 * Try and determine the home directory of the logged in user. Failing that, take the
 * current application path.
 * @return {String} The user home folder or the current script path.
 * @private
 */
module.exports._getUserHome = function() {
  return process.env.HOME ||
    process.env.USERPROFILE ||
    process.env.PWD ||
    __dirname;
};

/**
 * For any setting with a default value, ensure that get() returns a value of that type.
 * This also allows overriding array and object settings from the environment or comand
 * line, by parsing the input as JSON. In the event of a type mismatch or parse error
 * the setting retains its default value.
 *
 * @param {Array} keys Array of keynames.
 * @param {Function} isExpectedType Predicate to check type of override values.
 * @param {String} expectedType String name of expected type.
 * @param {Object} configValues Dictionary of config values.
 * @param {Settings} settings Settings object so we can update values.
 */
module.exports._checkValueTypes = function(keys, isExpectedType, expectedType, configValues, settings) {
  for (var keyItr = 0; keyItr < keys.length; keyItr++) {
    var settingKey =  keys[keyItr];
    var settingVal =  settings.get(settingKey);

    if (!isExpectedType(settingVal)) {
      var newVal = configValues[settingKey].default;

      try {
        var parsedVal = JSON.parse(settingVal);
      } catch (err) {
        throw new Error(
          'Unable to parse value for ' + settingKey + '. ' +
          'Expected type: ' + expectedType + '. ' +
          'The parsed string begins with "' + (settingVal && settingVal.slice(0, 5)) + '...". ' +
          'The error is ' + err.message
        );
      }
      if (!isExpectedType(parsedVal)) {
        throw new Error(
          'Incorrect type for ' + settingKey + '.' +
          'Expected ' + expectedType + '.'
        );
      } else {
        newVal = parsedVal;
      }
      settings.set(settingKey, newVal);
    }
  }
};

/**
 * Used to print out the configuration file
 * @param {Object} in_conf - The configuration file.
 * @param {Object} in_nconf - The settings object.
 */
module.exports._prettyPrint = function(in_conf, in_nconf) {
  var keys = Object.keys(in_conf);
  var length = keys.length;
  for (var i = 0; i < length; i++) {
    var itr = keys[i];
    console.log(chalk.cyan(itr));
    if (in_conf[itr].describe !== undefined) {

      var descriptionTag = '  Description : ';
      var describe = in_conf[itr].describe;
      if (Array.isArray(in_conf[itr].describe)) {
        var formatting = '\n ' + Array(descriptionTag.length + 1).join(' ');
        describe = in_conf[itr].describe.join(formatting);
      }
      console.log(chalk.red(descriptionTag), chalk.magenta(describe));
    }

    var defaultVal = in_conf[itr].default;
    if ((in_conf[itr].default) && (typeof in_conf[itr].default === 'object')) {
      defaultVal = JSON.stringify(in_conf[itr].default);
    }

    if ((in_nconf.get(itr) !== undefined) && (in_nconf.get(itr) !== defaultVal)) {
      console.log(chalk.red('  Value       : '), in_nconf.get(itr));
    }

    if (in_conf[itr].default !== undefined) {
      console.log(chalk.red('  Default     : '), chalk.yellow(defaultVal));
    }
  }
};
