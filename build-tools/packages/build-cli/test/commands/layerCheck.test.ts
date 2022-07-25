import {expect, test} from '@oclif/test'

describe('layer-check', () => {
  test
  .stdout()
  .command(['layer-check'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['layer-check', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
