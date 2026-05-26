import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const { prompt, apiKey } = await req.json();
    
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
    return NextResponse.json({ error: error.message || "Erreur lors de l'amélioration de la demande" }, { status: 500 });
  }
}
