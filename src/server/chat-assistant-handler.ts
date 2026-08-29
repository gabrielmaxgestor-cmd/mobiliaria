import { GoogleGenAI } from "@google/genai";
import { PROPERTIES_CATALOG } from "../lib/properties-db";
import { checkRateLimit, validatePromptLength } from "./rate-limiter";

export async function handleChatAssistant(request: Request): Promise<Response> {
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

    // 2. Validação do tamanho da mensagem/prompt do chat (máximo 500 caracteres)
    if (body.message !== undefined) {
      const messageValidation = validatePromptLength(body.message, 500);
      if (!messageValidation.valid) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "A mensagem excede o limite máximo permitido de 500 caracteres."
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    const userMessage = body.message || "Olá, pode me ajudar a encontrar um imóvel com bom investimento?";
    const history = Array.isArray(body.history) ? body.history.slice(-10) : [];

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          success: true,
          reply: `Olá! Sou a Inteligência Artificial da Living Canvas. Posso te apresentar nosso catálogo completo, tirar dúvidas sobre imóveis ou ajudar no agendamento de uma visita!`
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

    const systemInstruction = `Você é o Concierge Virtual e Especialista em Imóveis de Alto Padrão da Living Canvas.
Seu tom é extremamente cordial, sofisticado, elegante e prestativo.
Você conhece detalhadamente todos os imóveis do nosso portfólio:
${JSON.stringify(PROPERTIES_CATALOG, null, 2)}

Suas diretrizes:
- Responda em português claro, conciso e educado (máximo de 2 a 3 parágrafos curtos por resposta).
- Recomende imóveis específicos do catálogo quando o cliente descrever o que procura (cite o nome do imóvel, o bairro e o valor).
- Convide sempre o cliente para agendar uma visita presencial ou virtual se ele demonstrar interesse real.
- Tire dúvidas sobre financiamento, estilo de vida, orientação solar, isolamento acústico e vizinhança.`;

    const contents = history.map((h: { role: string; text: string }) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.text }]
    }));

    contents.push({
      role: "user",
      parts: [{ text: userMessage }]
    });

    const response = await ai.models.generateContent({
      model: "gemini-3.6-flash",
      contents,
      config: {
        systemInstruction,
        temperature: 0.7
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        reply: response.text || "Desculpe, não consegui entender no momento. Como posso ajudar com sua busca?"
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error in chat-assistant handler:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: "Não foi possível processar a mensagem no momento. Tente novamente mais tarde."
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
