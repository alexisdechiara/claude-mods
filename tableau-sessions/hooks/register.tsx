import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Groupe, Ligne, Synchro } from '../types'

const PANE = 'tableau-sessions'
const SERVEUR = 'claude-code-remote'
const PERIODE_MS = 30_000

const lignes = atom({ plugin: 'tableau-sessions', key: 'lignes' } as const, [] as Ligne[], {
  shape: 'lignes-2',
})
const synchro = atom(
  { plugin: 'tableau-sessions', key: 'synchro' } as const,
  { le: null, erreur: null } as Synchro,
  { shape: 'synchro-1' },
)
const maintenant = atom({ plugin: 'tableau-sessions', key: 'maintenant' } as const, 0)

// Clés de $.store (gardées d'une session à l'autre).
const K_PROJETS = 'projets' // id -> nom du projet
const K_VUS = 'vus' // id -> updated_at marqué « vu » à la main
const K_GROUPES = 'groupes' // id -> groupe au dernier passage

type Brut = {
  id: string
  title?: string
  updated_at?: string
  status_bucket?: string
  unread?: boolean
  session_status?: string
  environment_kind?: string
  post_turn_summary?: {
    needs_action?: string
    status_detail?: string
    recent_action?: string
  }
}

const SECTIONS: { groupe: Groupe; titre: string; vide: string }[] = [
  { groupe: 'attente', titre: 'En attente de mon retour', vide: 'Aucune session ne t’attend.' },
  { groupe: 'cours', titre: 'En cours', vide: 'Aucune session ne tourne.' },
  { groupe: 'pret', titre: 'Résultat prêt', vide: 'Aucun résultat non consulté.' },
]

function extraireJson(texte: string): unknown {
  const debut = texte.indexOf('{')
  const fin = texte.lastIndexOf('}')
  if (debut < 0 || fin <= debut) throw new Error('réponse illisible')
  return JSON.parse(texte.slice(debut, fin + 1))
}

async function appeler($: EngineInterface, outil: string, args: Record<string, unknown>) {
  const r = await $.mcp.call(SERVEUR, outil, args)
  const texte = r.content
    .map(b => (b.type === 'text' ? (b as { text: string }).text : ''))
    .join('\n')
  if (r.isError) throw new Error(texte.slice(0, 200) || `${outil} a échoué`)
  const json = extraireJson(texte) as { ccr?: unknown }
  return (json.ccr ?? json) as Record<string, unknown>
}

async function lireObjet<T>($: EngineInterface, cle: string): Promise<Record<string, T>> {
  const v = await $.store.get(cle)
  return v && typeof v === 'object' ? (v as Record<string, T>) : {}
}

function groupeDe(s: Brut, vus: Record<string, string>): Groupe | null {
  if (s.session_status === 'SESSION_STATUS_ARCHIVED') return null
  switch (s.status_bucket) {
    case 'SESSION_STATUS_BUCKET_WORKING':
      return 'cours'
    case 'SESSION_STATUS_BUCKET_BLOCKED':
      return 'attente'
    case 'SESSION_STATUS_BUCKET_REVIEW_READY':
    case 'SESSION_STATUS_BUCKET_COMPLETED':
    case 'SESSION_STATUS_BUCKET_FAILED':
      // « Non consultée » : le serveur garde le drapeau `unread`, qui tombe
      // dès que la session est ouverte dans l'app ; « Vu » le force ici.
      return s.unread === true && vus[s.id] !== s.updated_at ? 'pret' : null
    default:
      return null
  }
}

function apercuDe(s: Brut, groupe: Groupe): string {
  const p = s.post_turn_summary ?? {}
  if (groupe === 'attente') {
    const besoin = p.needs_action || p.status_detail || 'Attend ta réponse.'
    const perm = /^Approve or deny (.+)$/.exec(besoin)
    if (perm) return perm[1] === 'AskUserQuestion' ? 'Question posée : réponds dans la session.' : `Autorisation demandée : ${perm[1]}`
    return besoin
  }
  if (groupe === 'cours') return p.status_detail || p.recent_action || 'Travail en cours…'
  return p.recent_action || p.status_detail || 'Résultat disponible.'
}

