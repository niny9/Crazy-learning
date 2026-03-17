import { DailyContent, WritingFeedback, VocabItem, ChatMessage } from "../types";

type AiAction =
  | "dailyListening"
  | "readingSuggestions"
  | "writingTopic"
  | "analyzeWriting"
  | "vocabContext"
  | "scenarioOpening"
  | "scenarioReply";

async function callAI<T>(action: AiAction, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, payload }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "AI request failed");
  }

  return response.json() as Promise<T>;
}

export const getDailyListeningContent = async (
  language: string,
  seenTitles: string[] = []
): Promise<DailyContent> => {
  try {
    return await callAI<DailyContent>("dailyListening", { language, seenTitles });
  } catch {
    return {
      title: "The Art of Learning",
      summary: "Tips on linguistic mastery.",
      url: "#",
      content: `Continuous immersion is the path to native-level fluency in ${language}. Try to spend 15 minutes today listening to natural speech.`,
      source: "LinguaFlow",
    };
  }
};

export const getReadingSuggestions = async (
  level: string,
  language: string
): Promise<DailyContent[]> => {
  try {
    return await callAI<DailyContent[]>("readingSuggestions", { level, language });
  } catch {
    return [];
  }
};

export const generateWritingTopic = async (language: string): Promise<string> => {
  const result = await callAI<{ topic: string }>("writingTopic", { language });
  return result.topic;
};

export const analyzeWriting = async (
  text: string,
  language: string
): Promise<WritingFeedback> => {
  return callAI<WritingFeedback>("analyzeWriting", { text, language });
};

export const generateVocabContext = async (
  word: string,
  language: string
): Promise<Pick<VocabItem, "definition" | "chineseDefinition" | "contextSentence">> => {
  return callAI<Pick<VocabItem, "definition" | "chineseDefinition" | "contextSentence">>(
    "vocabContext",
    { word, language }
  );
};

export const startScenarioConversation = async (
  language: string,
  scenarioPrompt: string,
  scenarioTitle: string
): Promise<{ reply: string }> => {
  return callAI<{ reply: string }>("scenarioOpening", {
    language,
    scenarioPrompt,
    scenarioTitle,
  });
};

export const continueScenarioConversation = async (
  language: string,
  scenarioPrompt: string,
  history: ChatMessage[]
): Promise<{ reply: string }> => {
  return callAI<{ reply: string }>("scenarioReply", {
    language,
    scenarioPrompt,
    history,
  });
};
