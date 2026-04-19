import {
  CustomContentSource,
  DailyContent,
  FreeTalkMessage,
  FreeTalkReply,
  WritingFeedback,
  VocabItem,
  TodayStoryMode,
  TodayStoryResult,
} from "../types";

type AiAction =
  | "dailyListening"
  | "readingSuggestions"
  | "writingTopic"
  | "analyzeWriting"
  | "todayStory"
  | "freeTalk"
  | "vocabContext";

export const synthesizeSpeech = async (
  text: string,
  voice = "sambert-eva-v1"
): Promise<{ audioBase64: string; mimeType: string }> => {
  const response = await fetch("/api/tts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text, voice }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || "TTS request failed");
  }

  return response.json() as Promise<{ audioBase64: string; mimeType: string }>;
};

export const transcribeSpeech = async (
  audioBase64: string,
  sampleRate: number,
  language: string
): Promise<{ transcript: string }> => {
  const response = await fetch("/api/asr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ audioBase64, sampleRate, language }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    try {
      const parsed = JSON.parse(errorText);
      throw new Error(parsed?.error || parsed?.message || "ASR request failed");
    } catch {
      throw new Error(errorText || "ASR request failed");
    }
  }

  return response.json() as Promise<{ transcript: string }>;
};

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
  seenTitles: string[] = [],
  customSources: CustomContentSource[] = [],
  excludeUrls: string[] = []
): Promise<DailyContent> => {
  try {
    return await callAI<DailyContent>("dailyListening", { language, seenTitles, customSources, excludeUrls });
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
  language: string,
  customSources: CustomContentSource[] = [],
  seenTitles: string[] = [],
  excludeUrls: string[] = []
): Promise<DailyContent[]> => {
  try {
    return await callAI<DailyContent[]>("readingSuggestions", { level, language, customSources, seenTitles, excludeUrls });
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

export const generateTodayStory = async (
  transcript: string,
  mode: TodayStoryMode,
  language: string
): Promise<TodayStoryResult> => {
  return callAI<TodayStoryResult>("todayStory", { transcript, mode, language });
};

export const generateFreeTalkReply = async (
  language: string,
  history: FreeTalkMessage[],
  userMessage: string
): Promise<FreeTalkReply> => {
  return callAI<FreeTalkReply>("freeTalk", { language, history, userMessage });
};

export const generateVocabContext = async (
  word: string,
  language: string
): Promise<Pick<VocabItem, "definition" | "chineseDefinition" | "contextSentence" | "contextSentenceZh">> => {
  return callAI<Pick<VocabItem, "definition" | "chineseDefinition" | "contextSentence" | "contextSentenceZh">>(
    "vocabContext",
    { word, language }
  );
};
