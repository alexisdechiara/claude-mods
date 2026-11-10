export type Outil = { nom: string; description: string; origine: string }

declare module 'claude-code' {
  interface PluginState {
    'barre-skills': {
      catalogue: Shaped<Outil[]>
      utilises: Shaped<string[]>
      ouverte: string
    }
  }
}
