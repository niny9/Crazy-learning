import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL_NAME = process.env.ZHIPU_MODEL || 'glm-4-flash';
const DASHSCOPE_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const TTS_MODEL_NAME = process.env.TTS_MODEL || 'sambert-zhide-v1';

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function sendFile(res, filePath, contentType) {
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(res);
}

async function callZhipu(messages, wantsJson = false) {
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

function parseBinaryFrame(data) {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return Buffer.alloc(0);
}

async function synthesizeDashscopeSpeech(text, voice = TTS_MODEL_NAME) {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.TTS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing DASHSCOPE_API_KEY');
  }

  return new Promise((resolve, reject) => {
    const taskId = `linguaflow-${randomUUID()}`;
    const chunks = [];
    let settled = false;

    const ws = new WebSocket(DASHSCOPE_WS_URL, {
      headers: {
        Authorization: `bearer ${apiKey}`,
        'X-DashScope-DataInspection': 'disable',
      },
    });

    const finish = (handler, value) => {
      if (settled) return;
      settled = true;
      try {
        ws.close();
      } catch {
        // noop
      }
      handler(value);
    };

    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          header: {
            action: 'run-task',
            task_id: taskId,
            streaming: 'duplex',
          },
          payload: {
            task_group: 'audio',
            task: 'tts',
            function: 'SpeechSynthesizer',
            model: voice,
            parameters: {
              text,
              format: 'mp3',
              sample_rate: 48000,
            },
          },
        })
      );
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const buffer = parseBinaryFrame(data);
        if (buffer.length) chunks.push(buffer);
        return;
      }

      try {
        const message = JSON.parse(String(data));
        if (message.header?.event === 'task-failed') {
          finish(reject, new Error(message.header?.error_message || 'DashScope TTS failed'));
          return;
        }
        if (message.header?.event === 'task-finished') {
          finish(resolve, Buffer.concat(chunks));
        }
      } catch (error) {
        finish(reject, error);
      }
    });

    ws.on('error', (error) => finish(reject, error));
    ws.on('close', () => {
      if (!settled && chunks.length) {
        finish(resolve, Buffer.concat(chunks));
      } else if (!settled) {
        finish(reject, new Error('DashScope TTS connection closed unexpectedly'));
      }
    });
  });
}

function parseJson(value) {
  return JSON.parse(value);
}

function getHistory(payload) {
  const history = payload.history;
  return Array.isArray(history) ? history : [];
}

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

function sceneFallback(firstUtterance = '', currentContext = {}) {
  const utterance = firstUtterance.toLowerCase();
  let environmentTag = currentContext.environmentTag || 'home_desk';
  let intentTag = currentContext.intentTag;
  let objects = Array.isArray(currentContext.objects) ? currentContext.objects : ['laptop', 'desk', 'notebook'];
  let persona = currentContext.persona || 'friendly study buddy';

  if (utterance.includes('interview')) {
    intentTag = 'job_interview';
    persona = 'supportive mock interviewer';
  } else if (utterance.includes('coffee') || utterance.includes('order')) {
    intentTag = 'ordering';
    environmentTag = environmentTag === 'home_desk' ? 'cafe' : environmentTag;
    persona = 'friendly barista';
  } else if (utterance.includes('travel') || utterance.includes('airport') || utterance.includes('flight')) {
    intentTag = 'travel';
    environmentTag = 'airport';
    objects = ['suitcase', 'passport', 'boarding gate'];
    persona = 'helpful check-in staff';
  } else if (utterance.includes('ielts') || utterance.includes('exam')) {
    intentTag = 'exam_prep';
    persona = 'calm speaking coach';
  } else {
    intentTag = intentTag || 'casual_chat';
  }

  return {
    context: {
      objects,
      environmentTag,
      intentTag,
      timeOfDay: getTimeOfDay(),
      persona,
    },
    hint: {
      title: environmentTag === 'airport' ? 'Detected: ✈ Airport travel mode' : 'Detected: 🏠 Desk study',
      suggestions:
        environmentTag === 'airport'
          ? ['ask for directions', 'practice check-in questions', 'handle a delay politely']
          : ['talk about your desk', 'describe today’s tasks', 'share how you feel right now'],
    },
    opener:
      environmentTag === 'airport'
        ? 'Welcome to the airport. Tell me where you are flying today, and I will help you check in.'
        : 'Your desk setup looks ready. Tell me what is on your desk and what you want to get done today.',
    words:
      environmentTag === 'airport'
        ? [
            { word: 'boarding gate', meaning: 'the place where you enter the plane', chineseHint: '登机口', example: 'My boarding gate changed to Gate 18.' },
            { word: 'carry-on', meaning: 'a small bag you take onto the plane', chineseHint: '随身行李', example: 'I only brought one carry-on bag.' },
            { word: 'check in', meaning: 'to confirm your flight and get ready to board', chineseHint: '办理值机', example: 'I need to check in two hours before departure.' },
          ]
        : [
            { word: 'desk lamp', meaning: 'a light used on a desk', chineseHint: '台灯', example: 'My desk lamp helps me study at night.' },
            { word: 'planner', meaning: 'a notebook or app for organizing tasks', chineseHint: '计划本', example: 'I write my study goals in my planner.' },
            { word: 'focus', meaning: 'to give full attention to something', chineseHint: '专注', example: 'I want to focus on English for twenty minutes tonight.' },
          ],
  };
}

