/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview Load the specified defaults json. The settings object will ( in order)
 * 1 - Load the passed in config file.
 * 2 - Overwrite the default values setting with CLI args ( where they match)
 * 3 - Overwrite the setting with ENV args.
 * 4 - Lastly the user of the class can overwrite the values.
 */
var fs = require('fs'),
    path = require('path'),
    nconf = require('nconf'),
    jsonlint = require('jsonlint'),
    utils = require('./settings_utils.js');

/**
 * The settings object which works as described above.
 * @param {array} in_configJSONPaths Array of Paths to settings json files.
 * @param {Object} [in_dynamicDefaults] Dictionary of values to overwrite dynamically.
 * @param {Object} in_options Dictionary of supported options.
 * @param {Boolean} in_options.exitOnParseError default true. Should the settings
 *    manager throw an error if a settings file cannot be parsed.
 * @param {Array.<string>} [in_options.required] This is the list of required
 *    settings which MUST be available BEFORE the default values are taken into account.
 * @constructor
 */
function Settings(in_configJSONPaths, in_dynamicDefaults, in_options) {
  var itr;

  in_options = in_options || {};
  var exitOnError = in_options.exitOnParseError || true;
  var configJSONPaths = in_configJSONPaths.slice();
  var configValues = {};
  var executeError = null;
  var typedSettingKeys = [
    {typeName: 'string', isType: function(val) { return typeof val === 'string'; }, keys: [] },
    {typeName: 'boolean', isType: function(val) { return typeof val === 'boolean'; }, keys: [] },
    {typeName: 'number', isType: function(val) { return typeof val === 'number'; }, keys: [] },
    {typeName: 'array', isType: function(val) { return val instanceof Array; }, keys: [] },
    {
      typeName: 'object',
      isType: function(val) { return val !== undefined && ( val === null || val.constructor === Object ); },
      keys: []
    }
  ];

  // Inherit from nconf - its a 3rd party module which does
  // not follow our standards and requires this janky method.
  nconf.Provider.call(this);
  // End inheritance
  var that = this;
  var defaults = {};
  var overrides = {};
  // If the environment variable HFDM_SETTINGS_OVERRIDE_FILES exists then split
  // its content into paths using a ';' as separator. For each path, if a file
  // exists then use it as an override file.
  if (process.env.HFDM_SETTINGS_OVERRIDE_FILES) {
    const masterFiles = process.env.HFDM_SETTINGS_OVERRIDE_FILES.split(';');
    for (itr = 0; itr < masterFiles.length; itr++) {
      if (fs.existsSync(masterFiles[itr])) {
        try {
          const obj = JSON.parse(fs.readFileSync(masterFiles[itr], 'utf8'));
          const overrideKeys = Object.keys(obj);
          for (let overrideItr = 0; overrideItr < overrideKeys.length; overrideItr++) {
            overrides[overrideKeys[overrideItr]] = obj[overrideKeys[overrideItr]];
          }
        } catch (e) {
          console.log('ERROR(ignored): failed parsing/reading:', masterFiles[itr]);
        }
      }
    }
  }

  if (process.env.OVERRIDES_AS_ENV) {
    try {
      const obj = JSON.parse(process.env.OVERRIDES_AS_ENV);
      const overrideKeys = Object.keys(obj);
      for (let overrideItr = 0; overrideItr < overrideKeys.length; overrideItr++) {
        overrides[overrideKeys[overrideItr]] = obj[overrideKeys[overrideItr]];
      }
    } catch (err) {
      console.log('ERROR(ignored): failed parsing/reading OVERRIDES_AS_ENV.');
    }
  }


  // If the environment variable HFDM_SETTINGS_OVERRIDE_STDIN exists then read
  // the stdin as a json object of name: value
  if (process.env.HFDM_SETTINGS_OVERRIDE_STDIN) {
    if (!global.ForgeHFDMSettings) {
      try {
        var bufferSize = 4096;
        var content = '';
        var buffer = Buffer.alloc(bufferSize);
        var bytesRead = 0;

        do {
          bytesRead = fs.readSync(process.stdin.fd, buffer, 0, bufferSize, null);
          content += buffer.toString('utf-8', 0, bytesRead);
        } while (bytesRead === bufferSize);
        global.ForgeHFDMSettings = JSON.parse(content);
      } catch (e) {
        console.log(e.toString());
        global.ForgeHFDMSettings = {};
      }
    }
    Object.keys(global.ForgeHFDMSettings).forEach(function(varName) {
      overrides[varName] = global.ForgeHFDMSettings[varName];
    });
  }

  try {
    const availableData = [];

    for (itr = 0; itr < configJSONPaths.length; itr++) {
      const fileText = fs.readFileSync(configJSONPaths[itr], 'utf8');
      try {
        availableData.push(jsonlint.parse(fileText, configJSONPaths[itr]));
      } catch (err) {
        console.error('Error parsing: ', configJSONPaths[itr]);
        if (exitOnError) {
          throw err;
        }
      }
    }

    for (itr = 0; itr < availableData.length; itr++) {
      const values = availableData[itr];

      // Only checks the properties of a setting when this environment variable is set.
      if (process.env.HFDM_SETTINGS_CHECK_PROPS) {
        var ONE_OF_REQUIRED = ['describe', 'default'];
        var ONLY_ALLOWED = ONE_OF_REQUIRED;

        Object.keys(values).forEach(function(settingName) {
          var settingObject = values[settingName];
          var propNames = Object.keys(settingObject);

          // Some properties are required
          var okForOneRequired = ONE_OF_REQUIRED.filter(function(item) {
            return propNames.includes(item);
          }).length > 0;
          if (!okForOneRequired) {
            throw new Error(
              `Did not find one of [${ONE_OF_REQUIRED}] in ${settingName}`
            );
          }

          // Some properties are the only one allowed.
          var unallowedProps = propNames.filter(function(item) {
            return !ONLY_ALLOWED.includes(item) && item;
          });
          if (unallowedProps.length > 0) {
            throw new Error(
              `Found unallowed props: [${unallowedProps}] in ${settingName}`
            );
          }
        });
      }

      var _evaluateAndStoreType = function(context, keyStack) {
        var valueKeys = Object.keys(context);

        for (var valueItr = 0; valueItr < valueKeys.length; valueItr++) {
          var thisLevelKey = valueKeys[valueItr];
          var fullKeyArray = keyStack.concat([thisLevelKey]);
          var fullKey = fullKeyArray.join(utils.CLASS_SEPARATOR);

          configValues[fullKey] = {};
          configValues[fullKey].default = context[thisLevelKey];

          var defaultValue;

          if (keyStack.length <= 1 &&
              context[thisLevelKey] &&
              context[thisLevelKey].default !== undefined
          ) {
            defaultValue = context[thisLevelKey].default;
          } else if (keyStack.length <= 1 &&
              context[thisLevelKey] &&
              context[thisLevelKey].default === undefined &&
              context[thisLevelKey].describe !== undefined
          ) {
            defaultValue = undefined;
          } else {
            defaultValue = context[thisLevelKey];
          }

          defaults[fullKey] = defaultValue;

          var type = typedSettingKeys.find(function(t) {
            return t.isType(defaultValue);
          });

          if (type) {
            type.keys.push(fullKey);

            if (type.typeName === 'object' && defaultValue !== null && defaultValue !== undefined) {
              _evaluateAndStoreType(defaultValue, fullKeyArray);
            }
          }
        }
      };

      _evaluateAndStoreType(values, []);
    }
  } catch (err) {
    console.error(err.stack);
    executeError = err;
  } finally {
    if (executeError) {
      throw executeError;
    }
  }

  // We should always have a help.
  if (!configValues.help) {
    configValues.help = utils.HELP;
  }

  if (in_dynamicDefaults) {
    var _addDynamicDefaults = function(context, currentPath) {
      var dynamicKeys = Object.keys(context);
      for (itr = 0; itr < dynamicKeys.length; itr++) {
        var currentKey = dynamicKeys[itr];
        var fullPath = currentPath.concat([currentKey]).join(utils.CLASS_SEPARATOR);
        try {
          var parsed = JSON.parse(context[currentKey]);
          if (parsed.constructor === Object) {
            _addDynamicDefaults(parsed, currentPath.concat([currentKey]));
          } else {
            defaults[fullPath] = context[currentKey];
          }
        } catch (ex) {
          defaults[fullPath] = context[currentKey];
        }
      }
    };

    _addDynamicDefaults(in_dynamicDefaults, []);
  }

  // convert the paths to a real class.
  var classedDefaults = utils._classify(defaults);
  var classedOverrides = utils._classify(overrides);

  // Replace namespace separators with env separators for the whitelist
  // for environment variables. The ':' character is invalid in env names,
  // so this allows overriding namespaced settings via the environment.
  // Note: we tell nconf about the separator below.
  var configKeys = Object.keys(configValues);
  var whitelistKeys = [];
  var separator = new RegExp(utils.CLASS_SEPARATOR, 'g');
  for (var i = 0; i < configKeys.length; i++) {
    whitelistKeys.push(configKeys[i].replace(separator, utils.ENV_CLASS_SEPARATOR));
  }

  // load the config
  that.add('memory')
    .env({'whitelist': whitelistKeys, 'separator': utils.ENV_CLASS_SEPARATOR})
    .argv()
    .overrides(classedOverrides)
    .chainableRequired(in_options.required || [])
    .defaults(classedDefaults);

  // check for help
  if (that.get('help')) {
    utils._prettyPrint(configValues, that);
    process.exit(0);
  }

  // Finally interpret the values of keys which may have been overriden.
  for (var typeItr = 0; typeItr < typedSettingKeys.length; typeItr++) {
    var type = typedSettingKeys[typeItr];
    utils._checkValueTypes(
      type.keys,
      type.isType,
      type.typeName,
      configValues,
      that);
  }
}

