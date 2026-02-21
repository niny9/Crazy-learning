
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DailyContent, WritingFeedback, VideoContent, ChatMessage } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const analyzeUploadedFile = async (base64: string, mimeType: string, language: string): Promise<VideoContent> => {
  try {
    const prompt = `
      Analyze this ${mimeType.startsWith('video') ? 'video' : 'audio'} file for an advanced student learning ${language}.
      1. Provide a verbatim transcript in ${language}.
      2. Summarize the pedagogical value and main points.
      3. Extract 5 complex idioms or phrases and explain them for a native Chinese speaker.
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
    const prompt = `Find an educational, news, or TED Talk style content in ${language} suitable for intermediate-advanced learners. 
    Language: ${language}. 
    Exclude previously seen topics like: [${seenTitles.join(", ")}].
    Target interest: Global culture, technology, or personal growth.
    Return JSON with title, summary, url, and the full transcript text (approx 400 words) in 'content' field.
    `;
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }], responseMimeType: "application/json" }
    });
    const data = JSON.parse(response.text || "{}");
    return { 
      title: data.title || "Daily Inspiration", 
      summary: data.summary || "A curated piece of content for your daily practice.", 
      url: data.url || "#", 
      content: data.content || "Content synchronizing...", 
      source: data.source || 'Global Web' 
    };
  } catch (e) {
    return { title: "The Art of Learning", summary: "Tips on linguistic mastery.", url: "#", content: `Continuous immersion is the path to native-level fluency in ${language}. Try to spend 15 minutes today listening to natural speech.`, source: 'LinguaFlow' };
  }
};

export const getReadingSuggestions = async (level: string, language: string): Promise<DailyContent[]> => {
  try {
    const prompt = `Find a high-quality short article or essay in ${language} (Academic/Literary Level: ${level}). 
    Return a JSON array with one object containing 'title', 'source', and 'content' (approx 300 words).`;
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
    contents: `Give me a creative, thought-provoking writing prompt for an advanced student learning ${language}. The topic should be something that requires critical thinking or cultural reflection.`,
  });
  return response.text?.trim() || "Describe a cultural misunderstanding you've experienced and what it taught you.";
};

export const analyzeWriting = async (text: string, language: string): Promise<WritingFeedback> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: `Review this student's ${language} writing: "${text}". 
    Provide:
    1. A 'corrected' version that sounds natural.
    2. An 'upgraded' version with sophisticated vocabulary.
    3. A brief 'modelEssay' on the same topic for reference.
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
    contents: `Define "${word}" in the context of learning ${language}. Provide:
    - English definition
    - Accurate Chinese definition
    - A natural, high-level context sentence in ${language}.
    Format: JSON.`,
    config: { responseMimeType: "application/json" }
  });
  return JSON.parse(response.text || "{}");
};
