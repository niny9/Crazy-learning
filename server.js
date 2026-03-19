import { createServer } from 'node:http';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL_NAME = process.env.ZHIPU_MODEL || 'glm-4-flash';
const DASHSCOPE_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference';
const TTS_MODEL_NAME = process.env.TTS_MODEL || 'sambert-zhide-v1';
const ASR_MODEL_NAME = process.env.ASR_MODEL || 'paraformer-v2';
const DASHSCOPE_ASR_URL = 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription';
const uploadDir = path.join(os.tmpdir(), 'linguaflow-audio');

const CURATED_READING_RESOURCES = [
  {
    title: 'How to Build a New Habit: This is Your Strategy Guide',
    source: 'James Clear',
    url: 'https://jamesclear.com/habit-guide',
    summary: 'A practical guide to habit design, ideal for reading about systems thinking, identity-based change, and consistent improvement.',
    content:
      'Reading preview:\n\nJames Clear explains habits as repeated decisions that shape identity over time. This piece is useful if you want natural English around productivity, routines, and self-improvement. As you read, notice how he moves from a simple definition to actionable steps. Pay attention to phrases like “start small,” “make it obvious,” and “build systems, not just goals.” After reading, try summarizing one idea in your own words and connect it to your current study routine.',
  },
  {
    title: 'Product Discovery',
    source: 'SVPG',
    url: 'https://www.svpg.com/product-discovery/',
    summary: 'A classic Marty Cagan article on how product teams discover solutions before building them.',
    content:
      'Reading preview:\n\nThis SVPG article walks through the logic of product discovery: understanding a real problem, interviewing users, prototyping quickly, and testing before shipping. It is especially useful if you care about product management vocabulary like opportunity, prototype, requirement, and user testing. While reading, track how the article builds a process from uncertainty to evidence. Then try explaining the four-week discovery cycle in simple English.',
  },
  {
    title: 'All of our Product articles',
    source: 'First Round Review',
    url: 'https://review.firstround.com/articles/product',
    summary: 'A curated page of product essays about PMF, decision-making, storytelling, and product leadership.',
    content:
      'Reading preview:\n\nThis First Round Review page is a strong entry point if you want real startup and product language. The page links to essays about product-market fit, founder judgment, organizational design, and product craft. It is useful for skimming headlines, choosing one article, and building topic vocabulary such as scale, taste, roadmap, and strategy. Start by scanning titles and choosing the one that best matches your current interest.',
  },
  {
    title: 'The Proven, Reasonable and Totally Unsexy Secret to Success',
    source: 'James Clear',
    url: 'https://jamesclear.com/habit-creep',
    summary: 'A readable article about continuous improvement and “habit creep,” with natural, modern nonfiction English.',
    content:
      'Reading preview:\n\nJames Clear uses the idea of “lifestyle creep” to introduce “habit creep,” a gentle form of continuous improvement. This article is good for learners who want accessible but polished English. Look at how the writer uses analogy to explain a mindset shift. Try collecting expressions related to progress, repetition, and long-term change, then write two sentences about your own learning habits.',
  },
  {
    title: 'Product managers',
    source: 'First Round Review',
    url: 'https://review.firstround.com/articles/product-managers/',
    summary: 'A hub page that gathers practical essays for PMs, from hiring and scaling to product judgment.',
    content:
      'Reading preview:\n\nThis page gathers product-management articles across hiring, org design, scaling, and decision-making. It is ideal if you want real workplace English used by startup operators. Skim the summaries, choose one subtopic, and practice explaining why it matters. You can also compare how different headlines frame product problems in concise business English.',
  },
];