Settings.prototype = nconf;


/**
 * This validates that the given properties are available to the object. This is
 * a chainable version of the .required() offered by nconf.
 *
 * @param  {Array.<string>} keys List of keys to look for.
 * @return {object} Throws an error if any of `keys` has no value, otherwise
 *   returns the current instance.
 */
Settings.prototype.chainableRequired = function(keys) {
  this.required(keys);
  return this;
};


var singletonSettings;
/**
 * For convenience we provide access to the naked class as well as initializing a global
 * singleton setting.
 * @param {array} in_configJSONPaths Array of Paths to settings json files.
 * @param {Object} [in_dynamicDefaults] Dictionary of values to overwrite dynamically.
 * @param {Object} in_options Dictionary of supported options.
 *    {Boolean} in_options.exitOnParseError default true. Should the settings manager throw an error if a settings
 *    file cannot be parsed.
 * @return {Settings} A singleton Settings object.
 */
function _globalSettings(in_configJSONPaths, in_dynamicDefaults, in_options) {

  if (!singletonSettings) {
    var defaultPath = path.join(utils._getUserHome(), utils.HFDM_SETTINGS_DIR, utils.HFDM_SETTINGS);
    if (fs.existsSync(defaultPath)) {
      in_configJSONPaths.push(defaultPath);
    }
    singletonSettings = new Settings(in_configJSONPaths, in_dynamicDefaults, in_options);
  }
  return singletonSettings;
}

module.exports = Settings;
