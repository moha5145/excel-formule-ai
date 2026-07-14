<p align="center">
  <img alt="Excel Formule AI" src="public/og-image.png" width="600">
</p>

<h1 align="center">⚡ Excel Formule AI</h1>

<p align="center">
  <strong>Vous décrivez. L'IA formule. Vous collez.</strong><br>
  <em>La fin des formules Excel qui donnent des sueurs froides.</em>
</p>

<p align="center">
  <a href="https://excel-formule-ai.vercel.app"><strong>🚀 Essayer la démo</strong></a> · 
  <a href="#-installation">📦 Installation</a> · 
  <a href="#-contribuer">🤝 Contribuer</a> · 
  <a href="https://github.com/your-repo/excel-formule-ai/issues">🐛 Un bug ?</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?logo=next.js&logoColor=white" alt="Next.js 16">
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19">
  <img src="https://img.shields.io/badge/Gemini-2.5-8E75B2?logo=google-gemini&logoColor=white" alt="Gemini">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind v4">
  <img src="https://img.shields.io/badge/license-MIT-green" alt="MIT">
</p>

---

## 🤔 C'est quoi ?

**Excel Formule AI** est une app web qui transforme vos phrases en formules Excel, Google Sheets ou LibreOffice Calc. Pas besoin d'être un wizard du tableur — vous écrivez en français, l'IA génère la formule, et vous la collez directement.

> 💡 *"Calculer la TVA de 20 % sur une colonne de montants HT"*
> → `=SI(A2<>"";A2*0.2;"")`

---

## 📸 Screenshots

<p align="center">
  <img src="screenshots/hero.png" alt="Interface d'accueil" width="800">
  <br>
  <em>Interface d'accueil — décrivez votre besoin en langage naturel</em>
</p>

<p align="center">
  <img src="screenshots/prompt-typed.png" alt="Prompt en cours de saisie" width="800">
  <br>
  <em>Saisie d'une demande — exemples rapides intégrés</em>
</p>

<p align="center">
  <img src="screenshots/result-final.png" alt="Résultat avec formule générée" width="800">
  <br>
  <em>Résultat avec la formule, l'explication, et les options d'export (copie, .txt, .xlsx)</em>
</p>

---

## ✨ Pourquoi ?

Parce que personne n'aime googler *"formule INDEX MATCH Excel FR"* à 23h. Ici, vous décrivez votre besoin en bon français, et vous obtenez :

- **Une formule correcte** — avec les bons séparateurs, les bons noms de fonctions
- **Une explication** — pour comprendre ce que fait la formule
- **Un tableau de simulation** — pour tester directement dans Excel
- **Un export .xlsx** — le fichier est prêt à l'emploi

---

## 🎯 Ce qu'on fait

| Ce que vous faites | Ce que l'app fait |
|---|---|
| Écrire en français | Génère la formule adaptée |
| Choisir Excel / LibreOffice | Adapte les séparateurs et fonctions |
| Choisir FR / EN | Utilise les bons noms (`SI` vs `IF`) |
| Demander une amélioration de prompt | Reformule votre demande pour plus de précision |
| Télécharger le .xlsx | Crée un classeur avec formule + guide + simulation |

---

## 🧰 Stack technique

