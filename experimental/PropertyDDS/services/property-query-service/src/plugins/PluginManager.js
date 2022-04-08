/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
const _ = require('lodash');

/**
 * Manager for various HFDM plugins.
 */
class PluginManager {

  /**
   * Load the list of required plugins.
   * @param {string} configPath - The config file path with the plugins to load.
   */
  constructor(configPath) {
    let config = require(configPath);

    this._plugins = _.extend(this._plugins, config && config.plugins ? config.plugins : {});
  }

  /**
   * Resolves and return the implementation module for a spcific plugin.
   * @param {string} plugin - The name of the plugin to load.
   * @return {object} The loaded module associated with the plugin.
   */
  resolve(plugin) {
    let p = this._plugins[plugin];

    if (!p || !p.module) {
      throw new Error(`No plugin found with identifier: ${plugin}`);
    }

    return require(p.module);
  }

  /**
   * Set a plugin manager instance.
   * @param {object} val - The instance to set.
   */
  static set instance(val) {
    PluginManager.inst = val;
  }

  /**
   * Get a plugin manager instance.
   * @return {object} The plugin manager instance.
   */
  static get instance() {
    if (!PluginManager.inst) {
      throw new Error('No instance of  plugin manager has been set');
    }

    return PluginManager.inst;
  }
}

module.exports = PluginManager;
