'use strict'
const config = require('conventional-changelog-conventionalcommits')

module.exports = config({
    tagPrefix: "build-tools_v",
    preMajor: true,
    gitRawCommitsOpts : {
        merges: null
      }
})
