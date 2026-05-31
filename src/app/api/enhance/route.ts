import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";

const EnhanceRequestSchema = z.object({
  prompt: z.string().min(1, "Le prompt ne peut pas être vide").max(3000, "Le prompt est trop long (max 3000 caractères)"),
  apiKey: z.string().optional(),
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

    const genAI = new GoogleGenerativeAI(finalApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-3.5-flash" });
    
    const systemInstruction = `Tu es un expert en ingénierie de prompt pour Excel et la finance. 
L'utilisateur va te donner une demande de formule approximative ou mal formulée.
Ta tâche est de RÉÉCRIRE cette demande pour qu'elle soit extrêmement claire, structurée et précise, afin qu'elle soit parfaitement comprise par une IA génératrice de code.
Ne donne PAS la formule. Rédige UNIQUEMENT la nouvelle demande améliorée.
Exemple d'entrée : "somme de A si B est superieur a 10"
Exemple de sortie : "Je souhaite obtenir une formule permettant de calculer la somme des valeurs de la colonne A, en appliquant comme condition que les cellules correspondantes de la colonne B soient strictement supérieures à 10."`;
    
    const result = await model.generateContent(`${systemInstruction}\n\nRequête brute: ${prompt}`);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ result: text.trim() });
  } catch (error: any) {
    console.error(error);
    // Masquer les messages d'erreur système bruts et donner des conseils pertinents
    let userMessage = error.message || "Erreur lors de l'amélioration de la demande";
    if (userMessage.includes("API key not valid") || userMessage.includes("API_KEY_INVALID")) {
      userMessage = "La clé API Gemini fournie est invalide. Veuillez la vérifier et réessayer.";
    } else if (userMessage.includes("quota") || userMessage.includes("429")) {
      userMessage = "Le quota de votre clé API Gemini a été dépassé. Veuillez réessayer dans quelques instants.";
    }
    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
