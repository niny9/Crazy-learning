
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { DailyContent, WritingFeedback, VideoContent, ChatMessage, SpeakingReport } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// --- Video Understanding ---

export const analyzeVideo = async (videoBase64: string, mimeType: string, language: string): Promise<VideoContent> => {
  try {
    const prompt = `
      Analyze this video for a student learning ${language}.
      1. Generate a word-for-word transcript of the speech (in ${language}).
      2. Summarize the main topic (in English).
      3. List 3 key learning points (vocabulary or cultural nuances specific to ${language}).
      Return JSON.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            { inlineData: { mimeType: mimeType, data: videoBase64 } }
          ]
        }
      ],
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

    const data = JSON.parse(response.text || "{}");
    return {
      transcript: data.transcript || "Could not generate transcript.",
      summary: data.summary || "No summary available.",
      keyPoints: data.keyPoints || []
    };
  } catch (e) {
    console.error("Video analysis failed", e);
    throw new Error("Failed to analyze video. Please ensure it is a supported format and not too large.");
  }
};

// --- Grounding / Search ---

export const getDailyListeningContent = async (language: string): Promise<DailyContent> => {
  try {
    // Targeted search for TED talks
    const prompt = `Using Google Search, find a recent or popular TED Talk (ted.com) that has a transcript or clear speech suitable for learning ${language}.
    
    The content MUST be related to ${language} or spoken in ${language} if possible. If the language is not English, look for TED talks given in ${language} or with ${language} transcripts.
    
    I need the *actual transcript text* for reading/listening practice.
    
    Return JSON with:
    - title
    - summary (brief, in English)
    - url (Must be a ted.com link)
    - content (A significant excerpt of the transcript, at least 200 words)
    `;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            summary: { type: Type.STRING },
            url: { type: Type.STRING },
            content: { type: Type.STRING },
          },
          required: ["title", "summary", "url", "content"]
        }
      }
    });

    const data = JSON.parse(response.text || "{}");
    
    // Fallback if search fails to return good content, but usually grounding works
    if (!data.content || data.content.length < 50) throw new Error("Content too short");
    
    return {
      title: data.title || `TED Talk: ${language} Practice`,
      summary: data.summary || "Learn with this inspiring talk.",
      url: data.url || "https://www.ted.com",
      content: data.content,
      source: 'TED'
    };
  } catch (e) {
    console.error("Search failed", e);
    return {
      title: "TED Ideas (Offline Mode)",
      summary: "We couldn't fetch the latest talk. Here is a classic thought on language.",
      url: "https://www.ted.com",
      content: `Language is not just a tool for communication; it is a vehicle for culture. When you learn ${language}, you are not just learning words, you are learning a new way to see the world. TED talks provide a window into these new perspectives.`,
      source: 'TED'
    };
  }
};

export const getReadingSuggestions = async (level: string, language: string): Promise<DailyContent[]> => {
  try {
    const prompt = `Find 3 distinct reading materials (short stories, book chapters, or articles) suitable for ${level} level ${language} learners.
    
    You MUST search and source specifically from these websites:
    1. Library Genesis
    2. Project Gutenberg (gutenberg.org)
    3. Planet eBook (planetebook.com)
    4. ebookee
    5. Read Easily
    6. Bookfi
    7. Wikibooks (wikibooks.org)
    8. BookYards (bookyards.com)
    9. Get Free e-Books (getfreeebooks.com)
    10. The Online Books Page (digital.library.upenn.edu)
    
    Do not search general news sites. Look for classic literature, textbooks, or essays available on these platforms.
    
    Return JSON array. 'content' must contain a 150-word excerpt in ${language}. 'source' should be the name of the website (e.g., "Project Gutenberg").`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              summary: { type: Type.STRING },
              url: { type: Type.STRING },
              content: { type: Type.STRING },
              source: { type: Type.STRING }
            }
          }
        }
      }
    });
    
    const data = JSON.parse(response.text || "[]");
    return data.map((d: any) => ({ 
      ...d, 
      source: d.source || 'E-Book Library' 
    }));
  } catch (e) {
    return [
      {
        title: "Project Gutenberg: Classic Reading",
        summary: "Access over 70,000 free eBooks.",
        url: "https://www.gutenberg.org/",
        content: `Project Gutenberg is a library of over 70,000 free eBooks. Choose among free epub and Kindle eBooks, download them or read them online. You will find the world's great literature here, with focus on older works for which U.S. copyright has expired.`,
        source: 'Project Gutenberg'
      },
      {
        title: "Wikibooks: Open Textbooks",
        summary: "The open-content textbooks collection.",
        url: "https://en.wikibooks.org/",
        content: `Wikibooks is a Wikimedia project for creating a free content e-textbook library that anyone can edit. It contains textbooks, annotated texts, instructional guides, and manuals.`,
        source: 'Wikibooks'
      }
    ];
  }
};

