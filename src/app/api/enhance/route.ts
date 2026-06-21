import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { rateLimit, getClientIp, dailyFreeLimit } from "@/lib/rateLimit";

const EnhanceRequestSchema = z.object({
  prompt: z.string().min(1, "Le prompt ne peut pas être vide").max(3000, "Le prompt est trop long (max 3000 caractères)"),
  apiKey: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validation Zod des paramètres d'entrée
    const parsed = EnhanceRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    
    const { prompt, apiKey } = parsed.data;
    const finalApiKey = apiKey || process.env.GEMINI_API_KEY;
    
    if (!finalApiKey) {
      return NextResponse.json({ error: "Clé API manquante et aucune clé serveur configurée." }, { status: 400 });
    }

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

    const systemInstruction = `Tu es un expert en ingénierie de prompt pour Excel et la finance. 
L'utilisateur va te donner une demande de formule approximative ou mal formulée.
Ta tâche est de RÉÉCRIRE cette demande pour qu'elle soit extrêmement claire, structurée et précise, afin qu'elle soit parfaitement comprise par une IA génératrice de code.
Ne donne PAS la formule. Rédige UNIQUEMENT la nouvelle demande améliorée.
Exemple d'entrée : "somme de A si B est superieur a 10"
Exemple de sortie : "Je souhaite obtenir une formule permettant de calculer la somme des valeurs de la colonne A, en appliquant comme condition que les cellules correspondantes de la colonne B soient strictement supérieures à 10."`;

    const fullPrompt = `${systemInstruction}\n\nRequête brute: ${prompt}`;

    async function generateContent(modelName: string) {
      const genAI = new GoogleGenerativeAI(finalApiKey);
      const model = genAI.getGenerativeModel({ model: modelName });
      return model.generateContent(fullPrompt);
    }

    let result;
    try {
      result = await generateContent("gemini-3.5-flash");
    } catch (streamErr: unknown) {
      if (streamErr instanceof Error && streamErr.message.includes("503")) {
        console.warn("503 on gemini-3.5-flash (enhance), falling back to gemini-2.5-flash");
        result = await generateContent("gemini-2.5-flash");
      } else {
        throw streamErr;
      }
    }
    const response = await result.response;
    const text = response.text();

    const headers: Record<string, string> = {};
    if (isUsingServerKey) {
      headers["X-Free-Remaining"] = String(dailyFreeRemaining);
    }
    return NextResponse.json({ result: text.trim() }, { headers });
  } catch (error: unknown) {
    console.error(error);
    const message = error instanceof Error ? error.message : "Erreur lors de l'amélioration de la demande";
    let userMessage = message;
    if (userMessage.includes("API key not valid") || userMessage.includes("API_KEY_INVALID")) {
      userMessage = "La clé API Gemini fournie est invalide. Veuillez la vérifier et réessayer.";
    } else if (userMessage.includes("503")) {
      userMessage = "Le modèle est temporairement saturé. Réessaye plus tard.";
    } else if (userMessage.includes("RESOURCE_EXHAUSTED") || userMessage.includes("429")) {
      if (userMessage.includes("free_tier")) {
        userMessage = "Quota Google gratuit épuisé. Ajoute ta clé API personnelle dans l'app, ou active la facturation sur ton projet Google Cloud.";
      } else {
        userMessage = "Trop de requêtes. Attends une minute avant de réessayer.";
      }
    }
    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
