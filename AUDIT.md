# Plan d'Audit Production — Excel-Formule AI

> **Cible** : Vercel · **Modèle** : freemium + clé Gemini utilisateur optionnelle · **Sans auth**
>
> Date d'audit : 2026-07-27 · Basé sur l'analyse réelle de la codebase (findings ancrés `file:line`)
>
> **Synthèse** : 2 CRITICAL · 13 HIGH · 21 MEDIUM · 13 LOW

---

## Phase 0 — Blockers absolus (CRITICAL)

À corriger **avant tout déploiement**. Sans ces deux correctifs, le modèle freemium est trivial à contourner et la clé Gemini est compromise.

| # | Finding | Fichier | Action |
|---|---|---|---|
| 0.1 | **Rate limiter in-memory** ne survit pas aux cold starts Vercel ni au multi-instance. Le quota « 3/jour » est en réalité par-instance → contournable trivialement | `src/lib/rateLimit.ts:3,20-22,61,67-68` | Migrer vers **Vercel KV (Redis)** ou **Upstash Redis** avec `@upstash/ratelimit` (sliding window) |
| 0.2 | **Clé Gemini Live en clair dans `.env.local`** | `.env.local:1` | **Déclarer dans le dashboard Vercel** + rotater la clé compromise (le code ne la commit pas, mais elle est sur disque) |

---

## Phase 1 — Sécurité (HIGH)

Avant toute exposition publique de `/api/gemini` ou `/api/enhance`.

1. **Routes API sans authn sur la clé serveur** (`src/app/api/gemini/route.ts:21`, `src/app/api/enhance/route.ts:11`) — n'importe qui peut appeler `/api/gemini` sans header. → Maintenir le quota IP mais durcir via middleware + cap messages.
2. **`messages` array non borné** (`src/app/api/gemini/route.ts:13`) → ajouter `.max(50)` Zod + longueur max par message (ex: 8000 chars) pour éviter l'inflation de tokens Gemini contre la clé serveur.
3. **Prompt injection côté serveur absente** (`src/app/api/gemini/route.ts:670-674`) → le wrapper `src/app/page.tsx:354` est contournable via fetch direct. Renforcer `systemInstruction` Gemini avec instructions anti-injection + ignorer les cellules commençant par `=`, `<!--`, etc.
4. **IP trust `x-forwarded-for[0]`** (`src/lib/rateLimit.ts:10-14`) → utiliser `x-vercel-ip-x-forwarded-for` et/ou `x-vercel-forwarded-for` (entêtes Vercel fiables, non-spoofables côté client).
5. **Validation fichier upload uniquement côté client** (`src/components/FileUpload.tsx:21`) → valider côté serveur dans `/api/gemini` : extension + magic bytes + taille max.
6. **Injection via `fileContext.fileName`** dans le wrapper prompt (`src/app/page.tsx:354`) → sanitizer le nom avant interpolation (`fileName.replace(/[<>\-{}]/g, '')`).
7. **Sentry Session Replays sans PII scrubbing** (`sentry.client.config.ts:6,7`) → désactiver `replaysSessionSampleRate: 0` en prod, ou activer `maskAllText: true, blockAllMedia: true, networkDetailSampling: false`. Ajouter un `beforeSend` serveur qui scrub `apiKey`, `prompt`, `messages`.
8. **CSP `unsafe-inline`+`unsafe-eval`** (`next.config.ts:14`) → passer sur une CSP **nonce-based** (Next.js 16 support natif via `next.config.ts` `nonce`). Au minimum retirer `unsafe-eval`.

**Findings secondaires (MEDIUM) à traiter dans la même phase :**

- Pas de rate-limit par clé API utilisateur (NAT-collision) — `src/lib/rateLimit.ts:32`
- `apiKey` user non validée (format/longueur) — `src/app/api/gemini/route.ts:14`
- `console.error(error)` dans catches API → risque de leak via breadcrumbs Sentry — `src/app/api/gemini/route.ts:733,753`, `enhance/route.ts:98`
- Messages d'erreur Gemini retournés verbatim au client — `route.ts:769`, `enhance/route.ts:112`
- Clé user stockée en clair dans `localStorage` (clé `gemini_api_key`) — `src/app/page.tsx:148`, `src/hooks/useLocalStorage.ts:27`
- `xlsx@^0.18.5` (SheetJS community) — CVEs prototype-pollution / ReDoS — `package.json:34`
- Faille potentiel sur contenu CSV forgé pour produire des marqueurs `<!-- TABLE_SCHEMA -->` — `src/lib/fileParser.ts:95`, `src/app/page.tsx:353`

---

## Phase 2 — Performance & Scalabilité (HIGH)

