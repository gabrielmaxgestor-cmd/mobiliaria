import { matchAndNotifyProperty } from "./property-matcher";

export async function handleMatchProperties(request: Request): Promise<Response> {
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido. Use POST." }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = (await request.json()) as {
      imovelId?: string;
      propertyData?: any;
    };

    if (!body.imovelId) {
      return new Response(
        JSON.stringify({ error: "Parâmetro 'imovelId' é obrigatório." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const result = await matchAndNotifyProperty(body.imovelId, body.propertyData);

    return new Response(JSON.stringify(result), {
      status: result.success ? 200 : 500,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno do servidor." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
