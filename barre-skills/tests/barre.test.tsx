import { expect, mock, test } from 'claude-code/testing'

const NOMS: [string, string][] = [
  ['ui-design-review:review', 'ui-design-review'], ['ui-design-review:polish', 'ui-design-review'], ['figma-to-code:implement', 'figma-to-code'],
  ['figma:figma-use', 'figma'], ['impeccable:impeccable', 'impeccable'], ['open-design:open-design-poster', 'open-design'],
  ['design:accessibility-review', 'design'], ['design:ux-copy', 'design'], ['dataviz', 'user'], ['artifact-design', 'user'],
  ['engineering:debug', 'engineering'], ['engineering:standup', 'engineering'], ['engineering:deploy-checklist', 'engineering'],
  ['mattpocock-skills:tdd', 'mattpocock-skills'], ['mattpocock-skills:grilling', 'mattpocock-skills'], ['andrej-karpathy-skills:karpathy-guidelines', 'andrej-karpathy-skills'],
  ['improve:improve', 'improve'], ['vercel:deploy', 'vercel'], ['vercel:env', 'vercel'], ['vercel:nextjs', 'vercel'], ['hostinger:deploy-to-hosting', 'hostinger'],
  ['openscreen:openscreen-demo', 'openscreen'], ['anthropic-skills:docx', 'anthropic-skills'], ['anthropic-skills:pptx', 'anthropic-skills'],
  ['anthropic-skills:computer-use', 'anthropic-skills'], ['cowork-plugin-management:create-cowork-plugin', 'cowork-plugin-management'],
]
const COMMANDES = [
  ...NOMS.map(([name, plugin]) => ({ name, description: '', source: plugin === 'user' ? 'user' : 'plugin', plugin: plugin === 'user' ? undefined : plugin })),
  { name: 'help', description: '', source: 'builtin' },
  { name: 'code-review', description: '', source: 'builtin' },
  { name: 'plugin-authoring', description: '', source: 'builtin' },
]

test('barre : catégories, liste déroulante et skills utilisés', async ($, on) => {
  const clock = mock.clock(on, { now: 0 })
  mock.store(on)
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.list', () => ({ value: COMMANDES }))
  on('session.messages', () => ({ value: [{ role: 'assistant', text: '', toolUses: [{ tool_use_id: 't', tool: 'Skill', input: { skill: 'plugin-authoring' } }] }] }))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  await $.tool.call({ tool: 'Skill', skill: 'vercel:deploy' } as never)
  await clock.settle()

  for (const surface of ['desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'barre-skills', component: 'AbovePrompt', requestId: 'p', surface,
      props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 6, bodyColumns: 100 } } as never)
    const selects = await ui.findAll({ type: 'Select' })
    const boutons = await ui.findAll({ type: 'Button' })
    const textes = await ui.findAll({ type: 'Text' })
    console.log(`\n[${surface}]`, selects.map(s => JSON.stringify((s as unknown as { props: { options: { label: string }[] } }).props?.options?.map(o => o.label))).join('\n'))
    console.log(boutons.map(b => b.text).join(' | '))
    console.log(textes.map(t => t.text).join(' | '))
    expect(textes.some(t => /Utilisés ici : plugin-authoring · deploy/.test(t.text ?? ''))).toBe(true)
    await ui.unmount()
  }
})
