import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DailyContent, WritingFeedback, VideoContent, ChatMessage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeUploadedFile = async (base64: string, mimeType: string, language: string): Promise<VideoContent> => {
  try {
    const prompt = `
      Analyze this ${mimeType.startsWith('video') ? 'video' : 'audio'} file for a student learning ${language}.
      1. Provide a transcript in ${language}.
      2. Summarize the main message in ${language}.
      3. Identify 5 advanced vocabulary words or phrases and define them for a native Chinese speaker.
      Return JSON.
    `;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: mimeType, data: base64 } }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING },
            summary: { type: Type.STRING },
            keyPoints: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["transcript", "summary", "keyPoints"]
        }
      }
    });
    return JSON.parse(response.text || "{}");
  } catch (e) { throw new Error("Analysis failed."); }
};

export const getDailyListeningContent = async (language: string, seenTitles: string[] = []): Promise<DailyContent> => {
  try {
    const prompt = `Search for a high-quality ${language} podcast excerpt or TED Talk transcript for learners.
    Target language: ${language}. 
    Exclude these: [${seenTitles.join(", ")}].
    Return JSON with title, summary, url, and a 300-word transcript content in ${language}.
    IMPORTANT: The 'content' field must be in ${language}.
    `;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
    });
    const data = JSON.parse(response.text || "{}");
    return { title: data.title, summary: data.summary, url: data.url, content: data.content, source: 'TED / Web' };
  } catch (e) {
    return { title: "Language Learning Tips", summary: "A default guide to learning.", url: "#", content: `Consistency is the key to mastering ${language}.`, source: 'LinguaFlow' };
  }
};

export const getReadingSuggestions = async (level: string, language: string): Promise<DailyContent[]> => {
  try {
    const prompt = `Find a high-quality short story or article in ${language} (Level: ${level}).
    Return a JSON array where 'content' is approximately 250 words in ${language}.`;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
    });
    return JSON.parse(response.text || "[]");
  } catch (e) { return []; }
};

export const generateWritingTopic = async (language: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Suggest a creative writing prompt for a ${language} learner. The prompt itself should be in English but the topic should be relevant for ${language} culture.`,
  });
  return response.text?.trim() || "What are your dreams for the future?";
};

export const analyzeWriting = async (text: string, language: string): Promise<WritingFeedback> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Analyze this ${language} text: "${text}". 
    1. Corrected version (natural but simple).
    2. Pro version (advanced vocabulary in ${language}).
    3. A model essay on the same topic in ${language}.
    Return JSON.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          corrected: { type: Type.STRING },
          upgraded: { type: Type.STRING },
          modelEssay: { type: Type.STRING }
        }
      }
    }
  });
  return JSON.parse(response.text || "{}");
};

export const generateVocabContext = async (word: string, language: string): Promise<{definition: string, chineseDefinition: string, sentence: string}> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Define "${word}" (${language}). Provide definition (in English), Chinese definition, and a natural context sentence in ${language}. JSON format.`,
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(response.text || "{}");
};
