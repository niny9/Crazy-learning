import {
  DailyContent,
  WritingFeedback,
  VocabItem,
  ChatMessage,
  SceneContext,
  SceneHint,
  SpeakingTurnPayload,
} from "../types";

type AiAction =
  | "dailyListening"
  | "readingSuggestions"
  | "writingTopic"
  | "analyzeWriting"
  | "vocabContext"
  | "sceneAnalyze"
  | "speakingTurn";

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

export const analyzeSceneContext = async (
  language: string,
  imageBase64: string | null,
  firstUtterance: string,
  currentContext?: SceneContext
): Promise<{ context: SceneContext; hint: SceneHint; opener: string; words: SpeakingTurnPayload["words"] }> => {
  return callAI<{ context: SceneContext; hint: SceneHint; opener: string; words: SpeakingTurnPayload["words"] }>(
    "sceneAnalyze",
    {
      language,
      imageBase64,
      firstUtterance,
      currentContext,
    }
  );
};

export const sendSpeakingTurn = async (
  language: string,
  mode: "words" | "sentences",
  context: SceneContext,
  hint: SceneHint,
  history: ChatMessage[],
  userUtterance: string
): Promise<SpeakingTurnPayload> => {
  return callAI<SpeakingTurnPayload>("speakingTurn", {
    language,
    mode,
    context,
    hint,
    history,
    userUtterance,
  });
};
