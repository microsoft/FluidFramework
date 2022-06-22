/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {expect, test} from '@oclif/test'

describe('hello', () => {
  test
  .stdout()
  .command(['hello', 'friend', '--from=oclif'])
  .it('runs hello cmd', ctx => {
    expect(ctx.stdout).to.contain('hello friend from oclif!')
  })
})
