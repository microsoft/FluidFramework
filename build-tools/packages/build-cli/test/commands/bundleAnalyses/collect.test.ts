import {expect, test} from '@oclif/test'

describe('bundleAnalyses/collect', () => {
  test
  .stdout()
  .command(['bundleAnalyses/collect'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['bundleAnalyses/collect', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