const CURATED_LISTENING_RESOURCES = [
  {
    title: 'Do things that don’t scale',
    source: 'Masters of Scale',
    url: 'https://mastersofscale.com/episode/brian-chesky/',
    summary: 'Brian Chesky reflects on early Airbnb lessons and why handcrafted experiences can lead to scalable companies.',
    content:
      'Listening guide:\n\nIn this episode, you will hear startup language around product experience, scale, and customer obsession. Focus on expressions like “perfect experience,” “design backward,” and “what users really want.” First, listen for the big idea. Second, replay one short section and shadow the speaker’s rhythm. Finally, summarize what “doing things that do not scale” means in your own words.',
  },
  {
    title: 'Build your culture like a product',
    source: 'Masters of Scale',
    url: 'https://mastersofscale.com/build-your-culture-like-a-product-dharmesh-shah/',
    summary: 'Dharmesh Shah explains how culture can be intentionally designed and iterated, just like a product.',
    content:
      'Listening guide:\n\nThis episode is rich in workplace English: culture, transparency, buy-in, and team design. Use it if you want to get more comfortable with thoughtful business conversation rather than fast casual chat. Try listening once for structure, then once more to capture 3 key phrases you might reuse in an interview or team discussion.',
  },
  {
    title: 'How Founders Hire a VP of Product',
    source: 'a16z Podcast',
    url: 'https://a16z.com/podcast/a16z-podcast-how-founders-hire-a-vp-of-product/',
    summary: 'A practical discussion about hiring product leadership and defining what the role really means.',
    content:
      'Listening guide:\n\nThis conversation is useful if you care about startup hiring, leadership, and product orgs. Listen for phrases about ownership, integration, role definition, and common hiring mistakes. After listening, try answering: what qualities make a strong product leader, and how would you explain them in English?',
  },
  {
    title: 'Building Products for Power Users',
    source: 'a16z Podcast',
    url: 'https://a16z.com/podcast/a16z-podcast-building-products-for-power-users/',
    summary: 'A discussion on delighting advanced users while keeping software learnable and valuable.',
    content:
      'Listening guide:\n\nYou will hear language about premium products, onboarding, usability, and power-user workflows. This is a good step up from slower educational audio because it combines clear structure with native-speed product discussion. Listen for how the speakers define “power users” and how they balance delight with simplicity.',
  },
  {
    title: 'Engineering a Revolution at Work',
    source: 'a16z Podcast',
    url: 'https://a16z.com/podcast/a16z-podcast-engineering-a-revolution-at-work/',
    summary: 'A conversation about how workplace tools reshape managers, teams, and productivity.',
    content:
      'Listening guide:\n\nThis episode fits your product, tech, and workplace interests. The speakers discuss productivity tools, management, and how work changes with technology. Try listening for contrast words like “but,” “however,” and “instead,” because they often signal the most important insights in native interviews.',
  },
];

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

function getDashscopeApiKey() {
  const apiKey = process.env.DASHSCOPE_API_KEY || process.env.TTS_API_KEY;
  if (!apiKey) {
    throw new Error('Missing DASHSCOPE_API_KEY');
  }
  return apiKey;
}

function buildPublicOrigin(req) {
  const host = req.headers.host;
  if (!host) {
    throw new Error('Missing host header for ASR upload URL');
  }

  if (host.includes('localhost') || host.startsWith('127.0.0.1')) {
    throw new Error('Voice input requires a public deployment because Alibaba ASR only accepts public audio URLs.');
  }

  const protocol = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  return `${protocol}://${host}`;
}

function getLanguageHint(language) {
  const hints = {
    English: 'en',
    French: 'fr',
    Japanese: 'ja',
    Chinese: 'zh',
  };

  return hints[language] || 'en';
}

async function saveUploadedAudio(audioBuffer) {
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${Date.now()}-${randomUUID()}.wav`;
  const filePath = path.join(uploadDir, fileName);
  await writeFile(filePath, audioBuffer);
  return { fileName, filePath };
}

async function submitDashscopeAsrTask(fileUrl, languageHint) {
  const response = await fetch(DASHSCOPE_ASR_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getDashscopeApiKey()}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify({
      model: ASR_MODEL_NAME,
      input: {
        file_urls: [fileUrl],
      },
      parameters: {
        channel_id: [0],
        language_hints: [languageHint],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`DashScope ASR submit failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  const taskId = data?.output?.task_id;
  if (!taskId) {
    throw new Error('DashScope ASR did not return a task_id');
  }
  return taskId;
}

