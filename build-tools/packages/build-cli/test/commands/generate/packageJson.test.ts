import {expect, test} from '@oclif/test'

describe('generate/packageJson', () => {
  test
  .stdout()
  .command(['generate/packageJson'])
  .it('runs hello', ctx => {
    expect(ctx.stdout).to.contain('hello world')
  })

  test
  .stdout()
  .command(['generate/packageJson', '--name', 'jeff'])
  .it('runs hello --name jeff', ctx => {
    expect(ctx.stdout).to.contain('hello jeff')
  })
})
