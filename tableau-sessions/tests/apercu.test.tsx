import { expect, mock, test } from 'claude-code/testing'

const S = (id: string, title: string, updated_at: string, status_bucket: string, extra: Record<string, unknown> = {}) =>
  ({ id, title, updated_at, status_bucket: `SESSION_STATUS_BUCKET_${status_bucket}`, session_status: 'SESSION_STATUS_IDLE', ...extra })

const DATA = [
  S('session_moi', 'Tableau de bord sessions Claude', '2026-11-10T10:22:29Z', 'WORKING'),
  S('s1', 'Revue de code', '2026-11-10T10:21:15Z', 'REVIEW_READY', { unread: true, environment_kind: 'bridge' }),
  S('s2', 'Refonte de la page d’accueil', '2026-11-10T09:56:38Z', 'BLOCKED', { post_turn_summary: { needs_action: 'Dis-moi quelle version tu gardes' } }),
  S('s3', 'Préparation de la démo', '2026-11-08T14:28:10Z', 'COMPLETED', { unread: true, environment_kind: 'bridge', post_turn_summary: { recent_action: 'Démo enregistrée, à relire.' } }),
  S('s4', 'Installation des outils', '2026-11-10T10:22:21Z', 'BLOCKED', { unread: true, environment_kind: 'bridge', post_turn_summary: { needs_action: 'Approve or deny AskUserQuestion' } }),
  S('s5', 'Audit archivé', '2026-11-08T10:56:43Z', 'COMPLETED', { unread: true, session_status: 'SESSION_STATUS_ARCHIVED' }),
  S('s6', 'Session déjà lue', '2026-11-09T14:28:43Z', 'COMPLETED'),
]

test('aperçu', async ($, on) => {
  const clock = mock.clock(on, { now: Date.parse('2026-11-10T10:34:00Z') })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'sessions' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.status', (_, e) => { console.log('BARRE D’ÉTAT →', e.text); return { value: undefined } })
  on('ui.notify', () => ({ value: { isSent: true, channel: 'client' } }))
  on('mcp.call', (_, e) => {
    const a = e.args as { session_id?: string } | undefined
    let body: unknown = { ccr: { data: DATA } }
    if (e.tool === 'get_session') body = a?.session_id ? { ccr: { session_context: { sources: a.session_id === 's2' ? [{ git_repository: { url: 'https://github.com/moi/mon-site' } }] : [] } } } : { ccr: { id: 'session_moi' } }
    return { value: { content: [{ type: 'text', text: JSON.stringify(body) }], isError: false } }
  })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'tableau-sessions', component: 'Pane', requestId: 'tableau-sessions', surface: 'desktop',
    props: { title: 'Mes sessions', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} } } as never)
  const textes = await ui.findAll({ type: 'Text' })
  console.log('\n' + textes.map(t => t.text).join('\n'))
  expect(textes.length).toBeGreaterThan(0)
  await ui.unmount()
})