async function pollDashscopeAsrResult(taskId) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${getDashscopeApiKey()}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`DashScope ASR query failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const output = data?.output;
    const taskStatus = output?.task_status;

    if (taskStatus === 'SUCCEEDED') {
      const result = output?.results?.find((item) => item?.subtask_status === 'SUCCEEDED');
      const transcriptionUrl = result?.transcription_url;
      if (!transcriptionUrl) {
        throw new Error('DashScope ASR finished without a transcription_url');
      }
      return transcriptionUrl;
    }

    if (taskStatus === 'FAILED' || taskStatus === 'CANCELED') {
      throw new Error(output?.message || `DashScope ASR task failed with status ${taskStatus}`);
    }

    await delay(1200);
  }

  throw new Error('DashScope ASR timed out while waiting for the transcript');
}

async function fetchDashscopeTranscript(transcriptionUrl) {
  const response = await fetch(transcriptionUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ASR transcript JSON: ${response.status}`);
  }

  const data = await response.json();
  const transcript = Array.isArray(data?.transcripts)
    ? data.transcripts
        .map((item) => (typeof item?.text === 'string' ? item.text.trim() : ''))
        .filter(Boolean)
        .join(' ')
        .trim()
    : '';

  if (!transcript) {
    throw new Error('ASR transcript was empty');
  }

  return transcript;
}

function parseJson(value) {
  return JSON.parse(value);
}

function getHistory(payload) {
  const history = payload.history;
  return Array.isArray(history) ? history : [];
}

function chooseCuratedItem(items, seenTitles = []) {
  const unseen = items.filter((item) => !seenTitles.includes(item.title));
  const pool = unseen.length ? unseen : items;
  return pool[Math.floor(Math.random() * pool.length)];
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
        ? 'Hi, I can be your airport helper today. Where are you flying, and what do you need to do first?'
        : intentTag === 'job_interview'
          ? 'Hi, let us do a gentle mock interview. What role are you going for, and what makes it a good fit for you?'
          : 'Hey, I am here with you. What are you doing in this space right now?',
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
If the image mainly shows a person or selfie and the environment is unclear, stay conservative: use broad labels like "study setup", "indoor practice", or "casual space" instead of specific claims.
Only list objects that are clearly visible in the image.
The opener must sound like a warm real person already inside the scene.
Keep the opener to 1 or 2 short sentences, natural spoken English, no teacher talk, no labels, no explanations.
End with one concrete question that invites the learner to answer immediately.
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
- Reply in natural spoken English, usually 1 or 2 short sentences.
- Do not restate the whole scene every turn.
- Ask only one follow-up question at a time.
- If the user sounds hesitant, respond gently and keep it easy.
- Avoid sounding like a lesson plan, a rubric, or a correction engine.
- Return strict JSON only.
- feedback.summary must be 1-2 short sentences.
- feedback.tags can include fluency, accuracy, vocabulary.
- suggestedSentence should be friendly, practical, and easy to say aloud.
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
        if (language === 'English') {
          return sendJson(res, 200, chooseCuratedItem(CURATED_LISTENING_RESOURCES, Array.isArray(payload.seenTitles) ? payload.seenTitles : []));
        }
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
        if (language === 'English') {
          return sendJson(res, 200, [chooseCuratedItem(CURATED_READING_RESOURCES)]);
        }
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

async function handleAsrRequest(req, res) {
  let filePath = '';

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const audioBase64 = String(body.audioBase64 || '').trim();
    const language = String(body.language || 'English');

    if (!audioBase64) {
      return sendJson(res, 400, { error: 'Missing audioBase64 for ASR' });
    }

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    const upload = await saveUploadedAudio(audioBuffer);
    filePath = upload.filePath;

    const fileUrl = `${buildPublicOrigin(req)}/uploads/${upload.fileName}`;
    const taskId = await submitDashscopeAsrTask(fileUrl, getLanguageHint(language));
    const transcriptionUrl = await pollDashscopeAsrResult(taskId);
    const transcript = await fetchDashscopeTranscript(transcriptionUrl);

    return sendJson(res, 200, { transcript });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown ASR error';
    return sendJson(res, 500, { error: message });
  } finally {
    if (filePath) {
      unlink(filePath).catch(() => {});
    }
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

  if (pathname === '/api/asr' && req.method === 'POST') {
    return handleAsrRequest(req, res);
  }

  if (pathname.startsWith('/uploads/')) {
    const filePath = path.join(uploadDir, path.basename(pathname));
    if (!filePath.startsWith(uploadDir) || !existsSync(filePath)) {
      return sendJson(res, 404, { error: 'Audio upload not found' });
    }
    return sendFile(res, filePath, 'audio/wav');
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