9. **Pas de `maxDuration` sur `/api/gemini`** (`src/app/api/gemini/route.ts`) → `export const maxDuration = 60;` (Pro) ou `30` (Hobby) pour éviter le kill à 10s sur streaming long.
10. **`messages` et `history[].messages` non bornés** (`src/app/page.tsx:407-432`) → cap des régénérations (max 20 messages par conversation), rotation LRU, et compresser avant write localStorage.
11. **Heavy bundling client** : `xlsx`, `exceljs`, `react-markdown` importés statiquement (`src/app/page.tsx:12-14`) → `next/dynamic({ ssr:false })` pour `downloadFormulaAsExcel` et `react-markdown` ; `xlsx` déjà en dynamic import ✓.
12. **Pas de `<Suspense>`** dans `src/app/page.tsx` → wrapper le message list + Excel export en Suspense fallback pour le streaming progressif.
13. **Auto-scroll streaming cassé** (`src/app/page.tsx:457-461`) → useEffect dep sur `messages` au lieu de `loading`, ou scroll dans le reader loop.
14. **`ExcelExport` silent-empty** (`src/lib/excelExport.ts:779-790`) → toast d'erreur si pas de table ET pas de formule (au lieu du toast succès actuellement trompeur).

**Findings secondaires (MEDIUM/LOW) :**

- Page entière en `"use client"` → déplacer les sous-composants statiques (Hero, Sidebar) en server components — `src/app/page.tsx:1`
- `setTimeout` sans cleanup au unmount du `JsonSchemaCollapsible` — `src/app/page.tsx:59`
- Blob stream accumulé côté client puis localStorage write — `src/app/page.tsx:402, 415-432`
- Patch ZIP séquentiel — `src/lib/excelExport.ts:807-852`
- `buildComplexWorkbook` sync jusqu'à 1000+ cellules — `src/lib/excelExport/complexExcelBuilder.ts:366-478`

---

## Phase 3 — Tests & Couverture (HIGH/MEDIUM)

15. **0 test sur `fileParser.ts`** (139 lignes) → tests unit : extension invalide, >10MB, CSV, multi-feuille, détection formules.
16. **0 test sur `JsonSchemaCollapsible`** (`src/app/page.tsx:43-102`) → toggle open/close, Copier JSON, branche JSON.parse fail.
17. **Routes API non testées** → tests d'intégration (mock Gemini SDK) pour `/api/gemini` et `/api/enhance`.
18. **Seuil coverage manquant** (`vitest.config.ts`) → ajouter `{ thresholds: { lines: 70, functions: 70, branches: 60 } }`.
19. **Playwright `webServer` absent** (`playwright.config.ts`) → ajouter `webServer: { command: 'npm run build && npm start', port: 3000 }` pour CI/reproductibilité.
20. **`FileUpload.tsx` est mort** (aucun importeur) → supprimer le fichier + retirer `FileUpload` des imports résiduels.

**État actuel des tests :** 22 tests unitaires (lib `excelExport` only) + 3 tests e2e Playwright (chromium only, 1 project). Pas de tests composants, pas de tests API, pas de tests hooks.

---

## Phase 4 — Qualité code (MEDIUM)

21. **Lint : 9 erreurs** (apostrophes non échappées) + 10 warnings d'imports inutilisés (`Brain`, `Key`, `FileType`, `Upload`, `Crown`) → échapper les `'` ou utiliser des `'` typographiques ; retirer les imports morts.
   - Lieux : `src/app/page.tsx:553`, `src/components/ApiKeyModal.tsx:29,116`, `src/components/AppSidebar.tsx:333`, `src/components/FormulaAssistant.tsx:416,417,428`
22. **Props destructurées non utilisées** dans `FormulaInputBar` (`modelChoice`, `onModelChange`, `dailyFreeRemaining`, `onRequestKeyModal`, `apiKey`) — `src/components/FormulaAssistant.tsx:68-74` → supprimer de l'interface ou brancher effectivement (le choix model semblerait voulu étant donné le sélecteur absent).
23. **`as` non sécurisés** :
   - `src/hooks/useLocalStorage.ts:12` (`JSON.parse as T`) → valider avec un schema
   - `src/app/page.tsx:21` regex → valider avec `z.enum`
24. **`not-found.tsx` brand obsolète** `"Excel-Compta AI"` (`src/app/not-found.tsx:5`) → renommer en « Excel-Formule AI ».
25. **`extractSimulationParams` avale les erreurs** (`src/lib/excelExport.ts:84-93`) → au minimum log warning, idéalement schema-valider les params.

**Findings LOW :**

- `e.target.value as ExportFormat` — `src/components/FormulaAssistant.tsx:248`
- `Components` inline non importés depuis react-markdown — `src/app/page.tsx:587`
- Pas de script `tsc --noEmit` standalone, pas de `format` script — `package.json:5-13`
- `npm run lint` sans `--max-warnings 0` — `package.json:9`

---

