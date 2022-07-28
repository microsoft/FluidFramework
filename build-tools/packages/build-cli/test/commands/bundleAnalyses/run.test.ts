import {expect, test} from '@oclif/test'

describe('bundleAnalyses/run', () => {
  test
  .stdout()
  .command(['bundleAnalyses/run'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['bundleAnalyses/run', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
