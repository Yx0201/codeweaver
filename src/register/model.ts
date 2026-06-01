import { createOllama } from "ollama-ai-provider-v2";
import { OLLAMA_API_URL, TITLE_MODEL, CHAT_MODEL } from "@/lib/config";

const ollama = createOllama({ baseURL: OLLAMA_API_URL });

export const titleModel = ollama(TITLE_MODEL);
export const chatModel = ollama(CHAT_MODEL);

export default titleModel;