async function projetDe($: EngineInterface, s: Brut, cache: Record<string, string>) {
  const connu = cache[s.id]
  if (connu) return connu
  let nom = s.environment_kind === 'bridge' ? 'Ordinateur local' : 'Sans dépôt'
  try {
    const d = await appeler($, 'get_session', { session_id: s.id })
    const ctx = d.session_context as
      | { sources?: { git_repository?: { url?: string } }[]; cwd?: string }
      | undefined
    const url = ctx?.sources?.find(x => x.git_repository?.url)?.git_repository?.url
    if (url) nom = url.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '')
    else if (ctx?.cwd) nom = ctx.cwd.split('/').filter(Boolean).pop() ?? nom
  } catch {
    return nom // pas mis en cache : on réessaiera
  }
  cache[s.id] = nom
  return nom
}

let enCours = false
let moi: string | null = null

async function synchroniser($: EngineInterface) {
  if (enCours) return
  enCours = true
  try {
    const liste = await appeler($, 'list_sessions', { limit: 50, mine: true })
    const brutes = ((liste.data as Brut[] | undefined) ?? []).filter(s => s && s.id)
    if (moi === null) {
      // get_session sans id décrit la session où tourne le tableau de bord.
      const ici = await appeler($, 'get_session', {}).catch(() => null)
      moi = typeof ici?.id === 'string' ? ici.id : ''
    }
    const vus = await lireObjet<string>($, K_VUS)
    const projets = await lireObjet<string>($, K_PROJETS)
    const avant = await lireObjet<Groupe>($, K_GROUPES)
    const premierPassage = Object.keys(avant).length === 0

    const nouvelles: Ligne[] = []
    for (const s of brutes) {
      if (s.id === moi) continue
      const groupe = groupeDe(s, vus)
      if (!groupe) continue
      nouvelles.push({
        id: s.id,
        titre: s.title || 'Session sans titre',
        projet: await projetDe($, s, projets),
        groupe,
        majLe: Date.parse(s.updated_at ?? '') || Date.now(),
        majBrut: s.updated_at ?? '',
        apercu: apercuDe(s, groupe),
        echec: s.status_bucket === 'SESSION_STATUS_BUCKET_FAILED',
      })
    }
    nouvelles.sort((a, b) => b.majLe - a.majLe)

    // Notifications : une session qui arrive en « attente » ou « prêt ».
    const apres: Record<string, Groupe> = {}
    for (const l of nouvelles) apres[l.id] = l.groupe
    if (!premierPassage) {
      for (const l of nouvelles) {
        if (avant[l.id] === l.groupe || l.groupe === 'cours') continue
        const titre = l.groupe === 'attente' ? 'Une session t’attend' : 'Résultat prêt'
        const texte = `${l.titre} — ${l.apercu}`
        const envoi = await $.ui.notify(texte, { title: titre }).catch(() => ({ isSent: false }))
        if (!envoi.isSent) $.ui.toast(`${titre} : ${texte}`, { timeoutMs: 8000 })
      }
    }

    await $.store.set(K_GROUPES, Object.keys(apres).length ? apres : { _: 'cours' })
    await $.store.set(K_PROJETS, projets)
    await update($, lignes, () => nouvelles)
    await update($, synchro, () => ({ le: Date.now(), erreur: null }))
    await update($, maintenant, () => Date.now())
    afficherBadge($, nouvelles)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await update($, synchro, s => ({ le: s?.le ?? null, erreur: message }))
  } finally {
    enCours = false
  }
}

function compter(liste: Ligne[], g: Groupe) {
  return liste.filter(l => l.groupe === g).length
}

function afficherBadge($: EngineInterface, liste: Ligne[]) {
  const a = compter(liste, 'attente')
  const p = compter(liste, 'pret')
  const c = compter(liste, 'cours')
  const morceaux = [
    a ? `● ${a} en attente` : '',
    p ? `✓ ${p} prête${p > 1 ? 's' : ''}` : '',
    c ? `${c} en cours` : '',
  ].filter(Boolean)
  $.ui.status(morceaux.length ? `Sessions : ${morceaux.join(' · ')}` : undefined)
}

function ilYa(ms: number, maintenantMs: number): string {
  const s = Math.max(0, Math.round((maintenantMs - ms) / 1000))
  if (s < 60) return 'à l’instant'
  const m = Math.round(s / 60)
  if (m < 60) return `il y a ${m} min`
  const h = Math.round(m / 60)
  if (h < 24) return `il y a ${h} h`
  const j = Math.round(h / 24)
  return j === 1 ? 'hier' : `il y a ${j} j`
}

