const OLLAMA_BASE_URL =
  process.env.LOCAL_MODEL_BASE_URL ?? "http://localhost:11434/api";

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "bge-m3:latest", input: text }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.embeddings[0];
}

export async function generateEmbeddings(
  texts: string[]
): Promise<number[][]> {
  const response = await fetch(`${OLLAMA_BASE_URL}/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "bge-m3:latest", input: texts }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: ${response.statusText}`);
  }

  const data = await response.json();
  return data.embeddings;
}
