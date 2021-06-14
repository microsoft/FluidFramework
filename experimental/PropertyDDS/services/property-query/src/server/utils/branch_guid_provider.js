/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/**
 * Provides branch guids for the RequestSignatureValidator
 */
class BranchGuidProvider {
  /**
   * Returns a branch guids from a request parameter
   * @param {Request} req - Express request
   * @return {String} - The branch guid
   */
  static branchGuidFromParams(req) {
    return req.params.branchGuid;
  }

  /**
   * Returns a branch guids from a request body
   * @param {Request} req - Express request
   * @return {String} - The branch guid
   */
  static branchGuidFromBodyGuid(req) {
    return req.body.guid;
  }

  /**
   * Returns multiple branch guids from a request body
   * @param {Request} req - Express request
   * @return {String} - The branch guid
   */
  static branchGuidFromBodyGuids(req) {
    return req.body.branchGuids.join(',');
  }

  /**
   * Returns branch guids from an external source
   * @param {Array<String>} branchGuids - List of Branch Guids
   * @return {function} - An express middleware
   */
  static fromArgument(branchGuids) {
    return () => {
      return branchGuids.join(',');
    };
  }
}

module.exports = BranchGuidProvider;