// --- Speaking & Audio ---

export const analyzePronunciation = async (targetText: string, audioBase64: string, language: string): Promise<string> => {
  const prompt = `
    I am learning ${language}.
    I am reading this text: "${targetText}". 
    Listen to my audio. 
    1. Transcribe what I said (in ${language}).
    2. Compare it to the target text.
    3. Give me specific feedback on my pronunciation, intonation, and accent in ${language}.
    4. Score my accuracy out of 100.
    Keep it concise and encouraging.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'audio/wav', data: audioBase64 } } 
        ]
      }
    ]
  });

  return response.text || "Could not analyze audio.";
};

export const generateSpeech = async (text: string, language: string): Promise<string> => {
    // Using Gemini TTS for high quality, mature female voice (Kore)
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
      },
    });
    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("No audio generated");
    return base64Audio;
};

// --- Chat & Scenario ---

export const startImageScenario = async (imageBase64: string, language: string): Promise<string> => {
  const prompt = `
    Act as my close friend who speaks ${language} fluently calling me on the phone/FaceTime.
    I just sent you this photo. 
    1. React to the photo immediately with enthusiasm or curiosity, as a friend would, in ${language}.
    2. Start the conversation naturally. Do NOT act like a teacher. Be casual.
    3. Ask a question to get me talking.
    
    Keep your response short (1-2 sentences) so we can have a back-and-forth conversation.
  `;
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: [
      { role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }] }
    ]
  });
  return response.text || "Wow! That looks amazing!";
};

export const chatWithAudioOrText = async (
  history: ChatMessage[],
  language: string,
  audioBase64?: string,
  textInput?: string
): Promise<string> => {
  const contents = [
    { role: 'user', parts: [{ text: `You are my close friend on a phone call speaking ${language}. Keep responses short, casual, and spoken-style. Do not lecture. Just chat.` }] },
    ...history.map(msg => ({ role: msg.role, parts: [{ text: msg.text }] }))
  ];

  const parts: any[] = [];
  if (textInput) parts.push({ text: textInput });
  if (audioBase64) parts.push({ inlineData: { mimeType: 'audio/wav', data: audioBase64 } });

  contents.push({ role: 'user', parts });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: contents as any,
  });

  return response.text || "I didn't catch that.";
};

export const generateSpeakingReport = async (history: ChatMessage[], language: string): Promise<SpeakingReport> => {
  const conversationText = history.map(m => `${m.role}: ${m.text}`).join('\n');
  const prompt = `
    Analyze this ${language} conversation session between a learner and an AI friend.
    Conversation Log:
    ${conversationText}

    Generate a comprehensive student report JSON with these exact dimensions:
    1. "feedback": A summary of the session performance + Pronunciation/Intonation check (Did they sound natural in ${language}?).
    2. "improvements": Specific tips on Grammar errors found and Pronunciation corrections.
    3. "betterResponses": Pick 3 specific user turns and rewrite them to be "Native Speaker Level" (C1/C2) or more idiomatic in ${language}. Provide a brief "explanation" for why the new version is better (e.g., "More polite," "Idiomatic expression").
    4. "vocabulary": Extract 3-5 useful words/idioms relevant to this specific photo/topic in ${language}.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          feedback: { type: Type.STRING },
          improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
          betterResponses: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                original: { type: Type.STRING },
                improved: { type: Type.STRING },
                explanation: { type: Type.STRING }
              }
            }
          },
          vocabulary: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                definition: { type: Type.STRING }
              }
            }
          }
        }
      }
    }
  });

  return JSON.parse(response.text || "{}");
};

// --- Writing ---