| Outil | Rôle |
|---|---|
| [Next.js 16](https://nextjs.org/) | Framework full-stack (App Router) |
| [React 19](https://react.dev/) | Interface utilisateur |
| [shadcn/ui](https://ui.shadcn.com/) | Composants UI (base-ui) |
| [Tailwind CSS v4](https://tailwindcss.com/) | Styles |
| [Google Gemini API](https://ai.google.dev/) | Moteur IA (Flash & Pro) |
| [exceljs](https://github.com/exceljs/exceljs) | Génération de fichiers .xlsx |
| [Sentry](https://sentry.io/) | Monitoring d'erreurs |
| [Zod](https://zod.dev/) | Validation des requêtes |

---

## 📦 Installation

### Prérequis

- [Node.js](https://nodejs.org/) >= 18
- npm / yarn / pnpm
- Une clé API Google Gemini ([obtenir une clé](https://aistudio.google.com/app/apikey))

### En 3 commandes

```bash
git clone https://github.com/your-repo/excel-formule-ai.git
cd excel-formule-ai
npm install
```

### Configuration

```bash
cp .env.example .env.local
```

Éditez `.env.local` :

```env
# Requis pour le mode démo gratuit (quota partagé)
GEMINI_API_KEY=votre_clé_ici

# Optionnel : lien de support
NEXT_PUBLIC_SUPPORT_URL=https://buymeacoffee.com/votre-compte

# Optionnel : Sentry DSN
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
```

### Lancement

```bash
npm run dev
```

→ Ouvrez [http://localhost:3000](http://localhost:3000) et c'est parti 🎉

---

## 🔧 Variables d'environnement

| Variable | Requis | Description |
|---|---|---|
| `GEMINI_API_KEY` | ⚠️* | Clé API Google Gemini pour le quota gratuit |
| `NEXT_PUBLIC_SUPPORT_URL` | Non | Lien de donation (Buy Me a Coffee) |
| `NEXT_PUBLIC_SENTRY_DSN` | Non | DSN Sentry pour le monitoring |

\* *Sans clé serveur, les utilisateurs devront fournir leur propre clé dans l'interface.*

---

## 🚀 Déploiement

### Sur Vercel (recommandé)

```bash
npx vercel
```

Ou importez le repo depuis le [dashboard Vercel](https://vercel.com/new).

N'oubliez pas de configurer les variables d'environnement dans les settings Vercel.

### Ailleurs

Le projet fonctionne sur toute plateforme supportant Next.js (Docker, Railway, Netlify, etc.). Consultez la [doc Next.js](https://nextjs.org/docs/app/building-your-application/deploying) pour les options.

---

## 🧪 Utilisation

1. **Décrivez** votre besoin en français
2. **Choisissez** le format cible (Excel FR/EN, LibreOffice FR/EN)
3. **Cliquez** sur Générer (ou `Ctrl+Entrée`)
4. **Copiez** la formule ou **téléchargez** le .xlsx

### Raccourcis clavier

| Raccourci | Action |
|---|---|
| `Ctrl+Entrée` | Générer la formule |
| `Ctrl+Shift+E` | Améliorer le prompt |

### Mode démo vs. clé personnelle

| Mode | Limite | Quota |
|---|---|---|
| Démo (clé serveur) | 3 requêtes/jour | 10 req/min |
| Clé personnelle | Illimité | 60 req/min |

---

## 📁 Structure du projet

```
src/
├── app/
│   ├── api/                    # API routes
│   │   ├── gemini/route.ts     #   Génération IA (streaming)
│   │   ├── enhance/route.ts    #   Amélioration de prompt
│   │   ├── quota/route.ts      #   Vérification du quota
│   │   └── health/route.ts     #   Health check
│   ├── page.tsx                # Page principale (SPA)
│   └── layout.tsx              # Layout racine
├── components/
│   ├── FormulaAssistant.tsx    # Cœur de l'interface
│   ├── AppSidebar.tsx          # Panneau latéral
│   ├── ApiKeyModal.tsx         # Configuration de clé API
│   └── ui/                     # Composants shadcn/ui
├── hooks/
│   ├── useDebounce.ts
│   └── useLocalStorage.ts
└── lib/
    ├── excelExport.ts          # Génération .xlsx
    ├── excelExport/
    │   └── postProcessFormula.ts  # Traduction FR↔EN
    ├── rateLimit.ts            # Limiteur de débit
    └── utils.ts                # Utilitaires
```

---

## 🤝 Contribuer

On accepte tout : bugfixes, features, docs, even traductions !

### Comment contribuer

1. **Fork** le projet
2. **Créez** une branche (`git checkout -b feat/ma-feature`)
3. **Commit** (`git commit -m 'feat: description'`)
4. **Push** (`git push origin feat/ma-feature`)
5. **Ouvrez** une Pull Request

### Convention de commits

On suit [Conventional Commits](https://www.conventionalcommits.org/) :
- `feat:` — nouvelle fonctionnalité
- `fix:` — correction de bug
- `docs:` — documentation
- `style:` — formatage, points-virgules manquants, etc.
- `refactor:` — refonte sans changer le comportement
- `test:` — ajout de tests
- `chore:` — dépendances, config, CI

### Idées de contributions

- [ ] Ajouter des tests
- [ ] Support de plus de langues
- [ ] Mode sombre / clair
- [ ] Historique en base de données (au lieu de localStorage)
- [ ] PWA offline
- [ ] Intégration d'autres LLMs (OpenAI, Claude, Mistral)

---

## 🐛 Known Issues

- Le rate limiter est en mémoire — il ne survit pas aux redémarrages en production serverless
- Pas de système d'authentification (pour l'instant)

---

## 📄 Licence

MIT — faites ce que vous voulez avec. Voir le fichier [LICENSE](LICENSE).

---

<p align="center">
  Fait avec ❤️ pour les gens qui détestent les formules Excel.<br><br>
  <a href="https://www.buymeacoffee.com/">☕ Buy Me a Coffee</a>
</p>
