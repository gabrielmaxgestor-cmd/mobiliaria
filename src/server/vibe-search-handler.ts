import { GoogleGenAI, Type } from "@google/genai";
import { PROPERTIES_CATALOG } from "../lib/properties-db";
import { checkRateLimit, validatePromptLength } from "./rate-limiter";

export async function handleVibeSearch(request: Request): Promise<Response> {
  try {
    // 1. Rate Limiting por IP (10 requisições por 60 segundos)
    const rateCheck = checkRateLimit(request, 10, 60_000);
    if (!rateCheck.allowed) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Muitas requisições. Tente novamente em instantes."
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    const body = await request.json().catch(() => ({}));

    // 2. Validação do tamanho do prompt (máximo 500 caracteres)
    if (body.prompt !== undefined) {
      const promptValidation = validatePromptLength(body.prompt, 500);
      if (!promptValidation.valid) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "O texto da busca excede o limite máximo permitido de 500 caracteres."
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const prompt = body.prompt || "Quero um lugar tranquilo com muita luz natural, home office e cafés próximos";

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: true,
          isAI: false,
          message: "Minha inteligência artificial está operando em modo demonstrativo.",
          extractedPriorities: [
            { name: "Silêncio", confidence: "95%" },
            { name: "Luz natural", confidence: "92%" },
            { name: "Home office", confidence: "88%" },
            { name: "Pet-friendly", confidence: "90%" },
            { name: "Áreas verdes", confidence: "94%" },
            { name: "Cafés próximos", confidence: "85%" }
          ],
          appliedFilters: {
            noiseLevel: "Silencioso",
            sunOrientation: "Norte / Leste",
            parksDistance: "Até 800m",
            walkability: "Alto (85+)",
            homeOfficeSpace: "Sim"
          },
          aiSummary: `Analisamos sua busca por "${prompt}" e selecionamos os imóveis com melhor alinhamento de estilo de vida, iluminação e localização.`,
          matches: PROPERTIES_CATALOG.map((p, idx) => ({
            propertyId: p.id,
            matchPercentage: 98 - idx * 4,
            vibeMatchReason: `${p.title} é ideal para a sua busca por ${p.vibeTags.join(", ")} no bairro ${p.neighborhood}.`,
            property: p
          }))
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

    const systemInstruction = `Você é o motor de Inteligência Artificial de Vibe Match da imobiliária Living Canvas.
Sua missão é interpretar a busca em linguagem natural do usuário (que descreve o estilo de vida, atmosfera e preferências desejadas) e analisar o catálogo de imóveis disponíveis para ranqueá-los por compatibilidade de 'vibe' (0 a 100%).

Catálogo de Imóveis:
${JSON.stringify(PROPERTIES_CATALOG, null, 2)}

Sua resposta DEVE ser estritamente em formato JSON contendo:
- extractedPriorities: Lista de até 6 prioridades identificadas no texto do usuário, cada uma com nome e porcentagem de confiança (ex: "95%").
- appliedFilters: Objeto com filtros inferidos automaticamente (noiseLevel, sunOrientation, parksDistance, walkability, homeOfficeSpace).
- aiSummary: Um parágrafo empático e sofisticado explicando como a IA interpretou o desejo de moradia do usuário.
- matches: Array de objetos para cada imóvel do catálogo, ordenados do maior match para o menor, contendo:
  - propertyId: id do imóvel no catálogo
  - matchPercentage: número de 50 a 99
  - vibeMatchReason: 1 frase explicativa justificando o porquê este imóvel combina especificamente com a busca dele.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents: `Analise o pedido do usuário e faça o Vibe Match com os imóveis:\n"${prompt}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            extractedPriorities: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  confidence: { type: Type.STRING }
                },
                required: ["name", "confidence"]
              }
            },
            appliedFilters: {
              type: Type.OBJECT,
              properties: {
                noiseLevel: { type: Type.STRING },
                sunOrientation: { type: Type.STRING },
                parksDistance: { type: Type.STRING },
                walkability: { type: Type.STRING },
                homeOfficeSpace: { type: Type.STRING }
              }
            },
            aiSummary: { type: Type.STRING },
            matches: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  propertyId: { type: Type.STRING },
                  matchPercentage: { type: Type.NUMBER },
                  vibeMatchReason: { type: Type.STRING }
                },
                required: ["propertyId", "matchPercentage", "vibeMatchReason"]
              }
            }
          },
          required: ["extractedPriorities", "appliedFilters", "aiSummary", "matches"]
        }
      }
    });

    const parsedData = JSON.parse(response.text || "{}");

    const fullMatches = (parsedData.matches || []).map((m: any) => {
      const found = PROPERTIES_CATALOG.find((p) => p.id === m.propertyId) || PROPERTIES_CATALOG[0];
      return {
        ...m,
        property: found
      };
    });

    return new Response(
      JSON.stringify({
        success: true,
        isAI: true,
        extractedPriorities: parsedData.extractedPriorities,
        appliedFilters: parsedData.appliedFilters,
        aiSummary: parsedData.aiSummary,
        matches: fullMatches
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error in vibe-search handler:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Não foi possível processar a busca por IA no momento. Tente novamente mais tarde."
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
