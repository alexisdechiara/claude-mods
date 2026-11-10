import { atom, read, update } from 'claude-code'
import type { CommandInfo, EngineInterface, Register } from 'claude-code'

import type { Outil } from '../types'

const catalogue = atom({ plugin: 'barre-skills', key: 'catalogue' } as const, [] as Outil[], {
  shape: 'catalogue-1',
})
const utilises = atom({ plugin: 'barre-skills', key: 'utilises' } as const, [] as string[], {
  shape: 'utilises-1',
})
// Catégorie dépliée (surface mobile, qui n'a pas de liste déroulante).
const ouverte = atom({ plugin: 'barre-skills', key: 'ouverte' } as const, '')

type Categorie = { id: string; titre: string; motifs: RegExp }

// Rangées dans l'ordre : la première qui reconnaît le plugin ou le nom gagne.
const CATEGORIES: Categorie[] = [
  {
    id: 'design',
    titre: 'UI / UX',
    motifs:
      /figma|design|impeccable|ui-|ux|polish|theme|brand|dataviz|artifact-diagram|shadcn|accessib|critique|poster|canva/i,
  },
  {
    id: 'ingenierie',
    titre: 'Ingénierie',
    motifs:
      /engineering|mattpocock|karpathy|improve|code-review|simplify|security-review|^init$|tdd|debug|diagnos|architect|testing|tech-debt|refactor|claude-api|plugin-authoring|workflow|codebase|domain|prototype|nextjs|react|turbopack|ai-sdk|build-agents|eve|next-/i,
  },
  {
    id: 'projet',
    titre: 'Projet & docs',
    motifs:
      /standup|grill|research|pr$|documentation|docs|docx|pptx|xlsx|pdf|notion|morning|wizard|incident|deck|campaign|social|skill-creator|cowork|openscreen|demo/i,
  },
  {
    id: 'sysadmin',
    titre: 'Déploiement & sysadmin',
    motifs:
      /vercel|hostinger|deploy|env|cdn|firewall|sandbox|storage|function|cli|config|permission|hook|keybinding|status|bootstrap|migrat|wordpress|domain|marketplace|cache|middleware|microfrontend|flags|connect/i,
  },
]
const AUTRES: Categorie = { id: 'autres', titre: 'Autres', motifs: /$^/ }

// Skills livrés avec Claude Code (source « builtin ») qu'on veut quand même.
const INTEGRES = new Set([
  'code-review',
  'simplify',
  'security-review',
  'init',
  'claude-api',
  'loop',
  'run',
  'fewer-permission-prompts',
  'update-config',
  'keybindings-help',
  'plugin-authoring',
  'workflow-authoring',
  'artifact-design',
  'artifact-diagramming',
  'artifact-capabilities',
  'dataviz',
])

function categorieDe(o: Outil): Categorie {
  // Le nom du skill d'abord (engineering:standup va dans « Projet »),
  // puis le plugin qui l'apporte.
  const nom = court(o.nom)
  return (
    CATEGORIES.find(c => c.motifs.test(nom)) ??
    CATEGORIES.find(c => c.motifs.test(o.origine)) ??
    AUTRES
  )
}

function garder(c: CommandInfo): boolean {
  if (c.source === 'builtin') return INTEGRES.has(c.name)
  return c.source === 'plugin' || c.source === 'user' || c.source === 'mcp'
}

async function charger($: EngineInterface) {
  const commandes = await $.command.list().catch(() => [] as CommandInfo[])
  const outils: Outil[] = commandes.filter(garder).map(c => ({
    nom: c.name,
    description: c.description,
    origine: c.plugin ?? (c.name.includes(':') ? (c.name.split(':')[0] ?? '') : c.source),
  }))
  outils.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
  await update($, catalogue, () => outils)
}

async function noterUtilise($: EngineInterface, nom: string | undefined) {
  if (!nom) return
  const propre = nom.replace(/^\//, '')
  await update($, utilises, l => (l.includes(propre) ? l : [...l, propre]))
}

async function inserer($: EngineInterface, nom: string) {
  // On pré-remplit sans envoyer : la personne ajoute ses arguments puis Entrée.
  await $.prompt.fill({ text: `/${nom} `, mode: 'replace' })
  await update($, ouverte, () => '')
}

function court(nom: string): string {
  const i = nom.lastIndexOf(':')
  return i >= 0 ? nom.slice(i + 1) : nom
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const r = await next(e)
    await charger($)
    // Skills déjà appelés dans cette conversation avant le chargement du mod.
    const messages = await $.session.messages().catch(() => [])
    for (const m of messages)
      for (const t of m.toolUses)
        if (t.tool === 'Skill') await noterUtilise($, t.input.skill as string | undefined)
    return r
  })

  // Une installation ou un plugin rechargé change la liste : on la relit.
  on('turn.complete', async ($, e, next) => {
    const r = await next(e)
    void charger($)
    return r
  })

  on('tool.call', { tool: 'Skill' }, async ($, e, next) => {
    await noterUtilise($, (e as { skill?: string }).skill)
    return next(e)
  })

  on('command.run', async ($, e, next) => {
    const liste = (await read($, catalogue)) ?? []
    if (liste.some(o => o.nom === e.command)) await noterUtilise($, e.command)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const liste = (await read($, catalogue)) ?? []
    if (liste.length === 0) return next(e)
    const dejaLa = await next(e)
    const deja = (await read($, utilises)) ?? []
    const plie = (await read($, ouverte)) ?? ''

    const groupes = [...CATEGORIES, AUTRES]
      .map(c => ({ c, items: liste.filter(o => categorieDe(o).id === c.id) }))
      .filter(g => g.items.length > 0)

    const { Box, Text, Button } = $.ui.resolve(e)
    const utilisesVus = deja.slice(-4)
    const droite = (
      <Text dimColor>
        {utilisesVus.length
          ? `Utilisés ici : ${utilisesVus.map(court).join(' · ')}${deja.length > 4 ? ` +${deja.length - 4}` : ''}`
          : 'Aucun skill utilisé ici'}
      </Text>
    )

    if (e.surface === 'mobile') {
      const g = groupes.find(x => x.c.id === plie)
      return (
        <Box flexDirection="column">
          {dejaLa}
          <Box flexDirection="row" flexWrap="wrap" justifyContent="space-between">
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {groupes.map(x => (
                <Button
                  key={`cat-${x.c.id}`}
                  variant={plie === x.c.id ? 'primary' : 'secondary'}
                  onPress={() => void update($, ouverte, v => (v === x.c.id ? '' : x.c.id))}
                >
                  {x.c.titre} <Text dimColor>{String(x.items.length)}</Text>
                </Button>
              ))}
            </Box>
            {droite}
          </Box>
          {g && (
            <Box flexDirection="row" flexWrap="wrap" gap={1}>
              {g.items.map(o => (
                <Button key={`sk-${o.nom}`} plain onPress={() => void inserer($, o.nom)}>
                  /{o.nom}
                </Button>
              ))}
            </Box>
          )}
        </Box>
      )
    }

    const { Select } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {dejaLa}
        <Box flexDirection="row" justifyContent="space-between" flexWrap="wrap">
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {groupes.map(x => (
              <Select
                key={`cat-${x.c.id}`}
                value=""
                options={[
                  { value: '', label: `${x.c.titre} (${x.items.length}) ▾` },
                  ...x.items.map(o => ({ value: o.nom, label: `/${o.nom}` })),
                ]}
                onSelect={(v: string) => {
                  if (v) void inserer($, v)
                }}
              />
            ))}
          </Box>
          {droite}
        </Box>
      </Box>
    )
  })
}
