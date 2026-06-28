import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { rateLimit, getClientIp, dailyFreeLimit } from "@/lib/rateLimit";

const GeminiRequestSchema = z.object({
  prompt: z.string().min(1, "Le prompt ne peut pas être vide").max(3000, "Le prompt est trop long (max 3000 caractères)"),
  apiKey: z.string().nullable().optional(),
  modelChoice: z.enum(["flash", "pro"]).optional(),
  format: z.enum(["excel-en", "excel-fr", "libreoffice-en", "libreoffice-fr"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validation Zod des paramètres d'entrée
    const parsed = GeminiRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    
    const { prompt, apiKey, modelChoice, format: reqFormat } = parsed.data;
    const finalApiKey = apiKey || process.env.GEMINI_API_KEY;
    
    if (!finalApiKey) {
      return NextResponse.json({ error: "Clé API manquante et aucune clé serveur configurée." }, { status: 400 });
    }
    const apiKeyString = finalApiKey;

    // Rate Limiting
    const ip = getClientIp(req);
    const isUsingServerKey = !apiKey;

    // Daily free limit check (only for server-key users)
    let dailyFreeRemaining = -1;
    if (isUsingServerKey) {
      const daily = dailyFreeLimit(ip);
      dailyFreeRemaining = daily.remaining;
      if (!daily.allowed) {
        return NextResponse.json(
          { error: "Limite quotidienne gratuite atteinte. Ajoutez votre clé API personnelle pour continuer." },
          {
            status: 429,
            headers: { "X-Free-Remaining": "0" },
          }
        );
      }
    }

    const limitResult = rateLimit(ip, isUsingServerKey ? 10 : 60, 60 * 1000);
    
    if (!limitResult.success) {
      return NextResponse.json(
        { error: "Trop de requêtes. Veuillez patienter une minute." },
        { 
          status: 429,
          headers: {
            "Retry-After": Math.ceil((limitResult.reset - Date.now()) / 1000).toString(),
          }
        }
      );
    }

    const FORMAT_INSTRUCTIONS: Record<string, string> = {
      "excel-en": "FORMAT DE FORMULE : Microsoft Excel (anglais)\n- Noms de fonctions : anglais (IF, VLOOKUP, PMT, XLOOKUP)\n- Séparateur d'arguments : , (virgule)\n- Séparateur décimal : . (point)",
      "excel-fr": "FORMAT DE FORMULE : Microsoft Excel (français)\n- Noms de fonctions : français (SI, RECHERCHEV, VPM, RECHERCHEX)\n- Séparateur d'arguments : ; (point-virgule)\n- Séparateur décimal : , (virgule)",
      "libreoffice-en": "FORMAT DE FORMULE : LibreOffice Calc (anglais)\n- Noms de fonctions : anglais (IF, VLOOKUP, PMT)\n- Séparateur d'arguments : , (virgule)\n- Séparateur décimal : . (point)\n- N'utilise PAS XLOOKUP ni XMATCH (non reconnus par LibreOffice) : utilise INDEX+MATCH à la place",
      "libreoffice-fr": "FORMAT DE FORMULE : LibreOffice Calc (français)\n- Noms de fonctions : français (SI, RECHERCHEV, VPM)\n- Séparateur d'arguments : ; (point-virgule)\n- Séparateur décimal : , (virgule)\n- N'utilise PAS RECHERCHEX ni EQUIVX (non reconnus par LibreOffice) : utilise INDEX+EQUIV à la place",
    };

    const formatKey = reqFormat || "libreoffice-fr";
    const formatInstruction = FORMAT_INSTRUCTIONS[formatKey] || FORMAT_INSTRUCTIONS["libreoffice-fr"];

    const systemInstruction = `Tu es un expert certifié en Microsoft Excel, Google Sheets, comptabilité et audit financier.

${formatInstruction}

RÈGLES ABSOLUES à suivre sans exception :
1. N'invente JAMAIS une fonction Excel/Sheets qui n'existe pas. Si tu as un doute, dis-le explicitement.
2. Vérifie mentalement la syntaxe et l'ordre exact des arguments avant de répondre.
3. Indique toujours la version minimale requise (ex: Excel 2019+, Excel 365, ou toutes versions).
4. Si la demande est ambiguë, formule clairement l'hypothèse que tu fais.
5. Termine TOUJOURS ta réponse par une ligne : ✅ Vérification : [confirme la validité syntaxique ou signale un point à adapter].

STRUCTURE DE RÉPONSE (respecter cet ordre) :
1. La formule dans un bloc de code markdown.
2. Une explication concise et professionnelle, adaptée à un financier ou comptable.
3. INCLURE OBLIGATOIREMENT un tableau Markdown d'exemple au format suivant :
   | Ligne   | Colonne1  | Colonne2 | Colonne3  |
   Règles :
   - Première colonne = "Ligne" avec labels ("Ligne 1", "Ligne 2", ...)
   - Colonnes suivantes = données avec en-têtes descriptifs (ex: "Services", "Salaires", "Critère", "Dates", "Régions")
   - Chaque ligne = un ensemble de valeurs (une par colonne de données)
   - Cellules vides = pas de valeur pour cette colonne sur cette ligne
   - Les refs cellule dans la formule utilisent l'ordre alphabétique (C, D, E, F, G...) pour chaque colonne de données (de gauche à droite) :
     * 1ère colonne de données = C
     * 2ème colonne de données = D
     * 3ème colonne de données = E
     * 4ème colonne de données = F
     * 5ème colonne de données = G
     * etc.
   - Les données commencent à la ligne 10 (C10, D10, E10, F10...)
   - La DERNIÈRE ligne contient la formule dans la dernière colonne (ex: =MAX.SI.ENS(D10:D12;C10:C12;E10))
   - Les valeurs texte dans la formule sont entre guillemets (ex: "Marketing")
   - Les taux sont en pourcentage (3.5) PAS en décimal (0.035)
   - INCLUR TOUTES les plages utilisées dans la formule
   - Nombres : valeur numérique pure (ex: 250000, 3.5, 20). PAS de texte mixte comme "3.5%"
   - Dates : date au format JJ/MM/AAAA (ex: 01/01/2024)
   Exemple avec 3 colonnes :
   | Ligne   | Services   | Salaires | Critère   |
   |---------|------------|----------|-----------|
   | Ligne 1 | Finance    | 45000    | Marketing |
   | Ligne 2 | Marketing  | 52000    |           |
   | Ligne 3 | RH         | 48000    |           |
   |         |            |          | =MAX.SI.ENS(D10:D12;C10:C12;E10) |
4. La ligne de vérification (✅).`;

    const fullPrompt = `${systemInstruction}\n\nRequête utilisateur: ${prompt}`;

    const selectedModel = modelChoice === "pro" ? "gemini-3.1-pro" : "gemini-3.5-flash";

    async function generateStream(modelName: string) {
      const genAI = new GoogleGenerativeAI(apiKeyString);
      const model = genAI.getGenerativeModel({ model: modelName });
      return model.generateContentStream(fullPrompt);
    }

    let result;
    try {
      result = await generateStream(selectedModel);
    } catch (streamErr: unknown) {
      if (streamErr instanceof Error && streamErr.message.includes("503")) {
        const fallback = selectedModel === "gemini-3.1-pro" ? "gemini-2.5-pro" : "gemini-2.5-flash";
        console.warn(`503 on ${selectedModel}, falling back to ${fallback}`);
        result = await generateStream(fallback);
      } else {
        throw streamErr;
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            if (chunkText) {
              controller.enqueue(encoder.encode(chunkText));
            }
          }
        } catch (err) {
          console.error("Error during streaming:", err);
          controller.error(err);
        } finally {
          controller.close();
        }
      }
    });

    const responseHeaders: Record<string, string> = {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    };

    if (isUsingServerKey) {
      responseHeaders["X-Free-Remaining"] = String(dailyFreeRemaining);
    }

    return new Response(stream, { headers: responseHeaders });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Erreur de génération avec l'API Gemini";
    let userMessage = message;
    if (userMessage.includes("API key not valid") || userMessage.includes("API_KEY_INVALID")) {
      userMessage = "La clé API Gemini fournie est invalide. Veuillez la vérifier et réessayer.";
    } else if (userMessage.includes("503")) {
      userMessage = "Le modèle est temporairement saturé. Réessaye dans quelques instants ou passe sur le modèle Flash (plus stable).";
    } else if (userMessage.includes("RESOURCE_EXHAUSTED") || userMessage.includes("429")) {
      if (userMessage.includes("free_tier_requests") || userMessage.includes("free_tier")) {
        userMessage = "Quota Google gratuit épuisé (20 req/jour max). Ajoute ta clé API personnelle dans l'app, ou active la facturation sur ton projet Google Cloud pour passer à 1500 req/jour.";
      } else if (userMessage.includes("per minute") || userMessage.includes("PerMinute")) {
        userMessage = "Trop de requêtes d'affilée. Attends une minute avant de réessayer.";
      } else {
        userMessage = "Quota API dépassé. Ajoute ta propre clé API dans l'application pour continuer.";
      }
    }
    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
