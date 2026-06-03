import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { rateLimit } from "@/lib/rateLimit";

const GeminiRequestSchema = z.object({
  prompt: z.string().min(1, "Le prompt ne peut pas être vide").max(3000, "Le prompt est trop long (max 3000 caractères)"),
  apiKey: z.string().optional(),
  modelChoice: z.enum(["flash", "pro"]).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Validation Zod des paramètres d'entrée
    const parsed = GeminiRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
    }
    
    const { prompt, apiKey, modelChoice } = parsed.data;
    const finalApiKey = apiKey || process.env.GEMINI_API_KEY;
    
    if (!finalApiKey) {
      return NextResponse.json({ error: "Clé API manquante et aucune clé serveur configurée." }, { status: 400 });
    }

    // Rate Limiting
    const ip = req.headers.get("x-forwarded-for") || "127.0.0.1";
    const isUsingServerKey = !apiKey;
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

    const genAI = new GoogleGenerativeAI(finalApiKey);
    
    // Sélection dynamique du modèle en fonction du choix de l'utilisateur (Flash ou Pro)
    const selectedModel = modelChoice === "pro" ? "gemini-3.5-pro" : "gemini-3.5-flash";
    const model = genAI.getGenerativeModel({ model: selectedModel });
    
    const systemInstruction = `Tu es un expert certifié en Microsoft Excel, Google Sheets, comptabilité et audit financier.

RÈGLES ABSOLUES à suivre sans exception :
1. N'invente JAMAIS une fonction Excel/Sheets qui n'existe pas. Si tu as un doute, dis-le explicitement.
2. Vérifie mentalement la syntaxe et l'ordre exact des arguments avant de répondre.
3. Indique toujours la version minimale requise (ex: Excel 2019+, Excel 365, ou toutes versions).
4. Si la demande est ambiguë, formule clairement l'hypothèse que tu fais.
5. Termine TOUJOURS ta réponse par une ligne : ✅ Vérification : [confirme la validité syntaxique ou signale un point à adapter].

STRUCTURE DE RÉPONSE (respecter cet ordre) :
1. La formule dans un bloc de code markdown.
2. Une explication concise et professionnelle, adaptée à un financier ou comptable.
3. La ligne de vérification (✅).`;
    
    const result = await model.generateContentStream(`${systemInstruction}\n\nRequête utilisateur: ${prompt}`);
    
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

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (error: any) {
    console.error(error);
    // Masquer les messages d'erreur système bruts et donner des conseils pertinents
    let userMessage = error.message || "Erreur de génération avec l'API Gemini";
    if (userMessage.includes("API key not valid") || userMessage.includes("API_KEY_INVALID")) {
      userMessage = "La clé API Gemini fournie est invalide. Veuillez la vérifier et réessayer.";
    } else if (userMessage.includes("quota") || userMessage.includes("429")) {
      userMessage = "Le quota de votre clé API Gemini a été dépassé. Veuillez réessayer dans quelques instants.";
    }
    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