async function marquerVus($: EngineInterface, ids: string[]) {
  const liste = (await read($, lignes)) ?? []
  const vus = await lireObjet<string>($, K_VUS)
  // updated_at brut du serveur : la session revient si elle change ensuite.
  for (const l of liste) if (ids.includes(l.id)) vus[l.id] = l.majBrut
  await $.store.set(K_VUS, vus)
  const reste = liste.filter(x => !ids.includes(x.id))
  await update($, lignes, () => reste)
  afficherBadge($, reste)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'sessions',
      description: 'Ouvre le tableau de bord de mes sessions Claude',
    })
    void $.ui.open({ id: PANE, title: 'Mes sessions' })
    void synchroniser($)
    $.clock.every(PERIODE_MS, () => void synchroniser($))
    // L'horloge des « il y a … » avance même sans changement côté serveur.
    $.clock.every(60_000, () => void update($, maintenant, () => Date.now()))
    return next(e)
  })

  on('command.run', { command: 'sessions' }, async $ => {
    await $.ui.open({ id: PANE, title: 'Mes sessions' })
    void synchroniser($)
    return { text: 'Tableau de bord des sessions ouvert.' }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Link } = $.ui.resolve(e)
    const liste = (await read($, lignes)) ?? []
    const etat = (await read($, synchro)) ?? { le: null, erreur: null }
    const t = (await read($, maintenant)) || Date.now()

    const carte = (l: Ligne, enAvant: boolean) => (
      <Box
        key={`carte-${l.id}`}
        flexDirection="column"
        borderStyle="round"
        borderColor={enAvant ? 'warning' : 'subtle'}
        paddingX={1}
        marginBottom={1}
      >
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold weight="semibold">
            <Link href={`https://claude.ai/code/${l.id}`}>{l.titre}</Link>
          </Text>
          <Text dimColor size="footnote">
            {ilYa(l.majLe, t)}
          </Text>
        </Box>
        <Text dimColor size="footnote">
          {l.projet}
          {l.echec ? ' · échec' : ''}
        </Text>
        <Text color={enAvant ? 'warning' : undefined}>{l.apercu}</Text>
        {l.groupe === 'pret' && (
          <Box flexDirection="row">
            <Button key={`vu-${l.id}`} plain onPress={() => void marquerVus($, [l.id])}>
              <Text dimColor>Marquer comme vu</Text>
            </Button>
          </Box>
        )}
      </Box>
    )

    return (
      <Box flexDirection="column">
        {SECTIONS.map(sec => {
          const items = liste.filter(l => l.groupe === sec.groupe)
          const enAvant = sec.groupe === 'attente'
          return (
            <Box key={`sec-${sec.groupe}`} flexDirection="column" marginBottom={1}>
              <Box flexDirection="row" justifyContent="space-between">
                <Text
                  bold
                  size={enAvant ? 'heading' : 'body'}
                  color={enAvant && items.length ? 'warning' : undefined}
                >
                  {enAvant && items.length ? '● ' : ''}
                  {sec.titre} ({items.length})
                </Text>
                {sec.groupe === 'pret' && items.length > 1 && (
                  <Button
                    key="tout-vu"
                    plain
                    onPress={() => void marquerVus($, items.map(l => l.id))}
                  >
                    <Text dimColor>Tout marquer comme vu</Text>
                  </Button>
                )}
              </Box>
              {items.length === 0 ? (
                <Text dimColor>{sec.vide}</Text>
              ) : (
                items.map(l => carte(l, enAvant))
              )}
            </Box>
          )
        })}
        {etat.erreur ? (
          <Text color="error">Mise à jour impossible : {etat.erreur}</Text>
        ) : (
          <Text dimColor size="caption">
            {etat.le ? `Mis à jour ${ilYa(etat.le, t)} · actualisation toutes les 30 s` : 'Chargement…'}
          </Text>
        )}
        <Button key="rafraichir" plain onPress={() => void synchroniser($)}>
          <Text dimColor>Actualiser</Text>
        </Button>
      </Box>
    )
  })
}
