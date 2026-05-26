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
    
    const result = await model.generateContent(`${systemInstruction}\n\nRequête utilisateur: ${prompt}`);
    const response = await result.response;
    const text = response.text();

    return NextResponse.json({ result: text });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message || "Erreur de génération avec l'API Gemini" }, { status: 500 });
  }
}
