import { GoogleGenAI, Type } from "@google/genai";
import { PROPERTIES_CATALOG, Property } from "../lib/properties-db";

export async function handleCompareVerdict(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => ({}));
    const selectedIds: string[] = body.propertyIds || ["casa-do-bosque", "loft-horizonte", "penthouse-urbano", "studio-artistico"];

    const selectedProperties: Property[] = selectedIds
      .map((id) => PROPERTIES_CATALOG.find((p) => p.id === id))
      .filter((p): p is Property => Boolean(p));

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: true,
          isAI: false,
          verdicts: [
            {
              title: "Para famílias",
              subtitle: "Espaço, privacidade e qualidade de vida",
              icon: "🌳",
              winnerPropertyId: selectedProperties[0]?.id || "casa-do-bosque",
              reason: "Maior área total, jardim privativo e proximidade com áreas verdes. Excelente isolamento acústico.",
              badge: "🏆 Melhor geral"
            },
            {
              title: "Para home office",
              subtitle: "Criatividade, luz natural e inspiração",
              icon: "💻",
              winnerPropertyId: selectedProperties[1]?.id || "loft-horizonte",
              reason: "Pé-direito duplo com iluminação abundante e localização cercada por vilas culturais e cafés.",
              badge: "✨ Mais inspirador"
            },
            {
              title: "Para investidores",
              subtitle: "Valorização, liquidez e prestígio",
              icon: "🏙",
              winnerPropertyId: selectedProperties[2]?.id || "penthouse-urbano",
              reason: "Imóvel de altíssimo padrão em bairro nobre, com liquidez acelerada no mercado de luxo.",
              badge: "📈 Alta liquidez"
            },
            {
              title: "Melhor custo-benefício",
              subtitle: "Eficiência e menor custo fixo",
              icon: "💰",
              winnerPropertyId: selectedProperties[3]?.id || selectedProperties[0]?.id || "studio-artistico",
              reason: "Menor custo de condomínio por metro quadrado e localização estratégica próxima ao transporte.",
              badge: "💡 Mais econômico"
            }
          ]
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build"
        }
      }
    });

    const systemInstruction = `Você é um Consultor Imobiliário Sênior e Especialista em IA para a imobiliária Living Canvas.
Sua função é analisar comparativamente os imóveis selecionados pelo cliente e dar o Veredito da IA apontando o imóvel vencedor para 4 perfis distintos:
1. Para famílias (foco em espaço, privacidade, silêncio, segurança e verde)
2. Para home office (foco em luz natural, inspiração, cafés no entorno, ergonomia)
3. Para investidores (foco em prestígio, m² valorizado, liquidez e potencial de rentabilidade)
4. Melhor custo-benefício (foco em eficiência de custo, gastos fixos reduzidos e conveniência)

Imóveis em Comparação:
${JSON.stringify(selectedProperties, null, 2)}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: "Gere o Veredito da IA comparativo detalhado para os imóveis fornecidos.",
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            verdicts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  icon: { type: Type.STRING },
                  winnerPropertyId: { type: Type.STRING },
                  reason: { type: Type.STRING },
                  badge: { type: Type.STRING }
                },
                required: ["title", "subtitle", "icon", "winnerPropertyId", "reason", "badge"]
              }
            }
          },
          required: ["verdicts"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");

    return new Response(
      JSON.stringify({
        success: true,
        isAI: true,
        verdicts: parsed.verdicts
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error in compare-verdict handler:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err?.message || "Erro ao gerar veredito da IA."
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
