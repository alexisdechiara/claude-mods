export type Groupe = 'attente' | 'cours' | 'pret'

export type Ligne = {
  id: string
  titre: string
  projet: string
  groupe: Groupe
  majLe: number
  majBrut: string
  apercu: string
  echec: boolean
}

export type Synchro = { le: number | null; erreur: string | null }

declare module 'claude-code' {
  interface PluginState {
    'tableau-sessions': {
      lignes: Shaped<Ligne[]>
      synchro: Shaped<Synchro>
      maintenant: number
    }
  }
}
