import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { ZENMUX_BASE_URL, ZENMUX_API_KEY, TITLE_MODEL, CHAT_MODEL } from "@/lib/config";

const zenmux = createOpenAICompatible({
  name: "zenmux",
  baseURL: ZENMUX_BASE_URL,
  apiKey: ZENMUX_API_KEY,
});

export const titleModel = zenmux(TITLE_MODEL);
export const chatModel = zenmux(CHAT_MODEL);

export default titleModel;