export const generateWritingTopic = async (language: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Generate a thought-provoking writing topic for a student learning ${language}. Just the topic in ${language}.`,
  });
  return response.text?.trim() || "Describe a memorable journey you have taken.";
};

export const analyzeWriting = async (text: string, language: string): Promise<WritingFeedback> => {
  const prompt = `
    Analyze this writing entry in ${language}:
    "${text}"

    Provide a JSON response with:
    1. "corrected": The text with grammar errors fixed (in ${language}).
    2. "upgraded": A version rewritten using high-level vocabulary and native sentence structures (in ${language}).
    3. "modelEssay": A short model paragraph/essay (150 words) on the same topic (in ${language}).
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          corrected: { type: Type.STRING },
          upgraded: { type: Type.STRING },
          modelEssay: { type: Type.STRING }
        },
        required: ["corrected", "upgraded", "modelEssay"]
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  return {
    original: text,
    corrected: data.corrected || "Error",
    upgraded: data.upgraded || "Error",
    modelEssay: data.modelEssay || "Error"
  };
};

// --- Vocab & Enhanced Learning ---

export const generateVocabContext = async (word: string, language: string): Promise<{definition: string, chineseDefinition: string, sentence: string}> => {
  const prompt = `Define the ${language} word "${word}" for a Chinese learner. 
  Provide JSON with:
  1. definition: Definition in ${language}.
  2. chineseDefinition: Chinese translation and brief definition.
  3. sentence: A memorable, sophisticated context sentence in ${language}.`;
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { 
        responseMimeType: "application/json",
        responseSchema: {
            type: Type.OBJECT,
            properties: {
                definition: { type: Type.STRING },
                chineseDefinition: { type: Type.STRING },
                sentence: { type: Type.STRING }
            }
        }
    }
  });
  return JSON.parse(response.text || "{}");
};

export const generateVocabImage = async (word: string): Promise<string | undefined> => {
  try {
    const styles = ['minimalist illustration', 'oil painting', 'cyberpunk digital art', 'pencil sketch', 'abstract concept'];
    const randomStyle = styles[Math.floor(Math.random() * styles.length)];
    const response = await ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt: `${randomStyle} of the concept: ${word}`,
      config: { numberOfImages: 1, outputMimeType: 'image/jpeg' }
    });
    const base64 = response.generatedImages?.[0]?.image?.imageBytes;
    return base64 ? `data:image/jpeg;base64,${base64}` : undefined;
  } catch (e) { return undefined; }
};

export const generateVocabStory = async (words: string[], language: string): Promise<string> => {
  const wordsList = words.join(", ");
  const prompt = `
    Create a creative, coherent short story (approx 150 words) in ${language} that naturally incorporates ALL of the following words:
    [${wordsList}]
    
    Highlight the used words by surrounding them with asterisks (e.g., *word*).
    The story should be fun and memorable to help learn these words.
  `;
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  return response.text || "Could not generate story.";
};

export const chatAboutWord = async (word: string, history: ChatMessage[], userMessage: string, language: string): Promise<string> => {
  const prompt = `
    You are a helpful ${language} tutor assistant dedicated to teaching the word: "${word}".
    Answer the student's question about this specific word (e.g., usage, synonyms, pronunciation tips, idioms).
    Keep answers helpful but concise.
  `;
  
  const chatHistory = history.map(h => ({ role: h.role, parts: [{ text: h.text }] }));
  
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [
      { role: 'user', parts: [{ text: prompt }] },
      ...chatHistory,
      { role: 'user', parts: [{ text: userMessage }] }
    ]
  });

  return response.text || "I can help you with this word.";
};

// --- Sentence Deep Dive ---

export const analyzeSentenceDeepDive = async (sentence: string, language: string): Promise<{ scenario: string, advancedVersion: string }> => {
    const prompt = `Analyze this ${language} sentence: "${sentence}"
    1. Describe the specific social context/scenario where this is used (Explain in Chinese).
    2. Provide a more advanced, native, or idiomatic version of this sentence (in ${language}).
    Return JSON.`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    scenario: { type: Type.STRING },
                    advancedVersion: { type: Type.STRING }
                }
            }
        }
    });
    return JSON.parse(response.text || "{}");
};

export const assessSentenceRecitation = async (originalSentence: string, userAudioBase64: string, language: string): Promise<string> => {
    const prompt = `
      I am reciting this ${language} sentence: "${originalSentence}".
      Listen to my recording.
      1. Did I say it correctly?
      2. Give me specific feedback on intonation and stress to sound more like a native ${language} speaker.
      3. Rate my closeness to a native speaker (0-100).
    `;
    
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
            { role: 'user', parts: [
                { text: prompt },
                { inlineData: { mimeType: 'audio/wav', data: userAudioBase64 } }
            ]}
        ]
    });
    return response.text || "Feedback unavailable.";
};