## Phase 5 — UX & Accessibilité (MEDIUM)

26. **Char counter couleur seule** (`src/components/FormulaAssistant.tsx:351`) → ajouter `aria-live="polite"` + icône `AlertTriangle`.
27. **Bouton upload sans `aria-label`** (`src/components/FormulaAssistant.tsx:217`) + `fileError` sans `role="alert"` → respectivement `aria-label="Joindre un fichier"` et `role="alert"` sur l'erreur.
28. **`<select>` format sans `<label>`** (`src/components/FormulaAssistant.tsx:246`) → ajouter `<label htmlFor>` invisible ou `aria-label="Format de formule"`.
29. **Mode selector boutons sans `aria-pressed`** (`src/components/FormulaAssistant.tsx:148-174`) → `aria-pressed={generationMode === "formula_only"}`.
30. **Menu mobile exemples sans Escape / focus trap** → ajout `onKeyDown` Escape + `FocusTrap` (radix) pour fermer.
31. **`apple-touch-icon` absent** + manifest 1 seule icône (`any`) → générer 192/512/maskable + apple-touch-icon (Lighthouse PWA).

**Findings LOW/additionnels :**

- Bouton Excel : libellé visible "Excel" seul, description en `title` — `src/components/FormulaAssistant.tsx:473`
- `<input type="file">` caché sans `aria-label` — `src/components/FormulaAssistant.tsx:237-244`
- `aria-label="Copier la formule"` dupliqué sur tous les messages — `src/app/page.tsx:576-582`
- `<kbd>` hints visuels sans `accessKey`/`aria-keyshortcuts` programmatique — `src/components/FormulaAssistant.tsx:373-375`

---

## Phase 6 — Configuration production (INFO, mais nécessaire)

32. Pas de `middleware.ts` → créer `src/middleware.ts` pour appliquer rate limit edge + `X-Robots` sur `/api/*`.
33. Sentry : `tracesSampleRate: 0.2` en prod, à baisser à `0.05` si volume élevé. Vérifier `SENTRY_DSN` côté Vercel.
34. Vercel Analytics déjà en place (`src/app/layout.tsx:48`) — vérifier l'activation en prod et le `NEXT_PUBLIC_SUPPORT_URL` pour les toasts café (`src/app/page.tsx:100`).
35. README / `implementation_plan.md` → mettre à jour avec la nouvelle UI intégrée (upload dans la barre de saisie).

**Findings INFO positifs (à conserver) :**

- ReactMarkdown safe (pas de `rehype-raw`, pas de `dangerouslySetInnerHTML`) — `src/app/page.tsx:572-595`
- HSTS, X-Frame-Options, Permissions-Policy corrects — `next.config.ts:4-25`
- Pas de `NEXT_PUBLIC_*` qui leak un secret — `.env.local`
- Parse fichier en mémoire, aucun fichier tmp écrit — `src/lib/fileParser.ts:18,25,109,121`
- `addEventListener` clavier proprement nettoyé — `src/app/page.tsx:442-455`
- Metadata SEO complète (OG, Twitter, robots, sitemap, manifest) — `src/app/layout.tsx:11-35`, `src/app/sitemap.ts`, `src/app/robots.ts`, `src/app/manifest.ts`

---

## Résultat attendu après exécution

- **0 CRITICAL · 0 HIGH bloquant**
- Lighthouse ≥ 90 / Performance, Accessibility, Best Practices, SEO
- `npm run build` + `npm test` verts
- Sentry sans PII · CSP sans `unsafe-eval`
- Coverage ≥ 70% lines/functions sur chemins critiques

## Synthèse des fichiers impactés

| Phase | Fichiers modifiés |
|---|---|
| 0 | `src/lib/rateLimit.ts`, `.env.local` (rotate), `package.json` (déps KV) |
| 1 | `src/app/api/gemini/route.ts`, `src/app/api/enhance/route.ts`, `src/middleware.ts` (new), `next.config.ts`, `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts` |
| 2 | `src/app/page.tsx`, `src/lib/excelExport.ts`, `next.config.ts` (maxDuration) |
| 3 | `src/lib/fileParser.test.ts` (new), `src/app/page.test.tsx` (new), `vitest.config.ts`, `playwright.config.ts`, suppression `src/components/FileUpload.tsx` |
| 4 | Règles lint, `src/components/FormulaAssistant.tsx`, `src/hooks/useLocalStorage.ts`, `src/app/not-found.tsx`, `src/lib/excelExport.ts` |
| 5 | `src/components/FormulaAssistant.tsx`, `src/app/manifest.ts`, `public/apple-touch-icon.png` (new), `public/icon-192.png`, `public/icon-512.png` |
| 6 | `README.md`, `implementation_plan.md`, `src/middleware.ts` |

---

_Document vivant — mettez à jour ce fichier après chaque correctif appliqué._
