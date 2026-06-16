import { ZENMUX_BASE_URL, ZENMUX_API_KEY, EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "./config";

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

async function fetchEmbeddings(input: string | string[]): Promise<number[][]> {
  const response = await fetch(`${ZENMUX_BASE_URL}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ZENMUX_API_KEY}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input,
      dimensions: EMBEDDING_DIMENSIONS,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Embedding request failed: ${response.status} ${response.statusText} ${body.slice(0, 200)}`
    );
  }

  const data: OpenAIEmbeddingResponse = await response.json();
  // OpenAI format: data[].embedding, sorted by index
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const embeddings = await fetchEmbeddings(text);
  return embeddings[0];
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return fetchEmbeddings(texts);
}
