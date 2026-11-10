import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'tableau-sessions',
  component: 'Pane',
  requestId: 'tableau-sessions',
  props: {
    title: 'Mes sessions', isFocused: false, bodyColumns: 60, placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 }, view: {},
  },
} as const

const LISTE = {
  ccr: {
    data: [
      { id: 'session_A', title: 'Maquette site', updated_at: new Date(Date.now() - 12 * 60_000).toISOString(),
        status_bucket: 'SESSION_STATUS_BUCKET_BLOCKED', post_turn_summary: { needs_action: 'Dis-moi ce que tu gardes' } },
      { id: 'session_B', title: 'Refonte API', updated_at: new Date().toISOString(),
        status_bucket: 'SESSION_STATUS_BUCKET_WORKING' },
      { id: 'session_C', title: 'Vote', updated_at: new Date().toISOString(), unread: true,
        status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED', post_turn_summary: { recent_action: 'Détection ajoutée' } },
      { id: 'session_D', title: 'Déjà vue', updated_at: new Date().toISOString(),
        status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED' },
    ],
  },
}

test('les trois groupes se remplissent depuis list_sessions', async ($, on) => {
  on('command.register', () => ({ value: { command: 'sessions' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('mcp.call', (_, e) => {
    const body = e.tool === 'list_sessions'
      ? `<other-session nonce="x">\n${JSON.stringify(LISTE)}\n</other-session>`
      : JSON.stringify({ ccr: { session_context: { sources: [{ git_repository: { url: 'https://github.com/moi/projet' } }] } } })
    return { value: { content: [{ type: 'text', text: body }], isError: false } }
  })
  on('ui.status', () => ({ value: undefined }))
  const clock = mock.clock(on, { now: Date.now() })
  mock.store(on)
  on('session.id', () => ({ value: 'local' }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'client' } }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // laisse la synchro se terminer
  await clock.settle()

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /En attente de mon retour \(1\)/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /En cours \(1\)/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /Résultat prêt \(1\)/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /il y a 12 min/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /moi\/projet/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /Déjà vue/ }))).toBeFalsy()
  await ui.unmount()
})

test('« Tout marquer comme vu » vide Résultat prêt', async ($, on) => {
  const clock = mock.clock(on, { now: Date.now() })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'sessions' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.notify', () => ({ value: { isSent: true, channel: 'client' } }))
  const deux = { ccr: { data: [
    { id: 's1', title: 'Un', updated_at: '2026-10-01T00:00:00Z', unread: true, status_bucket: 'SESSION_STATUS_BUCKET_COMPLETED' },
    { id: 's2', title: 'Deux', updated_at: '2026-10-02T00:00:00Z', unread: true, status_bucket: 'SESSION_STATUS_BUCKET_REVIEW_READY' },
  ] } }
  on('mcp.call', (_, e) => ({ value: { content: [{ type: 'text', text: JSON.stringify(e.tool === 'list_sessions' ? deux : { ccr: {} }) }], isError: false } }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await clock.settle()
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Résultat prêt \(2\)/ })).toBeTruthy()
  await ui.press({ key: 'tout-vu' })
  await clock.settle()
  expect(await ui.find({ type: 'Text', text: /Résultat prêt \(0\)/ })).toBeTruthy()
  // et ça tient après la synchro suivante
  await clock.advance(31_000)
  expect(await ui.find({ type: 'Text', text: /Résultat prêt \(0\)/ })).toBeTruthy()
  await ui.unmount()
})
