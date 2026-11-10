# claude-mods

Deux mods pour Claude Code.

- **tableau-sessions** : un panneau « Mes sessions » à côté de la conversation, en trois groupes. « En attente de mon retour » vient en premier et est mis en avant, puis « En cours », puis « Résultat prêt » (sessions terminées pas encore consultées). Chaque session affiche son titre, son projet, sa dernière activité et une ligne d'aperçu. Le panneau se met à jour toutes les 30 s, affiche un compteur par groupe, un badge dans la barre d'état, et envoie une notification quand une session t'attend ou a fini. `/sessions` le rouvre. Il lit les sessions via le serveur MCP `claude-code-remote`, présent dans les sessions cloud de Claude Code.
- **barre-skills** : une barre au-dessus du champ de saisie avec une liste déroulante par catégorie (UI / UX, Ingénierie, Projet & docs, Déploiement & sysadmin, Autres) pour les skills et plugins installés. Choisir un skill écrit `/nom-du-skill ` dans le champ de saisie. À droite, les skills utilisés dans la session en cours.

## Installation

Dans une session Claude Code, à l'invite du terminal :

```
/plugin install tableau-sessions --marketplace alexisdechiara/claude-mods
/plugin install barre-skills --marketplace alexisdechiara/claude-mods
```

Depuis un shell :

```
claude plugin install tableau-sessions --marketplace alexisdechiara/claude-mods
claude plugin install barre-skills --marketplace alexisdechiara/claude-mods
```

Dans l'app desktop, où `/plugin` ne fonctionne pas : clique sur + à côté du champ de saisie, puis Plugins, Add marketplace avec `alexisdechiara/claude-mods`, puis Add plugin.

Le dépôt est privé : l'installation ne fonctionne que pour un compte qui peut le lire sur GitHub, sur une machine qui a déjà un identifiant git pour github.com (clé SSH, ou `gh auth login` puis `gh auth setup-git`).

## Tests

```
claude plugin test tableau-sessions
claude plugin test barre-skills
```
