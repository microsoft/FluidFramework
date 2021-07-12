/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * @fileoverview
 * Server side utility to get the public ip
 */
(function() {
  var os = require('os');

  var getPublicIp = function() {
    if (process.env.EXTERNAL_HOST) {
      return process.env.EXTERNAL_HOST;
    }
    if (process.env.PUBLIC_IP) {
      return process.env.PUBLIC_IP;
    }
    if (process.env.HOSTIP) {
      return process.env.HOSTIP;
    }
    if (process.env.DOCKER_HOST) {
      return process.env.DOCKER_HOST.match(/\/\/(.*?):/)[1];
    }

    var platform = process.platform;
    var interfaces = os.networkInterfaces();
    var flatInterfaceArray = [];

    Object.keys(interfaces)
      .forEach(key => flatInterfaceArray.push(interfaces[key]));

    var ipAddress = Object.keys(interfaces)
      .filter(key => key.startsWith('lo'))
      .map(key => interfaces[key])
      .reduce((accumulator, currentValue) => accumulator.concat(currentValue), [])
      .map(itf => itf.address)
      .find(address => address.startsWith('192.168.254'));

    if (ipAddress) {
      return ipAddress;
    }

    var ipAddresses = Object.keys(interfaces)
      .filter(key => !key.startsWith('lo'))
      .map(key => interfaces[key])
      .reduce((accumulator, currentValue) => accumulator.concat(currentValue), [])
      .filter(itf => !itf.internal && itf.family === 'IPv4')
      .map(itf => itf.address);

    if (platform === 'darwin') {
      var matches = ipAddresses.filter(addr => !addr.startsWith('192.168'));
      if (matches[0]) {
        return matches[0];
      }
    }

    if (platform === 'linux') {
      matches = ipAddresses.filter(addr => addr.startsWith('192.168'));
      if (matches[0]) {
        return matches[0];
      }

      // Ignore docker range
      matches = ipAddresses.filter(addr => !addr.startsWith('172'));
      if (matches[0]) {
        return matches[0];
      }
    }

    if (platform === 'win32') {
      // Ignore DockerNAT and docker 172 (docker range)
      matches = ipAddresses.filter(addr => !addr.startsWith('172.') && addr !== '10.0.75.1');
      if (matches[0]) {
        return matches[0];
      }
    }
    return '127.0.0.1';
  };

  module.exports = getPublicIp;
})();
