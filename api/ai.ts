type RequestBody = {
  action?: string;
  payload?: Record<string, unknown>;
};

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL_NAME = process.env.ZHIPU_MODEL || 'glm-4-flash';

async function callZhipu(messages: Array<{ role: string; content: string }>, wantsJson = false) {
  const apiKey = process.env.ZHIPU_API_KEY;

  if (!apiKey) {
    throw new Error('Missing ZHIPU_API_KEY');
  }

  const response = await fetch(ZHIPU_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages,
      temperature: 0.7,
      response_format: wantsJson ? { type: 'json_object' } : undefined,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Zhipu API error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;

  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Empty response from Zhipu');
  }

  return content;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function getHistory(payload: Record<string, unknown>) {
  const history = payload.history;
  return Array.isArray(history) ? history : [];
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = (req.body || {}) as RequestBody;
    const action = body.action;
    const payload = body.payload || {};

    switch (action) {
      case 'dailyListening': {
        const language = String(payload.language || 'English');
        const seenTitles = Array.isArray(payload.seenTitles) ? payload.seenTitles.join(', ') : '';
        const content = await callZhipu(
          [
            {
              role: 'system',
              content: 'You are an experienced language coach. Always return strict JSON only.',
            },
            {
              role: 'user',
              content: `Find an educational, news, or TED Talk style listening practice item in ${language} suitable for intermediate-advanced learners. Avoid topics similar to: ${seenTitles || 'none'}. Return JSON with: title, summary, url, content, source. The content field should be a learner-friendly transcript or excerpt around 250-400 words.`,
            },
          ],
          true
        );

        return res.status(200).json(parseJson(content));
      }
      case 'readingSuggestions': {
        const language = String(payload.language || 'English');
        const level = String(payload.level || 'Intermediate');
        const content = await callZhipu(
          [
            {
              role: 'system',
              content: 'You are an experienced language coach. Always return strict JSON only.',
            },
            {
              role: 'user',
              content: `Provide a JSON array with exactly one reading suggestion in ${language} for ${level} learners. Each item must include title, source, url, summary, and content. The content should be an original short article or adapted passage around 250-350 words.`,
            },
          ],
          true
        );

        return res.status(200).json(parseJson(content));
      }
      case 'writingTopic': {
        const language = String(payload.language || 'English');
        const content = await callZhipu(
          [
            {
              role: 'system',
              content: 'You create concise, creative writing prompts for language learners. Return strict JSON only.',
            },
            {
              role: 'user',
              content: `Give one thought-provoking writing prompt for an advanced student learning ${language}. Return JSON with a single field named topic.`,
            },
          ],
          true
        );

        return res.status(200).json(parseJson(content));
      }
      case 'analyzeWriting': {
        const language = String(payload.language || 'English');
        const text = String(payload.text || '');
        const content = await callZhipu(
          [
            {
              role: 'system',
              content: 'You are a supportive language writing tutor. Return strict JSON only.',
            },
            {
              role: 'user',
              content: `Review this student's ${language} writing:\n\n${text}\n\nReturn JSON with these fields: original, corrected, upgraded, modelEssay. corrected should sound natural, upgraded should use richer vocabulary, and modelEssay should be a short high-quality reference response on the same theme.`,
            },
          ],
          true
        );

        return res.status(200).json(parseJson(content));
      }
      case 'vocabContext': {
        const language = String(payload.language || 'English');
        const word = String(payload.word || '');
        const content = await callZhipu(
          [
            {
              role: 'system',
              content: 'You are a vocabulary tutor for Chinese-speaking learners. Return strict JSON only.',
            },
            {
              role: 'user',
              content: `Define "${word}" for a student learning ${language}. Return JSON with definition, chineseDefinition, and contextSentence. Keep the context sentence natural and advanced.`,
            },
          ],
          true
        );

        return res.status(200).json(parseJson(content));
      }
      case 'scenarioOpening': {
        const language = String(payload.language || 'English');
        const scenarioTitle = String(payload.scenarioTitle || 'Speaking Practice');
        const scenarioPrompt = String(payload.scenarioPrompt || '');
        const reply = await callZhipu([
          {
            role: 'system',
            content: `You are a patient ${language} speaking coach running a roleplay session. ${scenarioPrompt} Keep replies short, conversational, and encouraging. Correct mistakes gently after responding. Start the roleplay immediately.`,
          },
          {
            role: 'user',
            content: `Begin the ${scenarioTitle} scenario now.`,
          },
        ]);

        return res.status(200).json({ reply });
      }
      case 'scenarioReply': {
        const language = String(payload.language || 'English');
        const scenarioPrompt = String(payload.scenarioPrompt || '');
        const history = getHistory(payload) as Array<{ role?: string; text?: string }>;
        const messages = [
          {
            role: 'system',
            content: `You are a patient ${language} speaking coach running a roleplay session. ${scenarioPrompt} Keep replies short, conversational, and encouraging. If the learner makes a mistake, include a gentle correction naturally in your reply.`,
          },
          ...history
            .filter((message) => message && (message.role === 'user' || message.role === 'model'))
            .map((message) => ({
              role: message.role === 'model' ? 'assistant' : 'user',
              content: String(message.text || ''),
            })),
        ];
        const reply = await callZhipu(messages);

        return res.status(200).json({ reply });
      }
      default:
        return res.status(400).json({ error: 'Unsupported action' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({ error: message });
  }
}
