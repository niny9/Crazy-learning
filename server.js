import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createReadStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');

const ZHIPU_API_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const MODEL_NAME = process.env.ZHIPU_MODEL || 'glm-4-flash';

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

function parseJson(value) {
  return JSON.parse(value);
}

function getHistory(payload) {
  const history = payload.history;
  return Array.isArray(history) ? history : [];
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
        return sendJson(res, 200, { reply });
      }
      case 'scenarioReply': {
        const language = String(payload.language || 'English');
        const scenarioPrompt = String(payload.scenarioPrompt || '');
        const history = getHistory(payload);
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
        return sendJson(res, 200, { reply });
      }
      default:
        return sendJson(res, 400, { error: 'Unsupported action' });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
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