async function analyzeSceneWithVision({ language, imageBase64, firstUtterance, currentContext }) {
  if (!imageBase64) {
    return sceneFallback(firstUtterance, currentContext);
  }

  const content = await callZhipu(
    [
      {
        role: 'system',
        content: 'You are LinguaFlow scene intelligence. Analyze a learner photo plus their first utterance and return strict JSON only.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `The learner is studying ${language}. Analyze the scene from this camera snapshot and the first utterance. Return JSON with:
- context: { objects: string[], environmentTag: string, intentTag?: string, timeOfDay?: "morning" | "afternoon" | "evening", persona?: string }
- hint: { title: string, suggestions: string[] }
- opener: string
- words: Array<{ word: string, meaning: string, chineseHint?: string, example: string }>

Use low-pressure, Gen Z friendly English coaching. Favor practical situations like home desk, cafe, airport, office, kitchen, street.
First utterance: ${firstUtterance || 'No speech yet'}
Previous context: ${JSON.stringify(currentContext || {})}`,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageBase64,
            },
          },
        ],
      },
    ],
    true
  );

  const parsed = parseJson(content);
  return {
    context: {
      ...parsed.context,
      timeOfDay: parsed.context?.timeOfDay || getTimeOfDay(),
    },
    hint: parsed.hint,
    opener: parsed.opener,
    words: parsed.words,
  };
}

async function generateSpeakingTurn({ language, mode, context, hint, history, userUtterance }) {
  const content = await callZhipu(
    [
      {
        role: 'system',
        content: `You are LinguaFlow AI Coach. Stay inside the learner's real-world scene and persona.
Current scene context: ${JSON.stringify(context)}
Current hint block: ${JSON.stringify(hint)}

Rules:
- Be supportive, low-pressure, and concise.
- Sound like a person inside the scene, not a generic tutor.
- Keep each response suitable for 2-3 minute loops.
- Return strict JSON only.
- feedback.summary must be 1-2 short sentences.
- feedback.tags can include fluency, accuracy, vocabulary.
- suggestedSentence should be friendly and practical.
- If the user's utterance suggests a new intent, set intentUpdated.
`,
      },
      {
        role: 'user',
        content: `Mode: ${mode}
Latest user utterance: ${userUtterance}
Recent turns: ${JSON.stringify(history.slice(-8))}

Return JSON with:
- context
- hint
- reply
- feedback
- words (3 to 7 items if mode is "words", otherwise optional)
- nextPrompt
- intentUpdated`,
      },
    ],
    true
  );

  const parsed = parseJson(content);
  return {
    ...parsed,
    context: {
      ...context,
      ...parsed.context,
      timeOfDay: parsed.context?.timeOfDay || context.timeOfDay || getTimeOfDay(),
    },
  };
}

async function handleAiRequest(req, res) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
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
        return sendJson(res, 200, parseJson(content));
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
        return sendJson(res, 200, parseJson(content));
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
        return sendJson(res, 200, parseJson(content));
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
        return sendJson(res, 200, parseJson(content));
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
        return sendJson(res, 200, parseJson(content));
      }
      case 'sceneAnalyze': {
        const language = String(payload.language || 'English');
        const imageBase64 = payload.imageBase64 ? String(payload.imageBase64) : null;
        const firstUtterance = String(payload.firstUtterance || '');
        const currentContext = payload.currentContext && typeof payload.currentContext === 'object' ? payload.currentContext : {};
        const result = await analyzeSceneWithVision({
          language,
          imageBase64,
          firstUtterance,
          currentContext,
        });
        return sendJson(res, 200, result);
      }
      case 'speakingTurn': {
        const language = String(payload.language || 'English');
        const mode = String(payload.mode || 'sentences');
        const context = payload.context && typeof payload.context === 'object' ? payload.context : sceneFallback('', {}).context;
        const hint = payload.hint && typeof payload.hint === 'object' ? payload.hint : sceneFallback('', {}).hint;
        const history = getHistory(payload);
        const userUtterance = String(payload.userUtterance || '');
        const result = await generateSpeakingTurn({
          language,
          mode,
          context,
          hint,
          history,
          userUtterance,
        });
        return sendJson(res, 200, result);
      }
      default:
        return sendJson(res, 400, { error: 'Unsupported action' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return sendJson(res, 500, { error: message });
  }
}

async function handleTtsRequest(req, res) {
  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const text = String(body.text || '').trim();
    const voice = String(body.voice || TTS_MODEL_NAME).trim();

    if (!text) {
      return sendJson(res, 400, { error: 'Missing text for TTS' });
    }

    const audioBuffer = await synthesizeDashscopeSpeech(text, voice);
    return sendJson(res, 200, {
      audioBase64: audioBuffer.toString('base64'),
      mimeType: 'audio/mpeg',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown TTS error';
    return sendJson(res, 500, { error: message });
  }
}

function getContentType(filePath) {
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api/ai' && req.method === 'POST') {
    return handleAiRequest(req, res);
  }

  if (pathname === '/api/tts' && req.method === 'POST') {
    return handleTtsRequest(req, res);
  }

  if (!existsSync(distDir)) {
    return sendJson(res, 500, { error: 'Build output not found. Run npm run build first.' });
  }

  let filePath = path.join(distDir, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(distDir)) {
    return sendJson(res, 403, { error: 'Forbidden' });
  }

  if (existsSync(filePath) && !filePath.endsWith('/')) {
    return sendFile(res, filePath, getContentType(filePath));
  }

  try {
    const indexPath = path.join(distDir, 'index.html');
    const html = await readFile(indexPath, 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  } catch {
    sendJson(res, 404, { error: 'Not found' });
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => {
  console.log(`LinguaFlow server listening on ${port}`);
});
