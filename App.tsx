import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  CheckCircle,
  ChevronLeft,
  FileText,
  Globe,
  GraduationCap,
  Headphones,
  Mic,
  Pause,
  PenTool,
  Play,
  Plus,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Square,
  Star,
  Trash2,
  Volume2,
  Wand2,
  X,
  Zap,
} from 'lucide-react';
import {
  AppMode,
  ContentSourceType,
  CustomContentSource,
  DailyContent,
  DiaryEntry,
  FreeTalkMessage,
  FreeTalkReply,
  SavedSentence,
  StoryPhrase,
  TodayStoryEntry,
  TodayStoryMode,
  TodayStoryResult,
  VocabItem,
  WritingEntry,
  WritingFeedback,
} from './types';
import * as AIService from './services/aiService';
import {
  ensureSupabaseUser,
  fetchLearningItems,
  getSupabaseAccessToken,
  getSupabaseUser,
  isSupabaseConfigured,
  replaceLearningItems,
  sendMagicLink,
  signOutSupabase,
  subscribeToAuthChanges,
  verifyEmailOtp,
  trackUsageEvent as persistUsageEvent,
} from './services/supabaseService';
type StoryStage = 'choose_mode' | 'record' | 'review' | 'result';
type SpeakingTrack = 'story' | 'chat' | null;
type RecorderNodes = {
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  zeroGain: GainNode;
};
type CloudSyncStatus = 'local' | 'connecting' | 'syncing' | 'synced' | 'error';
type UsageEventPayload = {
  eventType: string;
  payload: Record<string, unknown>;
};
type NotebookDateGroup<T extends { id: string }> = {
  title: string;
  items: T[];
};
type NotebookLikeItem = {
  id?: string;
  date?: string;
  dateAdded?: string;
  language?: string;
};

const SUPPORTED_LANGUAGES = [
  { code: 'English', flag: '🇺🇸', label: 'English' },
];

const SECONDARY_MODULES = [
  {
    key: 'listening',
    title: 'Listening',
    subtitle: '真实播客与音频素材',
    description: '打开就能听，适合通勤和碎片时间做输入。',
    icon: Headphones,
    accent: 'indigo',
    onEnter: 'listening' as const,
  },
  {
    key: 'reading',
    title: 'Reading',
    subtitle: '产品 / 科技 / 职场阅读',
    description: '直接读真实内容，保留原文链接，看到喜欢的还能跳出去深读。',
    icon: BookOpen,
    accent: 'orange',
    onEnter: 'reading' as const,
  },
  {
    key: 'writing',
    title: 'Writing',
    subtitle: '写作工作台',
    description: '把你的原文改顺、升级，并沉淀进 Diary。',
    icon: PenTool,
    accent: 'emerald',
    onEnter: 'writing' as const,
  },
  {
    key: 'exams',
    title: 'Exams',
    subtitle: '考试资源入口',
    description: '把外部高频备考资源重新放回首页，随时能进。',
    icon: GraduationCap,
    accent: 'sky',
    onEnter: 'exams' as const,
  },
];

const UI_LABELS: Record<string, any> = {
  English: {
    welcome: 'Welcome, Learner! 👋',
    sub: 'Ready to master English today?',
    speaking: 'Speaking',
    listening: 'Listening',
    reading: 'Reading',
    writing: 'Writing',
    exams: 'Exams',
    notebook: 'Notebook',
    words: 'Words',
    sentences: 'Sentences',
    inspire: 'Inspire Me',
    check: 'Check & Polish',
    narrate: 'Narrate',
    connecting: 'Getting your scene ready...',
    errorMic: 'Microphone access is needed to start speaking.',
  },
  French: {
    welcome: 'Bienvenue 👋',
    sub: 'Prêt(e) à pratiquer aujourd’hui ?',
    speaking: 'Speaking',
    listening: 'Listening',
    reading: 'Reading',
    writing: 'Writing',
    exams: 'Exams',
    notebook: 'Notebook',
    words: 'Mots',
    sentences: 'Phrases',
    inspire: 'Inspire-moi',
    check: 'Vérifier et améliorer',
    narrate: 'Lire à voix haute',
    connecting: 'Préparation de ton espace...',
    errorMic: 'L’accès au micro est nécessaire pour commencer.',
  },
  Japanese: {
    welcome: 'ようこそ 👋',
    sub: '今日はどの練習から始めますか？',
    speaking: 'Speaking',
    listening: 'Listening',
    reading: 'Reading',
    writing: 'Writing',
    exams: 'Exams',
    notebook: 'Notebook',
    words: '単語',
    sentences: '文',
    inspire: 'お題を出す',
    check: 'チェックして整える',
    narrate: '読み上げ',
    connecting: '準備しています...',
    errorMic: '話し始めるにはマイクの許可が必要です。',
  },
};

const EXAM_RESOURCES: Record<string, any[]> = {
  English: [
    { name: 'KMF (考满分)', desc: 'IELTS / TOEFL / GRE Practice', url: 'https://www.kmf.com/', icon: FileText, color: 'blue' },
    { name: 'Burning Vocab', desc: 'CET-4/6 Questions', url: 'https://zhenti.burningvocabulary.cn/', icon: Zap, color: 'red' },
  ],
  Japanese: [{ name: 'NHK Web Easy', desc: 'Easy Japanese News', url: 'https://www3.nhk.or.jp/news/easy/', icon: Headphones, color: 'orange' }],
  French: [{ name: 'RFI Savoirs', desc: 'Apprendre le francais', url: 'https://savoirs.rfi.fr/fr', icon: Globe, color: 'blue' }],
};

const LANGUAGE_SOURCE_HINTS: Record<string, { readingNames: string[]; listeningNames: string[]; readingPlaceholder: string; listeningPlaceholder: string }> = {
  English: {
    readingNames: ['Stratechery', 'First Round Review', 'SVPG Articles', 'Harvard Business Review', 'Farnam Street', 'James Clear', 'Medium PM', 'Indie Hackers'],
    listeningNames: ["Lenny's Podcast", 'Masters of Scale', 'Tim Ferriss Show', 'a16z Podcast', 'The Journal', 'How I Built This', 'Look & Sound of Leadership'],
    readingPlaceholder: '比如 Stratechery',
    listeningPlaceholder: '比如 Lenny’s Podcast',
  },
  French: {
    readingNames: ['RFI Savoirs', 'Le Monde', 'France Culture', 'TV5MONDE Langue Française', 'Le Figaro', 'Courrier International', 'Les Echos Start', 'Usbek & Rica'],
    listeningNames: ['Journal en français facile', 'InnerFrench', 'Français Authentique', 'Easy French', 'Louis French Lessons', 'Transfert', 'Code source', 'La Story'],
    readingPlaceholder: '比如 RFI Savoirs',
    listeningPlaceholder: '比如 InnerFrench',
  },
  Japanese: {
    readingNames: ['NHK Web Easy', 'NHK News', 'Matcha', 'Hiragana Times', 'NewsPicks', 'ITmedia', 'President Online', 'Toyokeizai Online'],
    listeningNames: ['NHK World Easy Japanese', 'JapanesePod101', 'Nihongo Con Teppei', 'Matcha Podcast', 'Let’s Talk in Japanese', '4989 American Life', 'News Connect', 'Rebuild'],
    readingPlaceholder: '比如 NHK Web Easy',
    listeningPlaceholder: '比如 Nihongo Con Teppei',
  },
};

const SPEECH_RECOGNITION_LOCALE: Record<string, string> = {
  English: 'en-US',
  French: 'fr-FR',
  Japanese: 'ja-JP',
};

const WRITING_STORAGE_KEY = 'linguaflow-writing-entries';
const STORY_STORAGE_KEY = 'linguaflow-story-entries';
const CONTENT_SOURCE_STORAGE_KEY = 'linguaflow-content-sources';
const VOCAB_STORAGE_KEY = 'linguaflow-vocab';
const SENTENCE_STORAGE_KEY = 'linguaflow-sentences';
const DIARY_STORAGE_KEY = 'linguaflow-diary-entries';
const STORY_REMINDER_KEY = 'linguaflow-story-reminder';
const WAV_MIME_TYPE = 'audio/wav';
const safeTrim = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const safeArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? value.filter(Boolean) as T[] : []);
const stripMarkdownArtifacts = (value: unknown) =>
  safeTrim(value)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`{1,3}([^`]+)`{1,3}/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, (match) => match.replace(/\*/g, ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
const mergeById = <T extends { id: string }>(localItems: T[], remoteItems: T[]) => {
  const merged = new Map<string, T>();
  remoteItems.filter(Boolean).forEach((item) => {
    if (item?.id) merged.set(item.id, item);
  });
  localItems.filter(Boolean).forEach((item) => {
    if (item?.id) merged.set(item.id, item);
  });
  return Array.from(merged.values()).sort((left, right) => {
    const leftDate = 'dateAdded' in left ? String(left.dateAdded || '') : 'date' in left ? String(left.date || '') : '';
    const rightDate = 'dateAdded' in right ? String(right.dateAdded || '') : 'date' in right ? String(right.date || '') : '';
    return rightDate.localeCompare(leftDate);
  });
};

const formatDateGroupLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  const todayKey = new Date().toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === todayKey) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
};

const groupNotebookItemsByDate = <T extends { id: string; date?: string; dateAdded?: string }>(items: T[]): NotebookDateGroup<T>[] => {
  const groups = new Map<string, T[]>();
  items.filter(Boolean).forEach((item) => {
    const rawDate = item.dateAdded || item.date || '';
    const key = rawDate ? new Date(rawDate).toDateString() : 'Unknown date';
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  });

  return Array.from(groups.entries())
    .sort((left, right) => new Date(right[0]).getTime() - new Date(left[0]).getTime())
    .map(([key, groupedItems]) => ({
      title: key === 'Unknown date' ? key : formatDateGroupLabel(groupedItems[0]?.dateAdded || groupedItems[0]?.date || key),
      items: groupedItems,
    }));
};

const normalizeDailyContent = (value: Partial<DailyContent> | null | undefined): DailyContent | null => {
  if (!value || typeof value !== 'object') return null;

  return {
    title: stripMarkdownArtifacts(value.title) || 'Untitled content',
    summary: stripMarkdownArtifacts(value.summary) || 'No summary yet.',
    url: safeTrim(value.url) || '#',
    content: stripMarkdownArtifacts(value.content) || 'No content available yet.',
    source: stripMarkdownArtifacts(value.source) || 'LinguaFlow',
  };
};

const normalizeContentSource = (value: Partial<CustomContentSource> | null | undefined): CustomContentSource | null => {
  if (!value || typeof value !== 'object') return null;
  const name = safeTrim(value.name);
  const url = safeTrim(value.url);
  if (!name || !url) return null;

  const type: ContentSourceType =
    value.type === 'reading' || value.type === 'listening' || value.type === 'both'
      ? value.type
      : 'both';

  return {
    id: safeTrim(value.id) || `${Date.now()}-${name.slice(0, 12)}`,
    name,
    url,
    type,
    description: safeTrim(value.description) || undefined,
    dateAdded: safeTrim(value.dateAdded) || new Date().toISOString(),
    language: safeTrim(value.language) || undefined,
  };
};

const normalizeVocabItem = (value: Partial<VocabItem> | null | undefined): VocabItem | null => {
  if (!value || typeof value !== 'object') return null;
  const word = safeTrim(value.word);
  if (!word) return null;

  return {
    id: safeTrim(value.id) || `${Date.now()}-${word}`,
    word,
    definition: safeTrim(value.definition) || 'Definition pending.',
    chineseDefinition: safeTrim(value.chineseDefinition) || undefined,
    contextSentence: safeTrim(value.contextSentence) || 'No context sentence yet.',
    contextSentenceZh: safeTrim(value.contextSentenceZh) || undefined,
    sourceUrl: safeTrim(value.sourceUrl) || undefined,
    dateAdded: safeTrim(value.dateAdded) || new Date().toISOString(),
    imageUrl: safeTrim(value.imageUrl) || undefined,
    masteryLevel: typeof value.masteryLevel === 'number' ? value.masteryLevel : undefined,
    language: safeTrim(value.language) || undefined,
  };
};

const normalizeSentenceItem = (value: Partial<SavedSentence> | null | undefined): SavedSentence | null => {
  if (!value || typeof value !== 'object') return null;
  const text = safeTrim(value.text);
  if (!text) return null;

  return {
    id: safeTrim(value.id) || `${Date.now()}-${text.slice(0, 12)}`,
    text,
    source: safeTrim(value.source) || 'Manual',
    sourceUrl: safeTrim(value.sourceUrl) || undefined,
    notes: safeTrim(value.notes) || undefined,
    dateAdded: safeTrim(value.dateAdded) || new Date().toISOString(),
    scenario: safeTrim(value.scenario) || undefined,
    advancedVersion: safeTrim(value.advancedVersion) || undefined,
    language: safeTrim(value.language) || undefined,
  };
};

const normalizeDiaryEntry = (value: Partial<DiaryEntry> | null | undefined): DiaryEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const content = safeTrim(value.content);
  if (!content) return null;

  const sourceLabel = value.sourceLabel === 'Corrected' || value.sourceLabel === 'Pro Upgrade' || value.sourceLabel === 'Model Essay'
    ? value.sourceLabel
    : 'Model Essay';

  return {
    id: safeTrim(value.id) || `${Date.now()}-${content.slice(0, 12)}`,
    date: safeTrim(value.date) || new Date().toISOString(),
    topic: safeTrim(value.topic) || 'Free writing',
    title: safeTrim(value.title) || 'Untitled diary',
    content,
    sourceLabel,
    language: safeTrim(value.language) || undefined,
  };
};

const normalizeWritingEntry = (value: Partial<WritingEntry> | null | undefined): WritingEntry | null => {
  if (!value || typeof value !== 'object' || !value.feedback || typeof value.feedback !== 'object') return null;
  const original = safeTrim(value.original);
  if (!original) return null;

  return {
    id: safeTrim(value.id) || `${Date.now()}-${original.slice(0, 12)}`,
    date: safeTrim(value.date) || new Date().toISOString(),
    topic: safeTrim(value.topic) || 'Free writing',
    original,
    feedback: {
      original: safeTrim(value.feedback.original) || original,
      corrected: safeTrim(value.feedback.corrected) || original,
      upgraded: safeTrim(value.feedback.upgraded) || original,
      modelEssay: safeTrim(value.feedback.modelEssay) || original,
    },
    language: safeTrim(value.language) || undefined,
  };
};

const normalizeStoryPhrase = (value: Partial<StoryPhrase> | null | undefined): StoryPhrase | null => {
  if (!value || typeof value !== 'object') return null;
  const original = safeTrim(value.original);
  if (!original) return null;

  return {
    original,
    explanation: safeTrim(value.explanation) || 'A useful phrase from your story.',
    alternative: safeTrim(value.alternative) || 'Try a slightly different way to say it.',
  };
};

const normalizeStoryEntry = (value: Partial<TodayStoryEntry> | null | undefined): TodayStoryEntry | null => {
  if (!value || typeof value !== 'object') return null;
  const title = safeTrim(value.title);
  const originalText = safeTrim(value.originalText);
  const rewrittenText = safeTrim(value.rewrittenText);
  if (!title || !originalText || !rewrittenText) return null;

  const mode: TodayStoryMode = value.mode === 'zh' || value.mode === 'mixed' || value.mode === 'en' ? value.mode : 'mixed';

  return {
    id: safeTrim(value.id) || `${Date.now()}-${title.slice(0, 12)}`,
    date: safeTrim(value.date) || new Date().toISOString(),
    title,
    mode,
    originalText,
    rewrittenText,
    keyPhrases: safeArray<Partial<StoryPhrase>>(value.keyPhrases).map(normalizeStoryPhrase).filter(Boolean) as StoryPhrase[],
    comment: safeTrim(value.comment) || undefined,
    tags: safeArray<string>(value.tags).map((item) => safeTrim(item)).filter(Boolean),
    language: safeTrim(value.language) || undefined,
  };
};

const buildLocalFallbackContent = (
  type: 'reading' | 'listening',
  language: string,
  sourceNames: string[]
): DailyContent => {
  const source = sourceNames[Math.floor(Math.random() * sourceNames.length)] || 'LinguaFlow';

  const fallbackCopy = {
    English: {
      listeningTitle: `${source} · Quick listening fallback`,
      listeningSummary: 'A lightweight backup listening card while the live source refreshes.',
      listeningContent:
        'Today’s listening fallback comes from your default source pool. Try this: listen once for the main idea, then replay and shadow one or two lines aloud. After that, summarize the speaker’s point in your own English.',
      readingTitle: `${source} · Quick reading fallback`,
      readingSummary: 'A lightweight backup reading card while the live source refreshes.',
      readingContent:
        'Today’s reading fallback comes from your default source pool. Read this slowly, find three useful expressions, and then say what the main idea is in one or two sentences. The goal is not to finish fast, but to turn input into reusable English.',
    },
    French: {
      listeningTitle: `${source} · Écoute de secours`,
      listeningSummary: 'Une carte d’écoute provisoire pendant que nous rechargeons une source en direct.',
      listeningContent:
        "Voici un court support d’écoute en français pendant que nous rechargeons une vraie source. Écoute une première fois pour l’idée générale, puis une deuxième fois pour noter deux expressions utiles.",
      readingTitle: `${source} · Lecture de secours`,
      readingSummary: 'Une carte de lecture provisoire pendant que nous rechargeons une source en direct.',
      readingContent:
        "Voici un court support de lecture en français pendant que nous rechargeons une vraie source. Lis lentement, repère deux expressions utiles, puis résume l’idée principale avec une ou deux phrases simples.",
    },
    Japanese: {
      listeningTitle: `${source} ・聞く練習の予備カード`,
      listeningSummary: '実際の素材を再取得している間の一時的な聞く練習カードです。',
      listeningContent:
        '実際の音声素材を読み込み直している間、短い日本語の聞く練習を表示します。まず全体の意味をつかみ、そのあとでもう一度聞いて使えそうな表現を二つ拾ってみましょう。',
      readingTitle: `${source} ・読む練習の予備カード`,
      readingSummary: '実際の素材を再取得している間の一時的な読む練習カードです。',
      readingContent:
        '実際の読み物を読み込み直している間、短い日本語の読む練習を表示します。ゆっくり読んで使えそうな表現を二つ見つけ、最後に一文か二文で要点をまとめてみましょう。',
    },
  }[language] || {
    listeningTitle: `${source} · Quick listening fallback`,
    listeningSummary: 'A lightweight backup listening card while the live source refreshes.',
    listeningContent:
      'Here is a temporary listening card while we refresh your live source. Listen once for the main idea, then replay and summarize it in the current language.',
    readingTitle: `${source} · Quick reading fallback`,
    readingSummary: 'A lightweight backup reading card while the live source refreshes.',
    readingContent:
      'Here is a temporary reading card while we refresh your live source. Read it slowly, collect a few useful phrases, and summarize the main idea in the current language.',
  };

  if (type === 'listening') {
    return {
      title: fallbackCopy.listeningTitle,
      source,
      url: '#',
      summary: fallbackCopy.listeningSummary,
      content: fallbackCopy.listeningContent,
    };
  }

  return {
    title: fallbackCopy.readingTitle,
    source,
    url: '#',
    summary: fallbackCopy.readingSummary,
    content: fallbackCopy.readingContent,
  };
};

const getLanguageSourceHints = (language: string) => LANGUAGE_SOURCE_HINTS[language] || LANGUAGE_SOURCE_HINTS.English;

const getFreeTalkUiText = (language: string) => {
  if (language === 'French') {
    return {
      badge: 'Free Talk',
      microMode: 'Une phrase, une réponse',
      title: 'On parle librement, sans pression',
      description: 'Tu peux parler aussi longtemps que tu veux. Quand tu as fini, clique sur arrêter et je te répondrai.',
      placeholder: 'Dis quelque chose de simple... par exemple : Aujourd’hui, j’étais un peu fatigué, mais je voulais quand même pratiquer.',
      startButton: 'Commencer à parler',
      stopButton: "Arrêter et recevoir une réponse",
      sendButton: 'Envoyer',
      startHere: 'Pour commencer',
      betterWays: 'Façons plus naturelles de le dire',
      betterWaysEmpty: 'Après ton message, je te proposerai 1 ou 2 versions plus naturelles à réutiliser.',
      coachNote: 'Petit conseil',
      rules: [
        'Commence par des phrases courtes.',
        'Si tu bloques, dis simplement la version la plus facile.',
        'Le plus important, c’est de garder le rythme du dialogue.',
      ],
      rulesTitle: 'Règle simple',
      replying: 'Je te réponds...',
      recording: 'Enregistrement en cours... continue jusqu’à ce que tu appuies sur stop.',
      transcribing: 'Transcription en cours...',
      transcribingPart: 'Transcription de la partie',
      liveLabel: 'En direct',
      assistantRole: 'Partenaire IA',
      userRole: 'Toi',
      transcriptReady: 'Ta transcription est prête. Relis-la, ajuste si besoin, puis envoie.',
    };
  }

  if (language === 'Japanese') {
    return {
      badge: 'Free Talk',
      microMode: '一言話したら、一言返す',
      title: '気軽に話そう。うまくまとまっていなくても大丈夫',
      description: '長めに話しても大丈夫です。話し終わったら停止を押してください。そのあと私が返します。',
      placeholder: '気軽に話してみてください。例えば：今日は少し疲れていたけど、それでも練習したかったです。',
      startButton: '話し始める',
      stopButton: '止めて返信をもらう',
      sendButton: '送信',
      startHere: '最初のひと言',
      betterWays: 'もっと自然な言い方',
      betterWaysEmpty: '送信すると、次に使いやすい言い換えを 1〜2 個返します。',
      coachNote: 'ワンポイント',
      rules: [
        'まずは短い文で大丈夫です。',
        '詰まったら一番簡単な言い方で続けましょう。',
        '大事なのは会話のリズムを止めないことです。',
      ],
      rulesTitle: '気楽にいくルール',
      replying: '返信を考えています...',
      recording: '録音中です。話し終わったら停止を押してください。',
      transcribing: '音声を文字にしています...',
      transcribingPart: 'パートを文字にしています',
      liveLabel: '録音中',
      assistantRole: 'AI パートナー',
      userRole: 'あなた',
      transcriptReady: '文字起こしが入りました。必要なら少し直してから送信してください。',
    };
  }

  return {
    badge: 'Free Talk',
    microMode: '你说一句，我接一句',
    title: '直接聊，不知道说什么也没关系',
    description: '你可以多说一会儿。等你说完再点停止，我会马上接着回你。',
    placeholder: '先随便说一句也可以，比如：Today was busy, but I still wanted to practice.',
    startButton: '开始说话',
    stopButton: '停下并等我回复',
    sendButton: '发送',
    startHere: '先从这些开口',
    betterWays: '更自然的说法',
    betterWaysEmpty: '你发出一句后，我会给你 1 到 2 个更顺、更能复用的版本。',
    coachNote: '一句提醒',
    rules: [
      'Start with short sentences.',
      'If you get stuck, say the simplest version first.',
      'The goal is to keep the back-and-forth going.',
    ],
    rulesTitle: '先把这一轮聊下去',
    replying: '我正在接你的话...',
    recording: '正在录音，你继续说，等你自己按停止就行。',
    transcribing: '正在把你的语音转成文字...',
    transcribingPart: '正在转写这一段',
    liveLabel: '录音中',
    assistantRole: 'AI 口语搭子',
    userRole: '你',
    transcriptReady: '语音已经转好了。你可以先改一改，再决定要不要发。',
  };
};

const getContentUiText = (language: string, mode: AppMode.LISTENING | AppMode.READING) => {
  const isListening = mode === AppMode.LISTENING;

  if (language === 'French') {
    return {
      badgeFallback: isListening ? 'Contenu audio du jour' : 'Lecture du jour',
      loadingTitle: isListening ? 'Recherche d’un bon support audio...' : 'Recherche d’un bon texte...',
      loadingBody: isListening ? 'Synchronisation avec tes sources audio...' : 'Synchronisation avec tes sources de lecture...',
      loadingBadge: isListening ? 'Chargement audio' : 'Chargement lecture',
      loadingHint: isListening ? 'On va te sortir un nouvel audio en quelques secondes.' : 'On va te sortir une nouvelle lecture en quelques secondes.',
      openSource: 'Ouvrir la source originale',
      sourcePanelLabel: 'Mes sources',
      sourcePanelTitle: isListening ? 'Tes sources audio personnalisées' : 'Tes sources de lecture personnalisées',
      sourcePanelDesc: 'Cette zone sert à régler tes sources. Si tu en ajoutes, les prochaines recommandations viendront d’abord d’ici.',
      sourceTypeBoth: 'Lire + écouter',
      sourceTypeReading: 'Lecture seulement',
      sourceTypeListening: 'Audio seulement',
      sourceDescPlaceholder: 'Ajoute un thème, par exemple IA / business / culture',
      addSource: 'Ajouter cette source',
      noCustomSource: 'Aucune source personnalisée pour l’instant. Nous utiliserons directement le pool par défaut.',
      pauseTitle: 'Pause',
      resumeTitle: 'Reprendre',
      playTitle: 'Lancer la lecture',
      sourcePanelButton: 'Sources',
      sourcePanelClose: 'Fermer',
      customCountLabel: 'Personnalisées',
      defaultCountLabel: 'Par défaut',
    };
  }

  if (language === 'Japanese') {
    return {
      badgeFallback: isListening ? '今日の聞く素材' : '今日の読む素材',
      loadingTitle: isListening ? 'ぴったりの音声素材を探しています...' : 'ぴったりの読み物を探しています...',
      loadingBody: isListening ? '音声ソースと同期しています...' : '読み物ソースと同期しています...',
      loadingBadge: isListening ? '読み込み中' : '読み込み中',
      loadingHint: isListening ? '数秒で新しい音声素材を引いてきます。' : '数秒で新しい読み物を引いてきます。',
      openSource: '元の記事を開く',
      sourcePanelLabel: 'My sources',
      sourcePanelTitle: isListening ? '聞く素材の情報源を自分で追加' : '読む素材の情報源を自分で追加',
      sourcePanelDesc: 'ここは設定エリアです。追加すると、次回以降はここから優先して素材を選びます。',
      sourceTypeBoth: '読む + 聞く',
      sourceTypeReading: '読むだけ',
      sourceTypeListening: '聞くだけ',
      sourceDescPlaceholder: 'テーマを一言、例えば AI / ビジネス / 文化',
      addSource: '情報源を追加',
      noCustomSource: 'まだ自分の情報源はありません。今はデフォルトの情報源から直接選びます。',
      pauseTitle: '一時停止',
      resumeTitle: '再開',
      playTitle: '再生',
      sourcePanelButton: '情報源',
      sourcePanelClose: '閉じる',
      customCountLabel: '自分の源',
      defaultCountLabel: '既定',
    };
  }

  return {
    badgeFallback: '今日推荐内容',
    loadingTitle: '正在帮你找一篇更值得读的内容...',
    loadingBody: '我正在从默认信息源和你的收藏源里重新抓新的内容，不会只停在原地。',
    loadingBadge: '正在刷新今日材料',
    loadingHint: '这次会重新随机信息源，也会重新随机里面的内容。',
    openSource: '打开原文链接',
    sourcePanelLabel: '我的信息源',
    sourcePanelTitle: isListening ? '自定义你的听力信息源' : '自定义你的阅读信息源',
    sourcePanelDesc: '这里主要是设置区。你一旦加了自己的源，后面系统会优先从这里抽内容。',
    sourceTypeBoth: '读 + 听',
    sourceTypeReading: '只读',
    sourceTypeListening: '只听',
    sourceDescPlaceholder: '补一句主题，比如 AI / 商业 / 文化',
    addSource: '添加源',
    noCustomSource: '你还没加自定义源，当前会直接从默认源池里抓内容。',
    pauseTitle: '暂停',
    resumeTitle: '继续播放',
    playTitle: '开始播放',
    sourcePanelButton: '信息源设置',
    sourcePanelClose: '收起',
    customCountLabel: '自定义',
    defaultCountLabel: '默认',
  };
};

const getGeneralUiText = (language: string) => {
  if (language === 'French') {
    return {
      dashboardBadge: 'Today Story',
      dashboardTitle: 'Raconte une chose de ta journée dans la langue que tu apprends',
      dashboardDesc:
        'Pas besoin de préparer un sujet parfait. Raconte simplement ce qui t’est arrivé aujourd’hui, et LinguaFlow t’aide à le reformuler plus naturellement.',
      storyButton: 'Commencer Today Story',
      freeTalkButton: 'Parler librement',
      libraryButton: 'Ma bibliothèque',
      otherModules: 'Les autres modules sont toujours là',
      storyLibraryTitle: 'Ma bibliothèque d’histoires',
      storyLibraryDesc: 'Tes histoires personnelles s’accumulent ici pour être réutilisées plus tard en entretien, en examen ou dans une vraie conversation.',
      backHome: 'Retour à l’accueil',
      writingTitle: 'Atelier d’écriture',
      saveDiary: 'Enregistrer dans Diary',
      saveDraft: 'Enregistrer le brouillon',
      savedDiaries: 'Diaries enregistrés',
      feedbackPlaceholder: 'Le retour IA apparaîtra ici après ton envoi.',
      examTitle: 'Exam Hub',
      examDesc: 'Des ressources externes pour renforcer ta préparation.',
      accountTitle: 'Compte',
      cloudAccount: 'Compte cloud',
      accountDesc: 'Connecte-toi d’abord, puis ton notebook, ton diary et ton historique resteront attachés à ton compte.',
      accountSynced: 'Ton notebook est maintenant lié à ton compte et se synchronise entre les sessions.',
      signInTitle: 'Se connecter par e-mail',
      emailPlaceholder: 'vous@example.com',
      verificationCode: 'Code de vérification',
      sendVerificationCode: 'Envoyer le code',
      sendingCode: 'Envoi...',
      changeEmail: "Changer d'e-mail",
      verifyCode: 'Vérifier le code',
      verifyingCode: 'Vérification...',
      emailLogin: 'Connexion e-mail',
      currentAccount: 'Compte actuel',
      clipperTitle: 'Chrome Clipper',
      generateToken: 'Générer le code',
      generatingToken: 'Génération...',
      copy: 'Copier',
      signOut: 'Se déconnecter',
      signingOut: 'Déconnexion...',
      myStoriesBadge: 'Mes histoires',
      corrected: 'Corrigé',
      proUpgrade: 'Version avancée',
      modelEssay: 'Version modèle',
      saveToDiary: 'Enregistrer dans Diary',
      speakingLaunchTitle: "Ouverture de l'espace oral...",
      speakingLaunchDesc: "On prépare l'image et l'état de la conversation, tu pourras parler dans un instant.",
      todayLoopTitle: "Le chemin le plus simple aujourd'hui",
      momentumTitle: 'Ce que tu as déjà accumulé',
      momentumDesc: 'histoires personnelles sont déjà enregistrées',
    };
  }

  if (language === 'Japanese') {
    return {
      dashboardBadge: 'Today Story',
      dashboardTitle: 'その日にあったことを、学習中の言語で少しずつ話してみよう',
      dashboardDesc:
        '完璧なテーマはなくて大丈夫です。今日あったことを話すだけで、LinguaFlow があとで自然な形に整えます。',
      storyButton: 'Today Story を始める',
      freeTalkButton: 'そのまま会話する',
      libraryButton: 'ストーリー集',
      otherModules: '読む / 聞く / 書く / 試験対策も使えます',
      storyLibraryTitle: '私のストーリー集',
      storyLibraryDesc: 'あとで面接や試験、普段の会話で使い回せる、自分だけのストーリーをここにためていきます。',
      backHome: 'ホームへ戻る',
      writingTitle: 'Writing Studio',
      saveDiary: 'Diary に保存',
      saveDraft: '下書きを保存',
      savedDiaries: '保存した Diary',
      feedbackPlaceholder: '送信すると、ここに AI のフィードバックが表示されます。',
      examTitle: 'Exam Hub',
      examDesc: '学習を支える外部リソース集です。',
      accountTitle: 'アカウント',
      cloudAccount: 'クラウドアカウント',
      accountDesc: '先にログインすると、Notebook・Diary・学習履歴があなたのアカウントにひも付きます。',
      accountSynced: 'Notebook はアカウントにひも付けられ、次回以降も同期されます。',
      signInTitle: 'メールでログイン',
      emailPlaceholder: 'you@example.com',
      verificationCode: '認証コード',
      sendVerificationCode: 'コードを送る',
      sendingCode: '送信中...',
      changeEmail: 'メールを変更',
      verifyCode: 'コードを確認',
      verifyingCode: '確認中...',
      emailLogin: 'メールログイン',
      currentAccount: '現在のアカウント',
      clipperTitle: 'Chrome Clipper',
      generateToken: '接続コードを生成',
      generatingToken: '生成中...',
      copy: 'コピー',
      signOut: 'ログアウト',
      signingOut: 'ログアウト中...',
      myStoriesBadge: '私のストーリー',
      corrected: '修正版',
      proUpgrade: '表現を強めた版',
      modelEssay: '模範版',
      saveToDiary: 'Diary に保存',
      speakingLaunchTitle: 'スピーキング画面を開いています...',
      speakingLaunchDesc: '画像と会話の準備をしています。すぐに話し始められます。',
      todayLoopTitle: '今日はこの流れがいちばん楽です',
      momentumTitle: 'ここまで残ってきた表現',
      momentumDesc: '本の自分のストーリーが残っています',
    };
  }

  return {
    dashboardBadge: 'Today Story',
    dashboardTitle: '每天用英语讲清楚今天的一件事',
    dashboardDesc:
      '不用背模板，不用准备话题。你只要讲今天发生在你身上的一件事，我来帮你整理成一篇更自然、以后也能复用的英语故事。',
    storyButton: '开始今天的故事',
    freeTalkButton: '直接聊几句英语',
    libraryButton: '我的故事库',
    otherModules: '听 / 读 / 写 / 考试都还在',
    storyLibraryTitle: '我的故事库',
    storyLibraryDesc: '这里会慢慢长出你自己的英语故事素材。以后面试、考试、聊天，都可以从这里复述和调用。',
    backHome: '返回首页',
    writingTitle: '写作练习',
    saveDiary: '保存到 Diary',
    saveDraft: '保存草稿',
    savedDiaries: '已保存的 Diary',
    feedbackPlaceholder: '你提交后，AI 的反馈会出现在这里。',
    examTitle: '考试专区',
    examDesc: '这里放你后续备考会用到的外部资料和入口。',
    accountTitle: '账号',
    cloudAccount: '云端账号',
    accountDesc: '先登录，之后你的 notebook、diary 和学习记录都会跟着账号走。',
    accountSynced: '你的 notebook 已经和账号绑定，之后重新打开也会保留。',
    signInTitle: '邮箱登录',
    emailPlaceholder: 'you@example.com',
    verificationCode: '验证码',
    sendVerificationCode: '发送验证码',
    sendingCode: '发送中...',
    changeEmail: '切换邮箱',
    verifyCode: '确认登录',
    verifyingCode: '验证中...',
    emailLogin: '邮箱登录',
    currentAccount: '当前账号',
    clipperTitle: 'Chrome 划词插件',
    generateToken: '生成连接码',
    generatingToken: '生成中...',
    copy: '复制',
    signOut: '退出登录',
    signingOut: '退出中...',
    myStoriesBadge: '我的故事',
    corrected: '纠正版本',
    proUpgrade: '更顺一点的版本',
    modelEssay: '参考范文版',
    saveToDiary: '保存到 Diary',
    speakingLaunchTitle: '正在打开口语练习区...',
    speakingLaunchDesc: '我们先把上传图片和对话状态准备好，你马上就能开始讲。',
    todayLoopTitle: '今天怎么练最轻松',
    momentumTitle: '已经攒下来的表达',
    momentumDesc: '篇属于你的英语故事已经留下来了',
  };
};

const getNotebookUiText = (language: string) => {
  if (language === 'French') {
    return {
      diaryTab: 'Diary',
      copyToNotion: 'Copier vers Notion',
      downloadObsidian: 'Télécharger en .md',
      addWordPlaceholder: 'Ajouter un mot manuellement...',
      addSentencePlaceholder: 'Ajouter une phrase utile...',
      diaryTitlePlaceholder: 'Titre du diary...',
      diaryInputPlaceholder: 'Ajouter une note de diary manuellement...',
      add: 'Ajouter',
      addToDiary: 'Ajouter au Diary',
      untitledWord: 'Mot sans titre',
      untitledSentence: 'Phrase sans titre',
      untitledDiary: 'Diary sans titre',
      languageClip: 'Extrait linguistique',
      savedSentence: 'Phrase enregistrée',
      openSource: 'Ouvrir la source',
      playWord: 'Prononcer le mot',
      playSentence: 'Lire la phrase',
      pronunciationFailed: "La lecture n'a pas marché. Réessaie encore.",
      copiedNotice: 'Copié en Markdown. Tu peux le coller directement dans Notion.',
      copyFailed: 'La copie a échoué. Réessaie encore.',
      downloadedNotice: 'Le Markdown est téléchargé. Tu peux le glisser dans Obsidian.',
      manualNote: 'Note manuelle',
      manualDiaryNote: 'Note de diary manuelle',
      freeWriting: 'Écriture libre',
      writingDraft: "Brouillon d'écriture",
      unknownDate: 'Date inconnue',
      exportedAt: 'Exporté le',
      source: 'Source',
      chineseDefinition: 'Définition chinoise',
      targetDefinition: language === 'French' ? 'Définition française' : 'Définition',
      exampleSentence: 'Exemple',
      chineseHint: 'Indice chinois',
      tag: 'Étiquette',
    };
  }

  if (language === 'Japanese') {
    return {
      diaryTab: 'Diary',
      copyToNotion: 'Notion にコピー',
      downloadObsidian: '.md をダウンロード',
      addWordPlaceholder: '単語を手動で追加...',
      addSentencePlaceholder: '文を手動で追加...',
      diaryTitlePlaceholder: 'Diary のタイトル...',
      diaryInputPlaceholder: 'Diary メモを手動で追加...',
      add: '追加',
      addToDiary: 'Diary に追加',
      untitledWord: '無題の単語',
      untitledSentence: '無題の文',
      untitledDiary: '無題の Diary',
      languageClip: '言語クリップ',
      savedSentence: '保存した文',
      openSource: '元ソースを開く',
      playWord: '単語を再生',
      playSentence: '文を読み上げ',
      pronunciationFailed: '再生に失敗しました。もう一度試してください。',
      copiedNotice: 'Markdown をコピーしました。Notion にそのまま貼れます。',
      copyFailed: 'コピーに失敗しました。もう一度試してください。',
      downloadedNotice: 'Markdown を保存しました。Obsidian に入れられます。',
      manualNote: '手動メモ',
      manualDiaryNote: '手動 Diary メモ',
      freeWriting: '自由作文',
      writingDraft: 'Writing Draft',
      unknownDate: '日付不明',
      exportedAt: '書き出し日時',
      source: 'Source',
      chineseDefinition: '中国語の意味',
      targetDefinition: language === 'Japanese' ? '日本語の意味' : '意味',
      exampleSentence: '例文',
      chineseHint: '中国語ヒント',
      tag: 'タグ',
    };
  }

  return {
    diaryTab: 'Diary',
    copyToNotion: '复制到 Notion',
    downloadObsidian: '下载 .md 到 Obsidian',
    addWordPlaceholder: '手动补一个单词...',
    addSentencePlaceholder: '手动补一句想存的话...',
    diaryTitlePlaceholder: 'Diary 标题...',
    diaryInputPlaceholder: '手动补一条 diary...',
    add: '添加',
    addToDiary: '存到 Diary',
    untitledWord: '未命名单词',
    untitledSentence: '未命名句子',
    untitledDiary: '未命名 Diary',
    languageClip: '语言片段',
    savedSentence: '已保存句子',
    openSource: '打开原文',
    playWord: '播放发音',
    playSentence: '朗读整句',
    pronunciationFailed: '这个词暂时没能播出来，再试一次。',
    copiedNotice: '已复制成 Markdown，可以直接贴到 Notion。',
    copyFailed: '复制失败了，你再试一次。',
    downloadedNotice: 'Markdown 已下载，直接拖进 Obsidian 就行。',
    manualNote: '手动备注',
    manualDiaryNote: '手动 Diary 备注',
    freeWriting: '自由写作',
    writingDraft: '写作草稿',
    unknownDate: '未知日期',
    exportedAt: '导出时间',
    source: 'Source',
    chineseDefinition: '中文释义',
    targetDefinition: language === 'English' ? '英文释义' : '目标语言释义',
    exampleSentence: '例句',
    chineseHint: '中文示意',
    tag: '标签',
  };
};

const getStoryUiText = (language: string) => {
  if (language === 'French') {
    return {
      step1: 'Étape 1',
      chooseTitle: 'Choisis le type de pratique orale dont tu as besoin aujourd’hui',
      chooseDesc: 'Si tu sais déjà quoi raconter, prends Today Story. Si tu veux juste parler librement, prends Free Talk.',
      freeTalkDesc: 'Même si tu ne sais pas quoi dire, commence par quelques phrases avec l’IA.',
      whatYouGet: 'Ce que tu obtiens',
      whatYouGetList: [
        'Une version remise au propre de ce que tu viens de dire',
        'Une histoire plus claire que tu pourras réutiliser plus tard',
        '3 expressions utiles à reprendre en entretien, en examen ou en conversation',
      ],
      reminder: 'Rappel quotidien',
      reminderDesc: 'Quand tu ouvres la page, on peut te rappeler que tu n’as pas encore raconté ton histoire du jour.',
      recordHint: '3 à 5 minutes recommandées',
      recordTitle: 'Raconte une chose qui t’est arrivée aujourd’hui',
      recordDesc: 'Cela peut être une conversation, une émotion, une petite joie, une décision, ou simplement le moment que tu veux garder en tête.',
      transcriptPlaceholder: 'La transcription apparaîtra ici. Tu peux aussi corriger ou compléter à la main.',
      startRecording: 'Commencer à enregistrer',
      pauseAndTranscribe: 'Pause et transcription',
      finishStep: 'Terminer et passer à l’étape suivante',
      lightGuidance: 'Guidance légère',
      guidanceList: [
        'Dis d’abord ce qui s’est passé, puis ce que tu en as pensé.',
        'Si tu bloques, tu peux compléter avec un peu de chinois.',
        'Pas besoin d’être parfait. L’IA t’aidera à remettre le tout en ordre.',
      ],
      generateStory: 'Générer mon histoire',
      storyResultLabel: "Today’s Story",
      copyEnglish: 'Copier le texte optimisé',
      goLibrary: 'Voir ma bibliothèque',
      originalVersion: 'Version de départ',
      rewrittenVersion: 'Version optimisée',
      keyPhrases: 'Expressions clés',
      summary: 'Retour global',
      next: 'Et ensuite',
      retry: 'Refaire une version plus fluide',
      restart: 'Recommencer avec un autre mode',
      emptyLibrary: 'Tu n’as encore aucune histoire enregistrée. Commence par la première.',
      sortByDate: 'Du plus récent au plus ancien',
      noStoryYet: 'Commence par générer ta première histoire Today Story.',
      originalStory: 'Histoire brute',
      optimizedStory: 'Histoire optimisée',
      copy: 'Copier',
      comment: 'Commentaire',
      countSuffix: ' histoires',
      reviewTitle: 'Relis rapidement avant de générer',
      reviewDesc: 'Vérifie si ton histoire est complète. Tu peux encore corriger, ajouter une phrase, ou reprendre un peu de voix.',
      transcriptStats: 'Aperçu du brouillon',
      wordCount: 'Nombre de mots',
      keepAdding: 'Continuer à ajouter',
      clearDraft: 'Effacer et recommencer',
      alternativeLabel: 'Tu peux aussi le redire comme ça la prochaine fois',
    };
  }

  if (language === 'Japanese') {
    return {
      step1: 'STEP 1',
      chooseTitle: '今日はどの口語練習が合っているか選びましょう',
      chooseDesc: '話したい内容が決まっていれば Today Story、まず気軽に話したいなら Free Talk です。',
      freeTalkDesc: '何を話せばいいかわからなくても大丈夫。まずは AI と数往復してみましょう。',
      whatYouGet: '得られるもの',
      whatYouGetList: [
        '今話した内容を整理した版',
        'あとでそのまま使いやすい、より自然なストーリー',
        '面接や試験、会話で再利用しやすい 3 つの表現',
      ],
      reminder: '毎日のリマインド',
      reminderDesc: 'ページを開いたときに、今日まだ話していないことを軽く知らせます。',
      recordHint: '3〜5 分くらいが目安です',
      recordTitle: '今日あったことをひとつ話してみましょう',
      recordDesc: '会話、感情、小さなうれしいこと、決めたこと、今日いちばん残したい場面など何でも大丈夫です。',
      transcriptPlaceholder: 'ここに音声の文字起こしが出ます。必要なら手動で直しても大丈夫です。',
      startRecording: '録音を始める',
      pauseAndTranscribe: '止めて文字にする',
      finishStep: '終えて次へ進む',
      lightGuidance: '軽いガイド',
      guidanceList: [
        'まず何があったかを話し、そのあと自分の気持ちを足しましょう。',
        '詰まったら中国語を少し混ぜても大丈夫です。',
        '完璧でなくて大丈夫。AI が流れを整えます。',
      ],
      generateStory: 'ストーリーを作る',
      storyResultLabel: 'Today’s Story',
      copyEnglish: '整えた文章をコピー',
      goLibrary: 'ストーリー集を見る',
      originalVersion: '元の内容',
      rewrittenVersion: '整えたバージョン',
      keyPhrases: '使える表現',
      summary: '今回のまとめ',
      next: '次にやること',
      retry: 'もう一度、もっと自然に言い直す',
      restart: '別のモードで最初からやり直す',
      emptyLibrary: 'まだ保存されたストーリーがありません。最初の 1 本から始めましょう。',
      sortByDate: '新しい順',
      noStoryYet: 'まず最初の Today Story を作ってみましょう。',
      originalStory: '元のストーリー',
      optimizedStory: '整えたストーリー',
      copy: 'コピー',
      comment: 'コメント',
      countSuffix: ' 件',
      reviewTitle: '生成前にざっと見直しましょう',
      reviewDesc: '話の流れが足りているか確認して、必要なら少し直したり、音声を追加したりできます。',
      transcriptStats: '下書きメモ',
      wordCount: '語数',
      keepAdding: '続きを足す',
      clearDraft: '消してやり直す',
      alternativeLabel: '次はこう言っても自然です',
    };
  }

  return {
    step1: 'STEP 1',
    chooseTitle: '先选你今天更需要哪种口语练习',
    chooseDesc: '如果你已经知道今天想讲什么，就走 Today Story；如果你只是想找个人直接聊几句英语，就走 Free Talk。',
    freeTalkDesc: '不知道说什么也没关系，先和 AI 直接聊几句英语。',
    whatYouGet: '你会拿到什么',
    whatYouGetList: [
      '一版整理后的原话，让你知道自己刚刚到底讲了什么',
      '一篇更清晰、以后可以直接复述的英文故事',
      '3 个重点表达，方便以后面试、口语考试和聊天复用',
    ],
    reminder: 'Daily reminder',
    reminderDesc: '打开页面时会提醒你：今天还没讲故事哦。',
    recordHint: '建议录 3–5 分钟',
    recordTitle: '讲讲今天发生在你身上的一件事',
    recordDesc: '可以是一次沟通、一个情绪、一件小开心、一个决定，或者今天最想记住的一幕。',
    transcriptPlaceholder: '这里会出现语音转写结果。你也可以直接手动输入，先把故事讲顺最重要。',
    startRecording: '开始录音',
    pauseAndTranscribe: '暂停并转写',
    finishStep: '结束并进入下一步',
    lightGuidance: 'Light guidance',
    guidanceList: [
      '先讲发生了什么，再讲你当时怎么想。',
      '如果卡壳，就先用中文补一句。',
      '不需要太完整，AI 会帮你理顺结构。',
    ],
    generateStory: '生成我的故事',
    storyResultLabel: 'Today’s Story',
    copyEnglish: '复制英文故事',
    goLibrary: '去我的故事库',
    originalVersion: '原话整理版',
    rewrittenVersion: '优化后的英文版本',
    keyPhrases: '重点表达',
    summary: '今天的总评',
    next: '接下来怎么继续',
    retry: '再讲一版，把故事说得更顺',
    restart: '换一种模式重新开始',
    emptyLibrary: '你还没有保存任何故事。今天先讲第一篇吧。',
    sortByDate: '按日期倒序',
    noStoryYet: '先去生成你的第一篇 Today Story。',
    originalStory: '原始故事',
    optimizedStory: '优化后的英文故事',
    copy: '复制',
    comment: '点评',
    countSuffix: ' stories',
    reviewTitle: '生成前先顺一遍',
    reviewDesc: '看看这段是不是已经讲完整了。你还可以补一句、改一句，或者再录一小段。',
    transcriptStats: '草稿概览',
    wordCount: '词数',
    keepAdding: '继续补一点',
    clearDraft: '清空重来',
    alternativeLabel: '你下次也可以直接这样说',
  };
};

const App = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [language, setLanguage] = useState('English');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'vocab' | 'sentences' | 'diary'>('vocab');
  const [manualVocabInput, setManualVocabInput] = useState('');
  const [manualSentenceInput, setManualSentenceInput] = useState('');
  const [manualDiaryTitle, setManualDiaryTitle] = useState('');
  const [manualDiaryInput, setManualDiaryInput] = useState('');
  const [notebookNotice, setNotebookNotice] = useState('');

  const [vocabList, setVocabList] = useState<VocabItem[]>([]);
  const [sentenceList, setSentenceList] = useState<SavedSentence[]>([]);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [seenListeningTitles, setSeenListeningTitles] = useState<string[]>([]);
  const [seenReadingTitles, setSeenReadingTitles] = useState<string[]>([]);
  const [seenListeningUrls, setSeenListeningUrls] = useState<string[]>([]);
  const [seenReadingUrls, setSeenReadingUrls] = useState<string[]>([]);

  const [writingInput, setWritingInput] = useState('');
  const [writingTopic, setWritingTopic] = useState('');
  const [isWritingLoading, setIsWritingLoading] = useState(false);
  const [writingResult, setWritingResult] = useState<WritingFeedback | null>(null);
  const [writingEntries, setWritingEntries] = useState<WritingEntry[]>([]);
  const [writingSavedNotice, setWritingSavedNotice] = useState('');
  const [storyStage, setStoryStage] = useState<StoryStage>('choose_mode');
  const [storyMode, setStoryMode] = useState<TodayStoryMode>('mixed');
  const [storyTranscript, setStoryTranscript] = useState('');
  const [storyResult, setStoryResult] = useState<TodayStoryResult | null>(null);
  const [storyEntries, setStoryEntries] = useState<TodayStoryEntry[]>([]);
  const [selectedStoryId, setSelectedStoryId] = useState<string | null>(null);
  const [storyReminder, setStoryReminder] = useState('22:00');
  const [isStoryGenerating, setIsStoryGenerating] = useState(false);
  const [storyNotice, setStoryNotice] = useState('');
  const [speakingTrack, setSpeakingTrack] = useState<SpeakingTrack>(null);
  const [freeTalkMessages, setFreeTalkMessages] = useState<FreeTalkMessage[]>([]);
  const [freeTalkInput, setFreeTalkInput] = useState('');
  const [freeTalkQuickReplies, setFreeTalkQuickReplies] = useState<string[]>([
    'Tell me about your day.',
    'What are you doing right now?',
    'What made you smile today?',
  ]);
  const [freeTalkCorrection, setFreeTalkCorrection] = useState('');
  const [freeTalkImprovements, setFreeTalkImprovements] = useState<string[]>([]);
  const [isFreeTalkLoading, setIsFreeTalkLoading] = useState(false);
  const [contentSources, setContentSources] = useState<CustomContentSource[]>([]);
  const [sourceNameInput, setSourceNameInput] = useState('');
  const [sourceUrlInput, setSourceUrlInput] = useState('');
  const [sourceDescriptionInput, setSourceDescriptionInput] = useState('');
  const [sourceTypeInput, setSourceTypeInput] = useState<ContentSourceType>('both');
  const [isSourcePanelOpen, setIsSourcePanelOpen] = useState(false);
  const [isLaunchingSpeaking, setIsLaunchingSpeaking] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('local');
  const [cloudSyncMessage, setCloudSyncMessage] = useState('Local notebook');
  const [authEmail, setAuthEmail] = useState('');
  const [authOtp, setAuthOtp] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [isEmailUser, setIsEmailUser] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(!isSupabaseConfigured());
  const [isOtpStage, setIsOtpStage] = useState(false);
  const [clipperToken, setClipperToken] = useState('');
  const [clipperTokenMessage, setClipperTokenMessage] = useState('');
  const [isGeneratingClipperToken, setIsGeneratingClipperToken] = useState(false);

  const [isListening, setIsListening] = useState(false);
  const [speechDraft, setSpeechDraft] = useState('');
  const [recordingDurationSec, setRecordingDurationSec] = useState(0);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isVoiceOutputEnabled, setIsVoiceOutputEnabled] = useState(true);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [isPlaybackActive, setIsPlaybackActive] = useState(false);
  const [isPlaybackPaused, setIsPlaybackPaused] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [selectedText, setSelectedText] = useState('');

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const holdTriggeredRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);
  const recorderRef = useRef<RecorderNodes | null>(null);
  const recordedChunksRef = useRef<Float32Array[]>([]);
  const recordingSampleRateRef = useRef(16000);
  const freeTalkTurnIdRef = useRef(0);
  const silenceTimerRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const speechDetectedRef = useRef(false);
  const cloudUserIdRef = useRef<string | null>(null);
  const hasBootstrappedCloudRef = useRef(false);
  const isApplyingCloudSnapshotRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const usageQueueRef = useRef<UsageEventPayload[]>([]);
  const listeningAutoplayRef = useRef<string | null>(null);
  const cloudRetryTimerRef = useRef<number | null>(null);
  const languageSourceHints = getLanguageSourceHints(language);
  const freeTalkUiText = getFreeTalkUiText(language);
  const contentUiText = getContentUiText(language, mode === AppMode.LISTENING ? AppMode.LISTENING : AppMode.READING);
  const generalUiText = getGeneralUiText(language);
  const storyUiText = getStoryUiText(language);
  const notebookUiText = getNotebookUiText(language);

  const labels = UI_LABELS[language] || UI_LABELS.English;
  const renderSubpageBackButton = (onClick?: () => void) => (
    <button
      onClick={onClick || (() => setMode(AppMode.DASHBOARD))}
      className="inline-flex items-center gap-2 rounded-full bg-white/90 px-4 py-2 text-sm font-black text-slate-700 border border-slate-100 shadow-sm hover:border-kitty-200"
    >
      <ChevronLeft size={16} /> {generalUiText.backHome}
    </button>
  );
  const formatRecordingDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
  };
  const formatDiarySourceLabel = (value: string) => {
    if (value === 'Corrected') return generalUiText.corrected;
    if (value === 'Pro Upgrade') return generalUiText.proUpgrade;
    if (value === 'Model Essay') return generalUiText.modelEssay;
    return value;
  };
  const selectedStory = storyEntries.find((entry) => entry.id === selectedStoryId) || storyEntries[0] || null;
  const readingSources = contentSources.filter((item) => item.language === language && (item.type === 'reading' || item.type === 'both'));
  const listeningSources = contentSources.filter((item) => item.language === language && (item.type === 'listening' || item.type === 'both'));

  const applyCloudSnapshot = async (userId: string) => {
    const storedVocab = safeArray<Partial<VocabItem>>(JSON.parse(window.localStorage.getItem(VOCAB_STORAGE_KEY) || '[]')).map(normalizeVocabItem).filter(Boolean) as VocabItem[];
    const storedSentences = safeArray<Partial<SavedSentence>>(JSON.parse(window.localStorage.getItem(SENTENCE_STORAGE_KEY) || '[]')).map(normalizeSentenceItem).filter(Boolean) as SavedSentence[];
    const storedWritingEntries = safeArray<Partial<WritingEntry>>(JSON.parse(window.localStorage.getItem(WRITING_STORAGE_KEY) || '[]')).map(normalizeWritingEntry).filter(Boolean) as WritingEntry[];
    const storedDiaries = safeArray<Partial<DiaryEntry>>(JSON.parse(window.localStorage.getItem(DIARY_STORAGE_KEY) || '[]')).map(normalizeDiaryEntry).filter(Boolean) as DiaryEntry[];
    const storedStories = safeArray<Partial<TodayStoryEntry>>(JSON.parse(window.localStorage.getItem(STORY_STORAGE_KEY) || '[]')).map(normalizeStoryEntry).filter(Boolean) as TodayStoryEntry[];
    const storedContentSources = safeArray<Partial<CustomContentSource>>(JSON.parse(window.localStorage.getItem(CONTENT_SOURCE_STORAGE_KEY) || '[]')).map(normalizeContentSource).filter(Boolean) as CustomContentSource[];

    const remoteData = await fetchLearningItems(userId);
    const mergedVocab = mergeById(storedVocab, remoteData.vocab);
    const mergedSentences = mergeById(storedSentences, remoteData.sentences);
    const mergedWritingEntries = mergeById(storedWritingEntries, remoteData.writingEntries);
    const mergedDiaries = mergeById(storedDiaries, remoteData.diaries);
    const mergedStories = mergeById(storedStories, remoteData.stories);
    const mergedContentSources = mergeById(storedContentSources, remoteData.contentSources);

    isApplyingCloudSnapshotRef.current = true;
    setVocabList(mergedVocab);
    setSentenceList(mergedSentences);
    setWritingEntries(mergedWritingEntries);
    setDiaryEntries(mergedDiaries);
    setStoryEntries(mergedStories);
    setContentSources(mergedContentSources);

    await Promise.all([
      replaceLearningItems(userId, 'vocab', mergedVocab),
      replaceLearningItems(userId, 'sentence', mergedSentences),
      replaceLearningItems(userId, 'writing_entry', mergedWritingEntries),
      replaceLearningItems(userId, 'diary', mergedDiaries),
      replaceLearningItems(userId, 'story', mergedStories),
      replaceLearningItems(userId, 'content_source', mergedContentSources),
    ]);
    isApplyingCloudSnapshotRef.current = false;
  };

  const queueUsageEvent = (eventType: string, payload: Record<string, unknown> = {}) => {
    if (!isSupabaseConfigured()) return;

    const event = {
      eventType,
      payload: {
        ...payload,
        language,
        clientAt: new Date().toISOString(),
      },
    };

    if (!cloudUserIdRef.current) {
      usageQueueRef.current = [...usageQueueRef.current.slice(-49), event];
      return;
    }

    void persistUsageEvent(cloudUserIdRef.current, event).catch((error) => {
      console.error('Failed to track usage event', error);
    });
  };

  const flushUsageQueue = async () => {
    if (!cloudUserIdRef.current || !usageQueueRef.current.length) return;

    const queued = [...usageQueueRef.current];
    usageQueueRef.current = [];

    for (const event of queued) {
      try {
        await persistUsageEvent(cloudUserIdRef.current, event);
      } catch (error) {
        console.error('Failed to flush usage queue', error);
      }
    }
  };

  const handleEmailLogin = async () => {
    const email = safeTrim(authEmail);
    if (!email) return;

    setIsAuthLoading(true);
    setAuthMessage('');

    try {
      await sendMagicLink(email);
      setIsOtpStage(true);
      setAuthMessage('Verification email sent. Enter the verification code from your email here to finish signing in on this device.');
    } catch (error) {
      console.error(error);
      setAuthMessage(error instanceof Error ? error.message : 'Failed to send login link');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleOtpVerify = async () => {
    const email = safeTrim(authEmail);
    const token = safeTrim(authOtp);
    if (!email || !token) return;

    setIsAuthLoading(true);
    setAuthMessage('');

    try {
      await verifyEmailOtp(email, token);
      setAuthMessage(`Signed in as ${email}`);
      setAuthOtp('');
    } catch (error) {
      console.error(error);
      setAuthMessage(error instanceof Error ? error.message : 'Failed to verify email code');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    setIsAuthLoading(true);
    setAuthMessage('');

    try {
      await signOutSupabase();
      setCurrentUserEmail(null);
      setIsEmailUser(false);
      const guestUser = await ensureSupabaseUser();
      if (guestUser) {
        cloudUserIdRef.current = guestUser.id;
        setCloudSyncStatus('synced');
        setCloudSyncMessage('Guest cloud synced');
      }
    } catch (error) {
      console.error(error);
      setAuthMessage(error instanceof Error ? error.message : 'Failed to sign out');
    } finally {
      setIsAuthLoading(false);
    }
  };

  const isSentenceSelection = (text: string) => safeTrim(text).split(/\s+/).filter(Boolean).length > 2;

  const addSelectionToNotebook = (text: string, sourceUrl?: string) => {
    if (isSentenceSelection(text)) {
      saveSentence(text, undefined, sourceUrl);
    } else {
      void addToVocab(text, '', sourceUrl);
    }
  };

  const addToVocab = async (word: string, context: string = '', sourceUrl?: string) => {
    const newItem: VocabItem = {
      id: Date.now().toString(),
      word,
      definition: 'Fetching...',
      chineseDefinition: '获取中...',
      contextSentence: context,
      contextSentenceZh: context ? '例句中文示意获取中...' : undefined,
      sourceUrl: safeTrim(sourceUrl) || dailyContent?.url || undefined,
      dateAdded: new Date().toISOString(),
      language,
    };
    setVocabList((prev) => [newItem, ...prev]);
    setSidebarOpen(true);
    setActiveTab('vocab');
    queueUsageEvent('save_vocab', { word, context, source: 'selection_or_manual' });

    try {
      const details = await AIService.generateVocabContext(word, language);
      setVocabList((prev) => prev.map((item) => (item.id === newItem.id ? { ...item, ...details } : item)));
    } catch (error) {
      console.error(error);
    }
  };

  const saveSentence = (text: string, source?: string, sourceUrl?: string) => {
    const newSentence: SavedSentence = {
      id: Date.now().toString(),
      text,
      source: source || dailyContent?.title || 'Manual',
      sourceUrl: safeTrim(sourceUrl) || dailyContent?.url || undefined,
      dateAdded: new Date().toISOString(),
      language,
    };
    setSentenceList((prev) => [newSentence, ...prev]);
    setSidebarOpen(true);
    setActiveTab('sentences');
    queueUsageEvent('save_sentence', { text, source: dailyContent?.title || 'Manual' });
  };

  const addManualDiary = () => {
    const content = safeTrim(manualDiaryInput);
    if (!content) return;

    const entry: DiaryEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      topic: manualDiaryTitle || notebookUiText.manualNote,
      title: manualDiaryTitle || notebookUiText.manualDiaryNote,
      content,
      sourceLabel: 'Model Essay',
      language,
    };

    setDiaryEntries((prev) => [entry, ...prev].slice(0, 50));
    setManualDiaryTitle('');
    setManualDiaryInput('');
    setActiveTab('diary');
    setSidebarOpen(true);
    queueUsageEvent('save_manual_diary', { title: entry.title });
  };

  const saveWritingEntry = () => {
    if (!safeTrim(writingInput)) return;

    const entry: WritingEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      topic: writingTopic || notebookUiText.freeWriting,
      original: writingInput,
      feedback: writingResult || {
        original: writingInput,
        corrected: writingInput,
        upgraded: writingInput,
        modelEssay: writingInput,
      },
      language,
    };

    setWritingEntries((prev) => [entry, ...prev].slice(0, 20));
    setDiaryEntries((prev) => [
      {
        id: `${entry.id}-draft`,
        date: entry.date,
        topic: entry.topic,
        title: `${notebookUiText.writingDraft} · ${entry.topic}`,
        content: writingResult?.corrected || writingInput,
        sourceLabel: writingResult ? 'Corrected' : 'Model Essay',
        language,
      },
      ...prev,
    ].slice(0, 50));
    setWritingSavedNotice(writingResult ? generalUiText.saveDiary : generalUiText.saveDraft);
    window.setTimeout(() => setWritingSavedNotice(''), 2200);
    queueUsageEvent('save_writing_entry', { topic: entry.topic });
  };

  const saveDiaryVariant = (sourceLabel: 'Corrected' | 'Pro Upgrade' | 'Model Essay', content: string) => {
    if (!safeTrim(content)) return;

    const entry: DiaryEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      topic: writingTopic || notebookUiText.freeWriting,
      title: `${formatDiarySourceLabel(sourceLabel)} · ${writingTopic || notebookUiText.freeWriting}`,
      content,
      sourceLabel,
      language,
    };

    setDiaryEntries((prev) => [entry, ...prev].slice(0, 50));
    setSidebarOpen(true);
    setActiveTab('diary');
    setWritingSavedNotice(`${formatDiarySourceLabel(sourceLabel)} · ${generalUiText.saveToDiary}`);
    window.setTimeout(() => setWritingSavedNotice(''), 2200);
    queueUsageEvent('save_diary_variant', { sourceLabel, topic: entry.topic });
  };

  const playNotebookPronunciation = async (text: string) => {
    const spoken = safeTrim(text);
    if (!spoken) return;

    try {
      await playNativeSpeech(spoken);
    } catch (error) {
      console.error(error);
      setNotebookNotice(notebookUiText.pronunciationFailed);
      window.setTimeout(() => setNotebookNotice(''), 2200);
    }
  };

  const getCurrentNotebookItems = () =>
    (activeTab === 'vocab' ? vocabList : activeTab === 'sentences' ? sentenceList : diaryEntries).filter(
      (item) => item && item.language === language
    );

  const getNotebookExportMarkdown = () => {
    const items = getCurrentNotebookItems();
    const groups = groupNotebookItemsByDate(items);
    const tabTitle = activeTab === 'vocab' ? labels.words : activeTab === 'sentences' ? labels.sentences : notebookUiText.diaryTab;
    const lines: string[] = [`# LinguaFlow ${tabTitle}`, '', `Language: ${language}`, `${notebookUiText.exportedAt}: ${new Date().toLocaleString()}`, ''];

    groups.forEach((group) => {
      lines.push(`## ${group.title || notebookUiText.unknownDate}`, '');
      group.items.forEach((item) => {
        if (activeTab === 'vocab') {
          const vocab = item as VocabItem;
          lines.push(`### ${vocab.word}`);
          lines.push(`- ${notebookUiText.chineseDefinition}：${vocab.chineseDefinition || '—'}`);
          lines.push(`- ${notebookUiText.targetDefinition}：${vocab.definition || '—'}`);
          if (safeTrim(vocab.contextSentence)) lines.push(`- ${notebookUiText.exampleSentence}：${vocab.contextSentence}`);
          if (safeTrim(vocab.contextSentenceZh)) lines.push(`- ${notebookUiText.chineseHint}：${vocab.contextSentenceZh}`);
          if (safeTrim(vocab.sourceUrl)) lines.push(`- ${notebookUiText.source}: ${vocab.sourceUrl}`);
          lines.push('');
          return;
        }

        if (activeTab === 'sentences') {
          const sentence = item as SavedSentence;
          lines.push(`### ${sentence.source || notebookUiText.savedSentence}`);
          lines.push(sentence.text);
          if (safeTrim(sentence.sourceUrl)) lines.push('', `${notebookUiText.source}: ${sentence.sourceUrl}`);
          lines.push('');
          return;
        }

        const diary = item as DiaryEntry;
        lines.push(`### ${diary.title}`);
        lines.push(`- ${notebookUiText.tag}：${formatDiarySourceLabel(diary.sourceLabel)}`);
        lines.push('', diary.content, '');
      });
    });

    return lines.join('\n').trim();
  };

  const copyNotebookExport = async () => {
    const markdown = getNotebookExportMarkdown();
    try {
      await navigator.clipboard.writeText(markdown);
      setNotebookNotice(notebookUiText.copiedNotice);
      window.setTimeout(() => setNotebookNotice(''), 2200);
    } catch (error) {
      console.error(error);
      setNotebookNotice(notebookUiText.copyFailed);
      window.setTimeout(() => setNotebookNotice(''), 2200);
    }
  };

  const downloadNotebookExport = () => {
    const markdown = getNotebookExportMarkdown();
    const tabTitle = activeTab === 'vocab' ? 'words' : activeTab === 'sentences' ? 'sentences' : 'diary';
    const filename = `linguaflow-${tabTitle}-${language.toLowerCase()}-${new Date().toISOString().slice(0, 10)}.md`;
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setNotebookNotice(notebookUiText.downloadedNotice);
    window.setTimeout(() => setNotebookNotice(''), 2200);
  };

  const storyModeMeta: Record<TodayStoryMode, { title: string; description: string }> =
    language === 'French'
      ? {
          zh: { title: 'Je commence en chinois', description: 'Pour celles et ceux qui n’osent pas encore parler, afin de raconter d’abord l’histoire sans pression.' },
          mixed: { title: 'Je parle en chinois + anglais', description: 'Pour celles et ceux qui peuvent déjà dire un peu d’anglais mais passent naturellement au chinois.' },
          en: { title: 'Je tente en anglais', description: 'Pour te challenger et raconter clairement un événement du jour en anglais.' },
        }
      : language === 'Japanese'
        ? {
            zh: { title: 'まず中国語で話す', description: 'まだ口を開くのが不安なときに、まず今日の出来事を順番に話すためのモードです。' },
            mixed: { title: '中国語と英語を混ぜて話す', description: '少し英語は出るけれど、自然に中国語も混ざる人向けです。' },
            en: { title: '英語だけで話してみる', description: '少し背伸びして、今日の出来事を英語で伝える練習をしたい人向けです。' },
          }
        : {
            zh: { title: '我先用中文讲', description: '适合完全不敢开口，先把今天的事情讲顺。' },
            mixed: { title: '我用中英夹杂讲', description: '适合已经能说一点英语，但会自然夹中文。' },
            en: { title: '我尝试全英文讲', description: '适合想挑战自己，用英文讲清楚今天的一件事。' },
          };

  const storyModeLabel = (value: TodayStoryMode) => storyModeMeta[value].title;

  const getFreeTalkDefaults = () => {
    if (language === 'French') {
      return {
        opener: 'Salut, je suis là. Comment se passe ta journée ?',
        quickReplies: [
          'Parle-moi de ta journée.',
          'Qu’est-ce que tu fais maintenant ?',
          'Qu’est-ce qui t’a fait sourire aujourd’hui ?',
        ],
      };
    }

    if (language === 'Japanese') {
      return {
        opener: 'こんにちは。今日はどんな一日でしたか？',
        quickReplies: [
          '今日のことを少し話してみて。',
          '今は何をしていますか？',
          '今日は何が一番印象に残りましたか？',
        ],
      };
    }

    return {
      opener: 'Hey, I am here. How was your day today?',
      quickReplies: [
        'Tell me about your day.',
        'What are you doing right now?',
        'What made you smile today?',
      ],
    };
  };

  const beginFreeTalk = async () => {
    const defaults = getFreeTalkDefaults();
    const opener: FreeTalkMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      text: defaults.opener,
    };

    setSpeakingTrack('chat');
    setFreeTalkMessages([opener]);
    setFreeTalkInput('');
    setFreeTalkCorrection('');
    setStoryNotice('');
    setErrorMsg(null);
    setSpeechDraft('');
    setFreeTalkQuickReplies(defaults.quickReplies);
    queueUsageEvent('free_talk_started', { language });
    await playGeneratedSpeech(opener.text);
  };

  const enterFreeTalkMode = async () => {
    setIsLaunchingSpeaking(true);
    setErrorMsg(null);
    setMode(AppMode.SPEAKING);
    setStoryStage('choose_mode');
    setStoryTranscript('');
    setStoryResult(null);
    setStoryNotice('');
    stopCurrentSpeechPlayback();

    try {
      await beginFreeTalk();
    } catch (error) {
      console.error(error);
      setErrorMsg('现在没能顺利打开 Free Talk，你再点一次试试。');
      setMode(AppMode.DASHBOARD);
    } finally {
      setIsLaunchingSpeaking(false);
    }
  };

  const openStoryLibrary = () => {
    setMode(AppMode.STORY_LIBRARY);
    setSelectedStoryId((prev) => prev || storyEntries[0]?.id || null);
  };

  const startStoryMode = (nextMode: TodayStoryMode) => {
    setSpeakingTrack('story');
    setStoryMode(nextMode);
    setStoryStage('record');
    setStoryTranscript('');
    setStoryResult(null);
    setStoryNotice('');
    setErrorMsg(null);
    setSpeechDraft('');
    stopCurrentSpeechPlayback();
    queueUsageEvent('today_story_mode_selected', { mode: nextMode });
  };

  const saveTodayStory = (result: TodayStoryResult, transcript: string) => {
    const entry: TodayStoryEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      title: safeTrim(result.title) || 'Untitled story',
      mode: storyMode,
      originalText: safeTrim(transcript) || safeTrim(result.original),
      rewrittenText: safeTrim(result.rewritten),
      keyPhrases: safeArray<StoryPhrase>(result.keyPhrases).slice(0, 3),
      comment: safeTrim(result.comment) || undefined,
      tags: safeArray<string>(result.tags).slice(0, 4),
      language,
    };

    setStoryEntries((prev) => [entry, ...prev.filter((item) => item.id !== entry.id)].slice(0, 200));
    setSelectedStoryId(entry.id);
    setStoryNotice('已自动保存到你的故事库。');
    window.setTimeout(() => setStoryNotice(''), 2200);
    queueUsageEvent('today_story_saved', { mode: entry.mode, title: entry.title });
  };

  const handleGenerateTodayStory = async () => {
    const transcript = safeTrim(storyTranscript);
    if (!transcript) return;

    setIsStoryGenerating(true);
    setErrorMsg(null);
    try {
      const result = await AIService.generateTodayStory(transcript, storyMode, language);
      setStoryResult(result);
      setStoryStage('result');
      saveTodayStory(result, transcript);
      queueUsageEvent('today_story_generated', { mode: storyMode, length: transcript.length });
    } catch (error) {
      console.error(error);
      setErrorMsg(error instanceof Error ? error.message : '生成今天的故事失败了，请再试一次。');
    } finally {
      setIsStoryGenerating(false);
    }
  };

  const handleSubmitFreeTalk = async (messageOverride?: string) => {
    const nextText = safeTrim(messageOverride ?? freeTalkInput);
    if (!nextText || isFreeTalkLoading) return;

    const userMessage: FreeTalkMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: nextText,
    };
    const nextHistory = [...freeTalkMessages, userMessage];

    const turnId = Date.now();
    freeTalkTurnIdRef.current = turnId;
    setFreeTalkMessages(nextHistory);
    setFreeTalkInput('');
    setSpeechDraft('');
    setFreeTalkCorrection('');
    setFreeTalkImprovements([]);
    setIsFreeTalkLoading(true);
    setErrorMsg(null);

    try {
      const result: FreeTalkReply = await AIService.generateFreeTalkReply(language, nextHistory, nextText);
      if (freeTalkTurnIdRef.current !== turnId) {
        return;
      }
      const assistantText = [safeTrim(result.reply), safeTrim(result.followUp)].filter(Boolean).join(' ');
      if (assistantText) {
        setFreeTalkMessages((prev) => [
          ...prev,
          {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            text: assistantText,
          },
        ]);
        await playGeneratedSpeech(assistantText);
      }
      setFreeTalkQuickReplies(safeArray<string>(result.quickReplies).map((item) => safeTrim(item)).filter(Boolean).slice(0, 3));
      setFreeTalkCorrection(safeTrim(result.correction));
      setFreeTalkImprovements(
        safeArray<string>(result.improvements)
          .map((item) => safeTrim(item))
          .filter(Boolean)
          .slice(0, 2)
      );
      queueUsageEvent('free_talk_turn', { length: nextText.length });
    } catch (error) {
      console.error(error);
      if (freeTalkTurnIdRef.current !== turnId) {
        return;
      }
      setErrorMsg(error instanceof Error ? error.message : 'Free Talk 现在有点忙，你可以先手动输入继续练。');
    } finally {
      if (freeTalkTurnIdRef.current === turnId) {
        setIsFreeTalkLoading(false);
      }
    }
  };

  const copyStoryText = async (value: string) => {
    if (!safeTrim(value)) return;
    try {
      await navigator.clipboard.writeText(value);
      setStoryNotice('优化后的故事已复制。');
      window.setTimeout(() => setStoryNotice(''), 1800);
    } catch (error) {
      console.error(error);
      setStoryNotice('复制失败，请手动复制。');
      window.setTimeout(() => setStoryNotice(''), 1800);
    }
  };

  const generateClipperToken = async () => {
    try {
      setIsGeneratingClipperToken(true);
      setClipperTokenMessage('');

      const accessToken = await getSupabaseAccessToken();
      if (!accessToken) {
        throw new Error('请先重新登录，再生成插件连接码。');
      }

      const response = await fetch('/api/clipper/token', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || typeof data?.clipperToken !== 'string') {
        throw new Error(typeof data?.error === 'string' ? data.error : '生成插件连接码失败');
      }

      setClipperToken(data.clipperToken);
      setClipperTokenMessage('插件连接码已生成，复制到 Chrome 插件里就能直接保存。');
    } catch (error) {
      setClipperTokenMessage(error instanceof Error ? error.message : '生成插件连接码失败');
    } finally {
      setIsGeneratingClipperToken(false);
    }
  };

  const copyClipperToken = async () => {
    if (!clipperToken) return;
    try {
      await navigator.clipboard.writeText(clipperToken);
      setClipperTokenMessage('插件连接码已复制。');
    } catch {
      setClipperTokenMessage('复制失败，请手动复制。');
    }
  };

  const addContentSource = () => {
    const name = safeTrim(sourceNameInput);
    const url = safeTrim(sourceUrlInput);
    if (!name || !url) return;

    const nextSource: CustomContentSource = {
      id: Date.now().toString(),
      name,
      url,
      type: sourceTypeInput,
      description: safeTrim(sourceDescriptionInput) || undefined,
      dateAdded: new Date().toISOString(),
      language,
    };

    setContentSources((prev) => [nextSource, ...prev.filter((item) => item.url !== nextSource.url || item.language !== language)].slice(0, 100));
    setSourceNameInput('');
    setSourceUrlInput('');
    setSourceDescriptionInput('');
    setSourceTypeInput('both');
    queueUsageEvent('save_content_source', { name, type: nextSource.type });
  };

  const removeContentSource = (id: string) => {
    setContentSources((prev) => prev.filter((item) => item.id !== id));
    queueUsageEvent('remove_content_source', { id });
  };

  const openSecondaryModule = (target: 'listening' | 'reading' | 'writing' | 'exams') => {
    if (target === 'listening') {
      setMode(AppMode.LISTENING);
      void loadDailyContent('listening');
      return;
    }
    if (target === 'reading') {
      setMode(AppMode.READING);
      void loadDailyContent('reading');
      return;
    }
    if (target === 'writing') {
      setMode(AppMode.WRITING);
      return;
    }
    setMode(AppMode.EXAM_PORTAL);
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionRect(null);
      return;
    }

    const text = safeTrim(selection.toString());
    if (text.length > 0 && text.length < 150) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setSelectionRect(rect);
      setSelectedText(text);
    } else {
      setSelectionRect(null);
    }
  };

  const loadDailyContent = async (type: 'reading' | 'listening') => {
    setDailyContent(null);
    const customSourcesForType = contentSources.filter(
      (item) => item.language === language && (item.type === type || item.type === 'both')
    );
    try {
      if (type === 'reading') {
        const data = await AIService.getReadingSuggestions(
          'Intermediate',
          language,
          customSourcesForType,
          seenReadingTitles,
          dailyContent?.url ? [...seenReadingUrls, dailyContent.url] : seenReadingUrls
        );
        const nextItem = Array.isArray(data) ? normalizeDailyContent(data.find(Boolean) || null) : null;
        if (!nextItem) {
          const fallback = buildLocalFallbackContent('reading', language, languageSourceHints.readingNames);
          setDailyContent(fallback);
          return;
        }
        setDailyContent(nextItem);
        setSeenReadingTitles((prev) => [...prev, nextItem.title || 'Untitled reading']);
        setSeenReadingUrls((prev) => [...prev, nextItem.url || '']);
        queueUsageEvent('open_reading_content', { title: nextItem.title || 'Untitled reading', source: nextItem.source || 'Unknown source' });
      } else {
        const data = normalizeDailyContent(
          await AIService.getDailyListeningContent(
            language,
            seenListeningTitles,
            customSourcesForType,
            dailyContent?.url ? [...seenListeningUrls, dailyContent.url] : seenListeningUrls
          )
        );
        if (!data) {
          const fallback = buildLocalFallbackContent('listening', language, languageSourceHints.listeningNames);
          setDailyContent(fallback);
          return;
        }
        setDailyContent(data);
        setSeenListeningTitles((prev) => [...prev, data.title || 'Untitled listening']);
        setSeenListeningUrls((prev) => [...prev, data.url || '']);
        queueUsageEvent('open_listening_content', { title: data.title || 'Untitled listening', source: data.source || 'Unknown source' });
      }
    } catch (error) {
      console.error(error);
      const fallback =
        type === 'reading'
          ? buildLocalFallbackContent('reading', language, languageSourceHints.readingNames)
          : buildLocalFallbackContent('listening', language, languageSourceHints.listeningNames);
      setDailyContent(fallback);
    }
  };

  const handleTTS = async () => {
    if (!dailyContent?.content) return;

    setIsTTSLoading(true);
    queueUsageEvent('play_tts', { title: dailyContent.title || 'Untitled content', source: dailyContent.source || 'Unknown source' });
    try {
      await playGeneratedSpeech(dailyContent.content);
    } catch (error) {
      console.error('TTS failed', error);
    } finally {
      setIsTTSLoading(false);
    }
  };

  const handleToggleTTSPlayback = async () => {
    if (!dailyContent?.content) return;

    if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setIsPlaybackPaused(false);
        setIsPlaybackActive(true);
      } else {
        window.speechSynthesis.pause();
        setIsPlaybackPaused(true);
        setIsPlaybackActive(false);
      }
      return;
    }

    if (currentAudioRef.current) {
      if (currentAudioRef.current.paused) {
        await currentAudioRef.current.play().catch((error) => {
          console.error('Audio resume failed', error);
        });
        setIsPlaybackPaused(false);
        setIsPlaybackActive(true);
      } else {
        currentAudioRef.current.pause();
        setIsPlaybackPaused(true);
        setIsPlaybackActive(false);
      }
      return;
    }

    await handleTTS();
  };

  const handleWritingSubmit = async () => {
    if (!safeTrim(writingInput)) return;
    setIsWritingLoading(true);
    try {
      const feedback = await AIService.analyzeWriting(writingInput, language);
      setWritingResult(feedback);
      queueUsageEvent('writing_feedback', { topic: writingTopic || 'Free writing' });
    } finally {
      setIsWritingLoading(false);
    }
  };

  const isAudioCaptureSupported = () => typeof window !== 'undefined' && 'AudioContext' in window && !!navigator.mediaDevices?.getUserMedia;

  const stopMediaStream = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const clearSilenceTimer = () => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  };

  const clearRecordingTimer = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    recordingStartedAtRef.current = null;
  };

  const stopCurrentSpeechPlayback = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
    setIsPlaybackActive(false);
    setIsPlaybackPaused(false);
  };

  const stopRecorder = async () => {
    clearSilenceTimer();
    clearRecordingTimer();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) return;

    recorder.processor.onaudioprocess = null;
    recorder.source.disconnect();
    recorder.processor.disconnect();
    recorder.zeroGain.disconnect();
    await recorder.audioContext.close();
  };

  const encodeWavBase64 = (samples: Float32Array, sampleRate: number) => {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, value: string) => {
      for (let index = 0; index < value.length; index += 1) {
        view.setUint8(offset + index, value.charCodeAt(index));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let index = 0; index < samples.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, samples[index]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let index = 0; index < bytes.length; index += 1) {
      binary += String.fromCharCode(bytes[index]);
    }
    return btoa(binary);
  };

  const getRecordedSamples = () => {
    const totalLength = recordedChunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    recordedChunksRef.current.forEach((chunk) => {
      combined.set(chunk, offset);
      offset += chunk.length;
    });
    return combined;
  };

  const splitSamplesForTranscription = (samples: Float32Array, sampleRate: number, maxSeconds = 24) => {
    const segmentLength = Math.max(sampleRate * maxSeconds, sampleRate * 4);
    if (samples.length <= segmentLength) {
      return [samples];
    }

    const segments: Float32Array[] = [];
    for (let offset = 0; offset < samples.length; offset += segmentLength) {
      segments.push(samples.slice(offset, Math.min(offset + segmentLength, samples.length)));
    }
    return segments;
  };

  const transcribeRecordedAudio = async (asrLanguage: string) => {
    const samples = getRecordedSamples();
    if (!samples.length) {
      return '';
    }

    const segments = splitSamplesForTranscription(samples, recordingSampleRateRef.current);
    const transcripts: string[] = [];

    for (let index = 0; index < segments.length; index += 1) {
      if (segments.length > 1) {
        setSpeechDraft(`${freeTalkUiText.transcribingPart} ${index + 1}/${segments.length}...`);
      } else {
        setSpeechDraft(freeTalkUiText.transcribing);
      }

      const audioBase64 = encodeWavBase64(segments[index], recordingSampleRateRef.current);
      const { transcript } = await AIService.transcribeSpeech(audioBase64, recordingSampleRateRef.current, asrLanguage);
      const finalText = safeTrim(transcript);
      if (finalText) {
        transcripts.push(finalText);
      }
    }

    return transcripts.join('\n').trim();
  };

  const pickPreferredNativeVoice = () => {
    if (!('speechSynthesis' in window)) return null;

    const targetLang = language === 'French' ? 'fr' : language === 'Japanese' ? 'ja' : 'en';
    const voices = window.speechSynthesis
      .getVoices()
      .filter((voice) => voice.lang.toLowerCase().startsWith(targetLang));

    if (!voices.length) return null;

    const preferredNames =
      targetLang === 'en'
        ? ['Microsoft Aria', 'Samantha', 'Ava', 'Victoria', 'Karen', 'Allison', 'Jenny', 'Emma', 'Google US English']
        : targetLang === 'fr'
          ? ['Amelie', 'Denise', 'Google francais']
          : ['Kyoko', 'Nanami', 'Otoya'];

    return (
      voices.find((voice) => preferredNames.some((name) => voice.name.includes(name))) ||
      voices.find((voice) => /female|woman|girl/i.test(voice.name)) ||
      voices[0]
    );
  };

  const shapeSpokenText = (text: string) => {
    const normalized = safeTrim(text)
      .replace(/\s+/g, ' ')
      .replace(/([.!?])(?=\S)/g, '$1 ')
      .trim();

    if (!normalized) return normalized;

    return normalized
      .replace(/,\s+/g, ', ')
      .replace(/\.\s+/g, '. ')
      .replace(/\?\s+/g, '? ')
      .replace(/!\s+/g, '! ');
  };

  const playNativeSpeech = (text: string) =>
    new Promise<void>((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('Native speech synthesis is unavailable'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language === 'French' ? 'fr-FR' : language === 'Japanese' ? 'ja-JP' : 'en-US';
      utterance.voice = pickPreferredNativeVoice();
      utterance.rate = language === 'English' ? 1.03 : 0.98;
      utterance.pitch = language === 'English' ? 1.18 : 1.05;
      utterance.volume = 1;
      utterance.onstart = () => {
        setIsPlaybackActive(true);
        setIsPlaybackPaused(false);
      };
      utterance.onend = () => {
        setIsPlaybackActive(false);
        setIsPlaybackPaused(false);
        resolve();
      };
      utterance.onerror = () => {
        setIsPlaybackActive(false);
        setIsPlaybackPaused(false);
        reject(new Error('Native speech playback failed'));
      };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });

  const playGeneratedSpeech = async (text: string) => {
    if (!isVoiceOutputEnabled || !safeTrim(text)) return;
    const spokenText = shapeSpokenText(text);

    try {
      await playNativeSpeech(spokenText);
      return;
    } catch (nativeError) {
      console.error('Native speech playback failed', nativeError);
    }

    try {
      stopCurrentSpeechPlayback();
      const { audioBase64, mimeType } = await AIService.synthesizeSpeech(spokenText, 'sambert-eva-v1');
      const binary = Uint8Array.from(atob(audioBase64), (char) => char.charCodeAt(0));
      const blob = new Blob([binary], { type: mimeType || 'audio/mpeg' });
      const objectUrl = URL.createObjectURL(blob);
      const audio = new Audio(objectUrl);
      currentAudioRef.current = audio;
      currentAudioUrlRef.current = objectUrl;
      audio.onplay = () => {
        setIsPlaybackActive(true);
        setIsPlaybackPaused(false);
      };
      audio.onpause = () => {
        if (currentAudioRef.current) {
          setIsPlaybackPaused(true);
          setIsPlaybackActive(false);
        }
      };
      audio.onended = () => stopCurrentSpeechPlayback();
      await audio.play();
    } catch (error) {
      console.error('Voice playback failed', error);
    }
  };

  const endSpeakingSession = (reason: 'user_exit' | 'timeout') => {
    void stopRecorder();
    stopMediaStream();
    stopCurrentSpeechPlayback();
    setIsListening(false);
    setRecordingDurationSec(0);
    setSpeechDraft('');
    setSpeakingTrack(null);
    speechDetectedRef.current = false;
    freeTalkTurnIdRef.current = Date.now();
    setFreeTalkMessages([]);
    setFreeTalkInput('');
    setFreeTalkCorrection('');
    setFreeTalkQuickReplies(getFreeTalkDefaults().quickReplies);
    setStoryStage('choose_mode');
    setStoryTranscript('');
    setStoryResult(null);
    setMode(AppMode.DASHBOARD);
    queueUsageEvent('today_story_session_end', { reason });
  };

  const enterSpeakingMode = async () => {
    setIsLaunchingSpeaking(true);
    setErrorMsg(null);
    setSpeakingTrack(null);
    setStoryStage('choose_mode');
    setStoryTranscript('');
    setStoryResult(null);
    setStoryNotice('');
    stopCurrentSpeechPlayback();

    try {
      setMode(AppMode.SPEAKING);
      queueUsageEvent('today_story_session_start', { stage: 'choose_mode' });
    } catch (error) {
      console.error(error);
      setErrorMsg('We could not open the speaking space right now.');
      setMode(AppMode.DASHBOARD);
    } finally {
      setIsLaunchingSpeaking(false);
    }
  };

  const stopVoiceInput = async (completion: 'story_pause' | 'story_finish' | 'chat' = 'chat') => {
    const hasRecording = recordedChunksRef.current.length > 0;
    holdTriggeredRef.current = false;
    clearSilenceTimer();
    speechDetectedRef.current = false;
    setIsListening(false);
    setRecordingDurationSec(0);
    setSpeechDraft(hasRecording ? freeTalkUiText.transcribing : '');

    await stopRecorder();

    if (!hasRecording) {
      setSpeechDraft('');
      return;
    }

    try {
      const asrLanguage =
        mode === AppMode.SPEAKING
          ? speakingTrack === 'story'
            ? storyMode === 'en'
              ? language
              : 'Chinese'
            : language
          : language;
      const finalText = await transcribeRecordedAudio(asrLanguage);
      setSpeechDraft('');
      recordedChunksRef.current = [];
      if (finalText) {
        if (mode === AppMode.SPEAKING) {
          if (speakingTrack === 'story') {
            setStoryTranscript((prev) => [safeTrim(prev), finalText].filter(Boolean).join('\n\n'));
            if (completion === 'story_finish') {
              setStoryStage('review');
            }
          } else if (speakingTrack === 'chat') {
            setFreeTalkInput((prev) => [safeTrim(prev), finalText].filter(Boolean).join(' ').trim());
            setSpeechDraft(freeTalkUiText.transcriptReady);
          }
        }
      }
    } catch (error) {
      console.error(error);
      recordedChunksRef.current = [];
      setSpeechDraft('');
      const message = error instanceof Error ? error.message : '语音输入暂时不可用。你可以重试一次，或者先在下面打字继续。';
      if (/arrearage|access denied|overdue-payment/i.test(message)) {
        setErrorMsg('语音输入暂时不可用，应该是当前语音识别账号出了问题。你可以先在下面打字，练习不会中断。');
      } else {
        setErrorMsg(`Voice input issue: ${message}`);
      }
    }
  };

  const startVoiceInput = async () => {
    if (!isAudioCaptureSupported()) {
      setErrorMsg('This browser does not support voice input. Please type instead.');
      return;
    }
    if (isListening) return;

    if (mode === AppMode.SPEAKING && speakingTrack === 'chat') {
      stopCurrentSpeechPlayback();
      freeTalkTurnIdRef.current = Date.now();
      setIsFreeTalkLoading(false);
      speechDetectedRef.current = false;
    }

    if (!mediaStreamRef.current) {
      try {
        mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (error) {
        console.error(error);
        setErrorMsg('Microphone access is needed to start voice input.');
        return;
      }
    }

    const AudioContextApi = window.AudioContext;
    const audioContext = new AudioContextApi();
    const source = audioContext.createMediaStreamSource(mediaStreamRef.current);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const zeroGain = audioContext.createGain();
    zeroGain.gain.value = 0;

    recordedChunksRef.current = [];
    recordingSampleRateRef.current = audioContext.sampleRate;
    speechDetectedRef.current = false;
    processor.onaudioprocess = (event) => {
      const channelData = event.inputBuffer.getChannelData(0);
      recordedChunksRef.current.push(new Float32Array(channelData));
    };

    source.connect(processor);
    processor.connect(zeroGain);
    zeroGain.connect(audioContext.destination);

    recorderRef.current = {
      audioContext,
      source,
      processor,
      zeroGain,
    };

    clearRecordingTimer();
    recordingStartedAtRef.current = Date.now();
    setRecordingDurationSec(0);
    recordingTimerRef.current = window.setInterval(() => {
      if (!recordingStartedAtRef.current) return;
      const seconds = Math.max(0, Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
      setRecordingDurationSec(seconds);
    }, 1000);

    setErrorMsg(null);
    setIsListening(true);
    setSpeechDraft(
      mode === AppMode.SPEAKING
        ? speakingTrack === 'chat'
          ? freeTalkUiText.recording
          : '正在录音，讲讲今天发生的一件事...'
        : 'Listening...'
    );

    if (mode === AppMode.SPEAKING && speakingTrack === 'chat') {
      processor.onaudioprocess = (event) => {
        const channelData = event.inputBuffer.getChannelData(0);
        recordedChunksRef.current.push(new Float32Array(channelData));

        let energy = 0;
        for (let index = 0; index < channelData.length; index += 1) {
          energy += channelData[index] * channelData[index];
        }
        const rms = Math.sqrt(energy / channelData.length);
        if (rms > 0.015) {
          speechDetectedRef.current = true;
        }
      };
      return;
    }
  };

  useEffect(() => {
    setSpeechSupported(isAudioCaptureSupported());
  }, []);

  useEffect(() => {
    try {
      const storedVocab = window.localStorage.getItem(VOCAB_STORAGE_KEY);
      const storedSentences = window.localStorage.getItem(SENTENCE_STORAGE_KEY);
      const stored = window.localStorage.getItem(WRITING_STORAGE_KEY);
      const storedDiaries = window.localStorage.getItem(DIARY_STORAGE_KEY);
      const storedStories = window.localStorage.getItem(STORY_STORAGE_KEY);
      const storedContentSources = window.localStorage.getItem(CONTENT_SOURCE_STORAGE_KEY);
      const storedReminder = window.localStorage.getItem(STORY_REMINDER_KEY);
      if (storedVocab) {
        setVocabList(safeArray<Partial<VocabItem>>(JSON.parse(storedVocab)).map(normalizeVocabItem).filter(Boolean) as VocabItem[]);
      }
      if (storedSentences) {
        setSentenceList(safeArray<Partial<SavedSentence>>(JSON.parse(storedSentences)).map(normalizeSentenceItem).filter(Boolean) as SavedSentence[]);
      }
      if (stored) {
        setWritingEntries(safeArray<Partial<WritingEntry>>(JSON.parse(stored)).map(normalizeWritingEntry).filter(Boolean) as WritingEntry[]);
      }
      if (storedDiaries) {
        setDiaryEntries(safeArray<Partial<DiaryEntry>>(JSON.parse(storedDiaries)).map(normalizeDiaryEntry).filter(Boolean) as DiaryEntry[]);
      }
      if (storedStories) {
        setStoryEntries(safeArray<Partial<TodayStoryEntry>>(JSON.parse(storedStories)).map(normalizeStoryEntry).filter(Boolean) as TodayStoryEntry[]);
      }
      if (storedContentSources) {
        setContentSources(safeArray<Partial<CustomContentSource>>(JSON.parse(storedContentSources)).map(normalizeContentSource).filter(Boolean) as CustomContentSource[]);
      }
      if (storedReminder) {
        setStoryReminder(storedReminder);
      }
    } catch (error) {
      console.error('Failed to load notebook entries', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const clipText = safeTrim(params.get('clipText'));
    const clipType = safeTrim(params.get('clipType'));
    const clipSource = safeTrim(params.get('clipSource')) || 'Web Clip';
    const clipUrl = safeTrim(params.get('clipUrl'));
    if (!clipText || (clipType !== 'word' && clipType !== 'sentence')) {
      return;
    }

    if (clipType === 'word') {
      void addToVocab(clipText, clipSource, clipUrl);
      setStoryNotice(`已从浏览器插件保存单词：${clipText}`);
      setActiveTab('vocab');
    } else {
      saveSentence(clipText, clipSource, clipUrl);
      setStoryNotice('已从浏览器插件保存句子。');
      setActiveTab('sentences');
    }
    setSidebarOpen(true);
    window.setTimeout(() => setStoryNotice(''), 2200);

    params.delete('clipText');
    params.delete('clipType');
    params.delete('clipSource');
    params.delete('clipUrl');
    const nextQuery = params.toString();
    const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
    window.history.replaceState({}, '', nextUrl);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VOCAB_STORAGE_KEY, JSON.stringify(vocabList));
      window.localStorage.setItem(SENTENCE_STORAGE_KEY, JSON.stringify(sentenceList));
      window.localStorage.setItem(WRITING_STORAGE_KEY, JSON.stringify(writingEntries));
      window.localStorage.setItem(DIARY_STORAGE_KEY, JSON.stringify(diaryEntries));
      window.localStorage.setItem(STORY_STORAGE_KEY, JSON.stringify(storyEntries));
      window.localStorage.setItem(CONTENT_SOURCE_STORAGE_KEY, JSON.stringify(contentSources));
      window.localStorage.setItem(STORY_REMINDER_KEY, storyReminder);
    } catch (error) {
      console.error('Failed to save notebook entries', error);
    }
  }, [vocabList, sentenceList, writingEntries, diaryEntries, storyEntries, contentSources, storyReminder]);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setCloudSyncStatus('local');
      setCloudSyncMessage('Local notebook');
      return;
    }

    let cancelled = false;

    const bootstrapCloud = async () => {
      setCloudSyncStatus('connecting');
      setCloudSyncMessage('Connecting cloud notebook...');

      try {
        const user = await getSupabaseUser();
        if (!user?.email) {
          if (!cancelled) {
            setCloudSyncStatus('local');
            setCloudSyncMessage('Sign in to sync');
            setIsEmailUser(false);
            setCurrentUserEmail(null);
            setIsAuthModalOpen(true);
            setIsAuthChecked(true);
          }
          return;
        }

        cloudUserIdRef.current = user.id;
        setCurrentUserEmail(user.email ?? null);
        setIsEmailUser(true);

        await applyCloudSnapshot(user.id);

        hasBootstrappedCloudRef.current = true;
        await flushUsageQueue();
        if (!cancelled) {
          setCloudSyncStatus('synced');
          setCloudSyncMessage('Signed in and synced');
          setIsAuthChecked(true);
          setAuthMessage(`Signed in as ${user.email}`);
        }
      } catch (error) {
        console.error('Supabase bootstrap failed', error);
        if (!cancelled) {
          setCloudSyncStatus('error');
          setCloudSyncMessage('Cloud reconnecting...');
          setIsAuthChecked(true);
        }
      }
    };

    void bootstrapCloud();

    const subscription = subscribeToAuthChanges((event, session) => {
      const user = session?.user ?? null;
      setCurrentUserEmail(user?.email ?? null);
      setIsEmailUser(Boolean(user?.email));

      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && user?.email) {
        cloudUserIdRef.current = user.id;
        setCloudSyncStatus('connecting');
        setCloudSyncMessage('Linking your notebook...');
        void applyCloudSnapshot(user.id)
          .then(() => flushUsageQueue())
          .then(() => {
            hasBootstrappedCloudRef.current = true;
            setCloudSyncStatus('synced');
            setCloudSyncMessage('Signed in and synced');
            setAuthMessage(`Signed in as ${user.email}`);
            setIsAuthModalOpen(false);
            setIsAuthChecked(true);
          })
          .catch((error) => {
            console.error('Auth sync failed', error);
            setCloudSyncStatus('error');
            setCloudSyncMessage('Cloud reconnecting...');
            setAuthMessage(error instanceof Error ? error.message : 'Failed to sync after sign-in');
            setIsAuthChecked(true);
          });
      }

      if (event === 'SIGNED_OUT') {
        cloudUserIdRef.current = null;
        hasBootstrappedCloudRef.current = false;
        setCurrentUserEmail(null);
        setIsEmailUser(false);
        setCloudSyncStatus('local');
        setCloudSyncMessage('Sign in to sync');
        setIsAuthModalOpen(true);
        setIsAuthChecked(true);
        setIsOtpStage(false);
        setAuthOtp('');
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!cloudUserIdRef.current || !hasBootstrappedCloudRef.current || isApplyingCloudSnapshotRef.current) {
      return;
    }

    if (syncTimerRef.current) {
      clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      if (!cloudUserIdRef.current) return;

      setCloudSyncStatus('syncing');
      setCloudSyncMessage('Syncing...');

      Promise.all([
        replaceLearningItems(cloudUserIdRef.current, 'vocab', vocabList),
        replaceLearningItems(cloudUserIdRef.current, 'sentence', sentenceList),
        replaceLearningItems(cloudUserIdRef.current, 'writing_entry', writingEntries),
        replaceLearningItems(cloudUserIdRef.current, 'diary', diaryEntries),
        replaceLearningItems(cloudUserIdRef.current, 'story', storyEntries),
        replaceLearningItems(cloudUserIdRef.current, 'content_source', contentSources),
      ])
        .then(() => {
          setCloudSyncStatus('synced');
          setCloudSyncMessage('Cloud synced');
        })
        .catch((error) => {
          console.error('Cloud sync failed', error);
          setCloudSyncStatus('error');
          setCloudSyncMessage('Cloud reconnecting...');
        });
    }, 500);

    return () => {
      if (syncTimerRef.current) {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [vocabList, sentenceList, writingEntries, diaryEntries, storyEntries, contentSources]);

  useEffect(() => {
    if (cloudRetryTimerRef.current) {
      clearTimeout(cloudRetryTimerRef.current);
      cloudRetryTimerRef.current = null;
    }

    if (cloudSyncStatus !== 'error' || !cloudUserIdRef.current || !isEmailUser) {
      return;
    }

    cloudRetryTimerRef.current = window.setTimeout(() => {
      if (!cloudUserIdRef.current) return;
      setCloudSyncStatus('connecting');
      setCloudSyncMessage('Retrying cloud sync...');
      void applyCloudSnapshot(cloudUserIdRef.current)
        .then(() => flushUsageQueue())
        .then(() => {
          hasBootstrappedCloudRef.current = true;
          setCloudSyncStatus('synced');
          setCloudSyncMessage('Signed in and synced');
        })
        .catch((error) => {
          console.error('Cloud retry failed', error);
          setCloudSyncStatus('error');
          setCloudSyncMessage('Cloud reconnecting...');
        });
    }, 12000);

    return () => {
      if (cloudRetryTimerRef.current) {
        clearTimeout(cloudRetryTimerRef.current);
        cloudRetryTimerRef.current = null;
      }
    };
  }, [cloudSyncStatus, isEmailUser]);

  useEffect(() => {
    if (mode !== AppMode.SPEAKING) {
      void stopRecorder();
      stopMediaStream();
      setIsListening(false);
      stopCurrentSpeechPlayback();
    }
  }, [mode]);

  useEffect(() => {
    if (mode === AppMode.LISTENING) {
      void loadDailyContent('listening');
      return;
    }

    if (mode === AppMode.READING) {
      void loadDailyContent('reading');
      return;
    }

    if (mode === AppMode.SPEAKING && speakingTrack === 'chat' && freeTalkMessages.length <= 1) {
      const defaults = getFreeTalkDefaults();
      setFreeTalkMessages((prev) =>
        prev.length && prev[0]?.role === 'assistant'
          ? [{ ...prev[0], text: defaults.opener }]
          : prev
      );
      setFreeTalkQuickReplies(defaults.quickReplies);
    }
  }, [language]);

  useEffect(() => {
    if (mode === AppMode.LISTENING && dailyContent?.content && listeningAutoplayRef.current !== (dailyContent.title || dailyContent.source || 'listening')) {
      listeningAutoplayRef.current = dailyContent.title || dailyContent.source || 'listening';
      void handleTTS();
    }
    if (mode === AppMode.READING) {
      listeningAutoplayRef.current = null;
    }
  }, [mode, dailyContent]);

  useEffect(() => () => {
    void stopRecorder();
    stopMediaStream();
    stopCurrentSpeechPlayback();
    clearRecordingTimer();
  }, []);

  return (
    <div className="min-h-screen w-full bg-kitty-50 flex overflow-x-hidden relative">
      {selectionRect && (
        <div
          style={{ top: selectionRect.top - 80, left: selectionRect.left + selectionRect.width / 2 - 100 }}
          className="fixed z-[100] bg-slate-900 text-white p-2.5 rounded-3xl shadow-2xl flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200"
        >
          <button onClick={() => { addSelectionToNotebook(selectedText, dailyContent?.url); setSelectionRect(null); }} className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-800 rounded-2xl text-xs font-black transition-all border-r border-slate-700">
            <Plus size={16} /> {isSentenceSelection(selectedText) ? 'Sentence' : 'Word'}
          </button>
          <button onClick={() => { saveSentence(selectedText, dailyContent?.title || 'Manual', dailyContent?.url); setSelectionRect(null); }} className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-800 rounded-2xl text-xs font-black transition-all">
            <Bookmark size={16} /> Save
          </button>
        </div>
      )}

      <div className={`fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl z-50 transform transition-transform duration-500 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'} border-l border-kitty-100 flex flex-col`}>
        <div className="p-8 border-b border-kitty-50">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-black text-kitty-800 flex items-center gap-3 text-2xl"><Sparkles className="text-kitty-400" /> {labels.notebook}</h2>
            <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-kitty-50 rounded-full transition-all text-slate-400"><X /></button>
          </div>
          <div className="flex bg-kitty-100/50 p-1.5 rounded-2xl border border-kitty-100">
            {['vocab', 'sentences', 'diary'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab as 'vocab' | 'sentences' | 'diary')} className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${activeTab === tab ? 'bg-white text-kitty-600 shadow-sm' : 'text-kitty-300 hover:text-kitty-400'}`}>
                {tab === 'vocab' ? labels.words : tab === 'sentences' ? labels.sentences : notebookUiText.diaryTab}
              </button>
            ))}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              onClick={() => void copyNotebookExport()}
              className="rounded-2xl bg-white px-4 py-3 text-xs font-black text-kitty-600 border border-kitty-100 hover:border-kitty-200"
            >
              {notebookUiText.copyToNotion}
            </button>
            <button
              onClick={downloadNotebookExport}
              className="rounded-2xl bg-slate-900 px-4 py-3 text-xs font-black text-white hover:bg-slate-800"
            >
              {notebookUiText.downloadObsidian}
            </button>
          </div>
          {notebookNotice && (
            <div className="mt-4 rounded-2xl bg-kitty-50 px-4 py-3 text-xs font-semibold text-kitty-700">
              {notebookNotice}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
          <div className="rounded-[2rem] bg-kitty-50/70 border border-kitty-100 p-4">
            {activeTab === 'vocab' && (
              <div className="flex gap-3">
                <input
                  value={manualVocabInput}
                  onChange={(event) => setManualVocabInput(event.target.value)}
                  placeholder={notebookUiText.addWordPlaceholder}
                  className="flex-1 rounded-2xl bg-white px-4 py-3 outline-none text-sm text-slate-700 placeholder:text-slate-300"
                />
                <button
                  onClick={() => {
                    const value = safeTrim(manualVocabInput);
                    if (!value) return;
                    void addToVocab(value);
                    setManualVocabInput('');
                  }}
                  className="rounded-2xl bg-kitty-500 px-4 py-3 text-sm font-black text-white"
                >
                  {notebookUiText.add}
                </button>
              </div>
            )}
            {activeTab === 'sentences' && (
              <div className="flex gap-3">
                <input
                  value={manualSentenceInput}
                  onChange={(event) => setManualSentenceInput(event.target.value)}
                  placeholder={notebookUiText.addSentencePlaceholder}
                  className="flex-1 rounded-2xl bg-white px-4 py-3 outline-none text-sm text-slate-700 placeholder:text-slate-300"
                />
                <button
                  onClick={() => {
                    const value = safeTrim(manualSentenceInput);
                    if (!value) return;
                    saveSentence(value);
                    setManualSentenceInput('');
                  }}
                  className="rounded-2xl bg-kitty-500 px-4 py-3 text-sm font-black text-white"
                >
                  {notebookUiText.add}
                </button>
              </div>
            )}
            {activeTab === 'diary' && (
              <div className="space-y-3">
                <input
                  value={manualDiaryTitle}
                  onChange={(event) => setManualDiaryTitle(event.target.value)}
                  placeholder={notebookUiText.diaryTitlePlaceholder}
                  className="w-full rounded-2xl bg-white px-4 py-3 outline-none text-sm text-slate-700 placeholder:text-slate-300"
                />
                <textarea
                  value={manualDiaryInput}
                  onChange={(event) => setManualDiaryInput(event.target.value)}
                  placeholder={notebookUiText.diaryInputPlaceholder}
                  className="w-full min-h-28 rounded-2xl bg-white px-4 py-3 outline-none text-sm text-slate-700 placeholder:text-slate-300 resize-none"
                />
                <button
                  onClick={addManualDiary}
                  className="w-full rounded-2xl bg-kitty-500 px-4 py-3 text-sm font-black text-white"
                >
                  {notebookUiText.addToDiary}
                </button>
              </div>
            )}
          </div>

          {groupNotebookItemsByDate(
            (activeTab === 'vocab' ? vocabList : activeTab === 'sentences' ? sentenceList : diaryEntries).filter((item) => item && item.language === language)
          ).map((group) => (
            <div key={group.title || 'untitled-group'} className="space-y-4">
              <div className="inline-flex rounded-full bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-400 shadow-sm border border-kitty-100">
                {group.title || notebookUiText.unknownDate}
              </div>
              {group.items.filter(Boolean).map((item) => (
                <div key={item.id || `${group.title}-item`} className="bg-white border border-kitty-100 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all group animate-in slide-in-from-right-4">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-black text-slate-800 text-xl tracking-tight">
                        {activeTab === 'vocab'
                          ? (item as VocabItem).word || notebookUiText.untitledWord
                          : activeTab === 'sentences'
                            ? `${((item as SavedSentence).text || notebookUiText.untitledSentence).substring(0, 30)}...`
                            : (item as DiaryEntry).title || notebookUiText.untitledDiary}
                      </span>
                      {(activeTab === 'vocab' || activeTab === 'sentences') && (
                        <button
                          onClick={() =>
                            void playNotebookPronunciation(
                              activeTab === 'vocab'
                                ? (item as VocabItem).word
                                : (item as SavedSentence).text
                            )
                          }
                          className="shrink-0 rounded-full bg-kitty-50 p-2 text-kitty-600 hover:bg-kitty-100 transition-colors"
                          title={activeTab === 'vocab' ? notebookUiText.playWord : notebookUiText.playSentence}
                        >
                          <Volume2 size={14} />
                        </button>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        activeTab === 'vocab'
                          ? setVocabList((prev) => prev.filter((entry) => entry.id !== item.id))
                          : activeTab === 'sentences'
                            ? setSentenceList((prev) => prev.filter((entry) => entry.id !== item.id))
                            : setDiaryEntries((prev) => prev.filter((entry) => entry.id !== item.id))
                      }
                      className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <p className="text-sm text-kitty-500 mb-3 font-bold">
                    {activeTab === 'vocab'
                      ? (item as VocabItem).chineseDefinition || notebookUiText.languageClip
                      : activeTab === 'sentences'
                        ? notebookUiText.savedSentence
                        : `${formatDiarySourceLabel((item as DiaryEntry).sourceLabel)} · ${new Date((item as DiaryEntry).date).toLocaleDateString()}`}
                  </p>
                  {activeTab !== 'diary' && (((item as VocabItem).sourceUrl) || ((item as SavedSentence).sourceUrl)) && (
                    <a
                      href={((item as VocabItem).sourceUrl || (item as SavedSentence).sourceUrl)}
                      target="_blank"
                    rel="noreferrer"
                    className="mb-3 inline-flex items-center gap-2 text-xs font-black text-kitty-600 hover:text-kitty-700"
                  >
                      {notebookUiText.openSource} <ArrowRight size={14} />
                  </a>
                  )}
                  <div className="text-xs text-slate-500 italic leading-relaxed bg-kitty-50/50 p-4 rounded-2xl">
                    {activeTab === 'vocab' ? (
                      <div className="space-y-2 not-italic">
                        <p className="text-sm font-semibold text-slate-700 leading-relaxed">“{(item as VocabItem).contextSentence}”</p>
                        {(item as VocabItem).contextSentenceZh ? (
                          <p className="text-xs font-semibold text-slate-500 leading-relaxed">{(item as VocabItem).contextSentenceZh}</p>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        "
                        {activeTab === 'sentences'
                          ? (item as SavedSentence).text
                          : (item as DiaryEntry).content}
                        "
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        <div className="min-h-20 px-4 py-4 md:px-6 lg:px-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between glass shrink-0 z-40">
          <div className="flex items-center gap-3 md:gap-4 cursor-pointer group" onClick={() => setMode(AppMode.DASHBOARD)}>
            <div className="bg-kitty-500 text-white p-2.5 rounded-2xl shadow-lg group-hover:rotate-12 transition-all"><Star size={24} /></div>
            <div>
              <h1 className="font-black text-xl md:text-2xl text-slate-900 tracking-tighter">LinguaFlow</h1>
              <p className="text-[10px] font-black text-kitty-400 uppercase tracking-widest">AI English Coach</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:gap-4 lg:justify-end">
            {SUPPORTED_LANGUAGES.length > 1 && (
              <div className="flex w-full sm:w-auto bg-white p-1 rounded-2xl border border-kitty-100 shadow-sm overflow-x-auto">
              {SUPPORTED_LANGUAGES.map((item) => (
                <button key={item.code} onClick={() => { setLanguage(item.code); }} className={`px-3 py-2 md:px-5 md:py-2.5 rounded-xl text-xs md:text-sm font-black transition-all flex items-center gap-2 whitespace-nowrap ${language === item.code ? 'bg-kitty-500 text-white shadow-md' : 'text-slate-400 hover:bg-kitty-50'}`}>
                  <span>{item.flag}</span>
                  <span>{item.label}</span>
                </button>
              ))}
              </div>
            )}
            <div className={`flex items-center gap-2 rounded-full px-4 py-2 text-[11px] font-black uppercase tracking-widest ${
              cloudSyncStatus === 'synced'
                ? 'bg-emerald-50 text-emerald-600'
                : cloudSyncStatus === 'syncing' || cloudSyncStatus === 'connecting'
                  ? 'bg-amber-50 text-amber-600'
                  : cloudSyncStatus === 'error'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-slate-100 text-slate-500'
            }`}>
              <span className={`h-2 w-2 rounded-full ${
                cloudSyncStatus === 'synced'
                  ? 'bg-emerald-500'
                  : cloudSyncStatus === 'syncing' || cloudSyncStatus === 'connecting'
                    ? 'bg-amber-500'
                    : cloudSyncStatus === 'error'
                      ? 'bg-amber-500'
                      : 'bg-slate-400'
              }`} />
              {cloudSyncMessage}
            </div>
            {isSupabaseConfigured() && (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600 border border-kitty-100 shadow-sm hover:border-kitty-200 max-w-full"
              >
                <span className="truncate">{isEmailUser ? `Signed in · ${currentUserEmail}` : generalUiText.emailLogin}</span>
              </button>
            )}
            <button onClick={() => setSidebarOpen(true)} className="relative p-3.5 bg-white rounded-2xl shadow-sm text-kitty-500 hover:scale-105 border border-kitty-100 transition-all">
              <ShoppingBag size={24} />
              {(vocabList.length + sentenceList.length + diaryEntries.length) > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[1.35rem] h-5 px-1 bg-slate-900 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white">
                  {Math.min(vocabList.length + sentenceList.length + diaryEntries.length, 99)}
                </span>
              )}
            </button>
          </div>
        </div>

        <main className="flex-1 min-h-0 overflow-hidden relative">
          {isSupabaseConfigured() && isAuthChecked && !isEmailUser && (
            <div className="absolute inset-0 z-[65] overflow-y-auto bg-slate-950/45 backdrop-blur-sm px-4 py-6 md:px-6">
              <div className="mx-auto my-4 w-full max-w-lg rounded-[2.5rem] bg-white p-6 md:p-8 shadow-2xl border border-kitty-100 max-h-[calc(100dvh-2rem)] overflow-y-auto">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-kitty-500 mb-2">{generalUiText.cloudAccount}</p>
                    <h3 className="text-3xl font-black text-slate-900">{generalUiText.signInTitle}</h3>
                    <p className="mt-2 text-sm text-slate-500 font-medium">
                      {generalUiText.accountDesc}
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-[1.75rem] bg-slate-50 px-5 py-4">
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                      placeholder={generalUiText.emailPlaceholder}
                      className="w-full bg-transparent outline-none text-lg text-slate-700 placeholder:text-slate-300"
                    />
                  </div>
                  {isOtpStage && (
                    <div className="rounded-[1.75rem] bg-slate-50 px-5 py-4">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={authOtp}
                        onChange={(event) => setAuthOtp(event.target.value.replace(/\D/g, '').slice(0, 12))}
                        placeholder={generalUiText.verificationCode}
                        className="w-full bg-transparent outline-none text-lg tracking-[0.35em] text-slate-700 placeholder:text-slate-300"
                      />
                    </div>
                  )}
                  {!isOtpStage ? (
                    <button
                      onClick={() => void handleEmailLogin()}
                      disabled={isAuthLoading || !safeTrim(authEmail)}
                      className="w-full rounded-[1.75rem] bg-kitty-500 px-6 py-4 text-white font-black disabled:opacity-50"
                    >
                      {isAuthLoading ? generalUiText.sendingCode : generalUiText.sendVerificationCode}
                    </button>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => {
                          setIsOtpStage(false);
                          setAuthOtp('');
                          setAuthMessage('');
                        }}
                        disabled={isAuthLoading}
                        className="rounded-[1.75rem] bg-slate-100 px-6 py-4 text-slate-600 font-black disabled:opacity-50"
                      >
                        {generalUiText.changeEmail}
                      </button>
                      <button
                        onClick={() => void handleOtpVerify()}
                        disabled={isAuthLoading || safeTrim(authOtp).length < 4}
                        className="rounded-[1.75rem] bg-kitty-500 px-6 py-4 text-white font-black disabled:opacity-50"
                      >
                        {isAuthLoading ? generalUiText.verifyingCode : generalUiText.verifyCode}
                      </button>
                    </div>
                  )}
                </div>

                {authMessage && (
                  <div className="mt-4 rounded-[1.5rem] bg-kitty-50 px-5 py-4 text-sm font-semibold text-kitty-700">
                    {authMessage}
                  </div>
                )}
              </div>
            </div>
          )}
          {isSupabaseConfigured() && isEmailUser && isAuthModalOpen && (
            <div className="absolute inset-0 z-[65] overflow-y-auto bg-slate-950/45 backdrop-blur-sm px-4 py-6 md:px-6">
              <div className="mx-auto my-4 w-full max-w-lg rounded-[2.5rem] bg-white p-6 md:p-8 shadow-2xl border border-kitty-100 max-h-[calc(100dvh-2rem)] overflow-y-auto">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-kitty-500 mb-2">{generalUiText.cloudAccount}</p>
                    <h3 className="text-3xl font-black text-slate-900">{generalUiText.accountTitle}</h3>
                    <p className="mt-2 text-sm text-slate-500 font-medium">
                      {generalUiText.accountSynced}
                    </p>
                  </div>
                  <button onClick={() => setIsAuthModalOpen(false)} className="p-2 rounded-full hover:bg-kitty-50 text-slate-400">
                    <X size={18} />
                  </button>
                </div>
                <div className="rounded-[1.75rem] bg-emerald-50 px-5 py-4">
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-500 mb-2">{generalUiText.currentAccount}</p>
                  <p className="text-sm font-semibold text-emerald-700">{currentUserEmail}</p>
                </div>
                <div className="mt-4 rounded-[1.75rem] bg-slate-50 px-5 py-4 border border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-2">{generalUiText.clipperTitle}</p>
                      <p className="text-sm text-slate-500 font-medium">
                        先生成你的插件连接码，再粘到 Chrome 插件里。之后插件就能直接把单词和句子存进你的账号。
                      </p>
                    </div>
                    <button
                      onClick={() => void generateClipperToken()}
                      disabled={isGeneratingClipperToken}
                      className="rounded-full bg-kitty-500 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                    >
                      {isGeneratingClipperToken ? generalUiText.generatingToken : generalUiText.generateToken}
                    </button>
                  </div>
                  {clipperToken && (
                    <div className="mt-4 rounded-[1.25rem] bg-white px-4 py-4 border border-kitty-100">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">插件连接码</p>
                      <div className="flex flex-col gap-3 md:flex-row md:items-center">
                        <code className="flex-1 break-all text-xs leading-6 text-slate-600">{clipperToken}</code>
                        <button
                          onClick={() => void copyClipperToken()}
                          className="rounded-full bg-slate-900 px-4 py-2 text-xs font-black text-white"
                        >
                          {generalUiText.copy}
                        </button>
                      </div>
                    </div>
                  )}
                  {clipperTokenMessage && (
                    <div className="mt-3 rounded-[1rem] bg-kitty-50 px-4 py-3 text-xs font-semibold text-kitty-700">
                      {clipperTokenMessage}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => void handleSignOut()}
                  disabled={isAuthLoading}
                  className="mt-4 w-full rounded-[1.75rem] bg-slate-900 px-6 py-4 text-white font-black disabled:opacity-50"
                >
                  {isAuthLoading ? generalUiText.signingOut : generalUiText.signOut}
                </button>
                {authMessage && (
                  <div className="mt-4 rounded-[1.5rem] bg-kitty-50 px-5 py-4 text-sm font-semibold text-kitty-700">
                    {authMessage}
                  </div>
                )}
              </div>
            </div>
          )}
          {isLaunchingSpeaking && (
            <div className="absolute inset-0 z-[60] bg-slate-950/92 backdrop-blur-sm flex items-center justify-center">
              <div className="rounded-[2.5rem] bg-white px-8 py-7 shadow-2xl text-center">
                <div className="inline-flex items-center gap-3 rounded-full bg-kitty-50 px-5 py-3 text-kitty-600 font-black mb-4">
                  <RefreshCw className="animate-spin" size={18} /> {generalUiText.speakingLaunchTitle}
                </div>
                <p className="text-slate-500 font-semibold">{generalUiText.speakingLaunchDesc}</p>
              </div>
            </div>
          )}
          {mode === AppMode.DASHBOARD && (
            <div className="h-full p-5 md:p-8 lg:p-12 max-w-6xl mx-auto overflow-y-auto no-scrollbar pb-24 md:pb-32">
              <div className="rounded-[2.5rem] md:rounded-[4rem] bg-white p-8 md:p-12 lg:p-16 shadow-2xl border border-kitty-100">
                <div className="inline-flex items-center gap-3 rounded-full bg-kitty-50 px-5 py-3 text-kitty-600 text-xs font-black uppercase tracking-widest mb-8">
                  <Mic size={16} /> {generalUiText.dashboardBadge}
                </div>
                <div className="grid gap-10 xl:grid-cols-[1.2fr_0.8fr] items-start">
                  <div>
                    <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[0.95]">
                      {generalUiText.dashboardTitle}
                    </h2>
                    <p className="mt-6 text-lg md:text-xl text-slate-500 font-medium leading-relaxed max-w-2xl">
                      {generalUiText.dashboardDesc}
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3">
                      {['今天别背模板了，先把真实生活讲出来', '讲卡了也没关系，我会帮你顺成自然英文', '每天留下一篇自己的表达，以后真的用得上'].map((item) => (
                        <span key={item} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-600">
                          {item}
                        </span>
                      ))}
                    </div>
                    <div className="mt-10 flex flex-col sm:flex-row gap-4">
                      <button
                        onClick={() => void enterSpeakingMode()}
                        className="inline-flex items-center justify-center gap-3 rounded-[1.75rem] bg-kitty-500 px-8 py-5 text-white text-lg font-black shadow-xl hover:bg-kitty-600 transition-all"
                      >
                        <Mic size={22} /> {generalUiText.storyButton}
                      </button>
                      <button
                        onClick={() => void enterFreeTalkMode()}
                        className="inline-flex items-center justify-center gap-3 rounded-[1.75rem] bg-indigo-50 px-8 py-5 text-indigo-700 text-lg font-black hover:bg-indigo-100 transition-all"
                      >
                        <Headphones size={22} /> {generalUiText.freeTalkButton}
                      </button>
                      <button
                        onClick={openStoryLibrary}
                        className="inline-flex items-center justify-center gap-3 rounded-[1.75rem] bg-slate-100 px-8 py-5 text-slate-700 text-lg font-black hover:bg-slate-200 transition-all"
                      >
                        <BookOpen size={22} /> {generalUiText.libraryButton}
                      </button>
                    </div>
                    <div className="mt-10">
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">{generalUiText.otherModules}</p>
                        <p className="text-sm font-semibold text-slate-400">口语先跑通，听读写考试都还在。</p>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        {SECONDARY_MODULES.map((item) => {
                          const Icon = item.icon;
                          const accentClass =
                            item.accent === 'indigo'
                              ? 'bg-indigo-50 text-indigo-500 border-indigo-100'
                              : item.accent === 'orange'
                                ? 'bg-orange-50 text-orange-500 border-orange-100'
                                : item.accent === 'emerald'
                                  ? 'bg-emerald-50 text-emerald-500 border-emerald-100'
                                  : 'bg-sky-50 text-sky-500 border-sky-100';

                          return (
                            <button
                              key={item.key}
                              onClick={() => openSecondaryModule(item.onEnter)}
                              className="rounded-[2rem] border border-slate-100 bg-white px-5 py-5 text-left shadow-sm hover:shadow-md hover:border-kitty-200 transition-all"
                            >
                              <div className="flex items-start justify-between gap-4">
                                <div className={`rounded-2xl border px-3 py-3 ${accentClass}`}>
                                  <Icon size={20} />
                                </div>
                                <ArrowRight className="text-slate-300 shrink-0" size={18} />
                              </div>
                              <p className="mt-4 text-xl font-black text-slate-900">{item.title}</p>
                              <p className="mt-1 text-sm font-black text-kitty-500">{item.subtitle}</p>
                              <p className="mt-3 text-sm font-semibold leading-relaxed text-slate-500">{item.description}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div className="rounded-[2rem] bg-emerald-50 p-6 border border-emerald-100">
                      <p className="text-xs font-black uppercase tracking-widest text-emerald-500 mb-2">{generalUiText.todayLoopTitle}</p>
                      <div className="space-y-3">
                        {['1. 先把今天最想说的一件事讲出来', '2. 我先帮你转成草稿，你再顺一顺', '3. AI 把它变成一篇更像你会说出口的英文故事', '4. 自动存进故事库，后面面试、考试、聊天都能拿来用'].map((step) => (
                          <div key={step} className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700">
                            {step}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[2rem] bg-slate-50 p-6 border border-slate-100">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">{generalUiText.momentumTitle}</p>
                      <p className="text-3xl font-black text-slate-900">{storyEntries.filter((item) => item.language === language).length}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-500">{storyEntries.filter((item) => item.language === language).length}{generalUiText.momentumDesc}</p>
                      <div className="mt-4 text-sm font-semibold text-slate-500">
                        提醒时间：{storyReminder || '22:00'} · 今天{storyEntries.find((item) => new Date(item.date).toDateString() === new Date().toDateString() && item.language === language) ? '已经完成' : '还没讲故事'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {mode === AppMode.SPEAKING && (
            <div className="h-full p-3 sm:p-4 md:p-8 lg:p-10 max-w-7xl mx-auto overflow-y-auto no-scrollbar">
              <div className="mb-4">{renderSubpageBackButton(() => endSpeakingSession('user_exit'))}</div>
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                <div>
                  <div className="inline-flex items-center gap-3 rounded-full bg-kitty-50 px-5 py-3 text-kitty-600 text-xs font-black uppercase tracking-widest mb-4">
                    <Mic size={16} /> {generalUiText.dashboardBadge}
                  </div>
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight leading-tight">{generalUiText.dashboardTitle}</h2>
                  <p className="mt-3 text-sm sm:text-base md:text-lg text-slate-500 font-medium max-w-2xl leading-relaxed">
                    {generalUiText.dashboardDesc}
                  </p>
                </div>
                <button onClick={() => endSpeakingSession('user_exit')} className="self-start rounded-full bg-white px-4 py-3 text-sm font-black text-slate-700 shadow-sm border border-slate-100 flex items-center gap-3">
                  <X size={16} /> {generalUiText.backHome}
                </button>
              </div>

              {storyNotice && <div className="mb-4 rounded-[1.5rem] bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">{storyNotice}</div>}
              {errorMsg && <div className="mb-4 rounded-[1.5rem] bg-red-50 px-5 py-4 text-sm font-black text-red-600">{errorMsg}</div>}

              {speakingTrack === null && storyStage === 'choose_mode' && (
                <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-[2rem] md:rounded-[2.5rem] bg-white p-5 sm:p-6 md:p-10 shadow-xl border border-slate-100">
                    <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-3">{storyUiText.step1}</p>
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 leading-tight">{storyUiText.chooseTitle}</h3>
                    <p className="mt-3 text-slate-500 font-medium text-sm sm:text-base md:text-lg leading-relaxed">
                      {storyUiText.chooseDesc}
                    </p>
                    <div className="mt-8 grid gap-4">
                      <button
                        onClick={() => void beginFreeTalk()}
                        className="w-full rounded-[1.5rem] sm:rounded-[2rem] border border-indigo-100 bg-indigo-50 px-4 py-4 sm:px-5 sm:py-5 text-left hover:border-indigo-200 transition-all"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-base sm:text-lg font-black text-slate-900">Free Talk</p>
                            <p className="mt-1 text-sm font-semibold text-slate-500">{storyUiText.freeTalkDesc}</p>
                          </div>
                          <ArrowRight className="text-indigo-500 shrink-0" />
                        </div>
                      </button>
                    </div>
                    <div className="mt-8 space-y-4">
                      {(Object.keys(storyModeMeta) as TodayStoryMode[]).map((item) => (
                        <button
                          key={item}
                          onClick={() => startStoryMode(item)}
                          className="w-full rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 bg-slate-50 px-4 py-4 sm:px-5 sm:py-5 text-left hover:border-kitty-200 hover:bg-kitty-50 transition-all"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-base sm:text-lg font-black text-slate-900">{storyModeMeta[item].title}</p>
                              <p className="mt-1 text-sm font-semibold text-slate-500">{storyModeMeta[item].description}</p>
                            </div>
                            <ArrowRight className="text-kitty-500 shrink-0" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[2rem] md:rounded-[2.5rem] bg-kitty-50 p-5 sm:p-6 md:p-10 border border-kitty-100">
                    <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-3">{storyUiText.whatYouGet}</p>
                    <div className="space-y-3">
                      {storyUiText.whatYouGetList.map((item) => (
                        <div key={item} className="rounded-[1.25rem] sm:rounded-[1.5rem] bg-white px-4 py-3 sm:px-5 sm:py-4 text-sm font-bold text-slate-700 leading-relaxed">
                          {item}
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 rounded-[1.75rem] bg-white px-5 py-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">{storyUiText.reminder}</p>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <input
                          type="time"
                          value={storyReminder}
                          onChange={(event) => setStoryReminder(event.target.value)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
                        />
                        <p className="text-sm font-semibold text-slate-500">{storyUiText.reminderDesc}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {speakingTrack === 'story' && (storyStage === 'record' || storyStage === 'review') && (
                <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-[2rem] md:rounded-[2.5rem] bg-white p-5 sm:p-6 md:p-10 shadow-xl border border-slate-100">
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                      <span className="rounded-full bg-kitty-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-kitty-600">
                        STEP 2 · {storyModeLabel(storyMode)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500">
                        {storyUiText.recordHint}
                      </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 leading-tight">{storyUiText.recordTitle}</h3>
                    <p className="mt-3 text-slate-500 font-medium text-sm sm:text-base md:text-lg leading-relaxed">
                      {storyStage === 'review' ? storyUiText.reviewDesc : storyUiText.recordDesc}
                    </p>
                    <div className="mt-6 rounded-[1.5rem] sm:rounded-[2rem] bg-slate-50 p-4 sm:p-5 md:p-6">
                      {speechDraft ? (
                        <div className="mb-4 rounded-[1.5rem] bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">{speechDraft}</div>
                      ) : null}
                      {storyStage === 'review' && (
                        <div className="mb-4 grid gap-3 md:grid-cols-3">
                          <div className="rounded-[1.5rem] bg-white px-4 py-4">
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">{storyUiText.transcriptStats}</p>
                            <p className="text-sm font-semibold text-slate-600">{storyModeLabel(storyMode)}</p>
                          </div>
                          <div className="rounded-[1.5rem] bg-white px-4 py-4">
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">{storyUiText.wordCount}</p>
                            <p className="text-sm font-semibold text-slate-600">{safeTrim(storyTranscript).split(/\s+/).filter(Boolean).length}</p>
                          </div>
                          <div className="rounded-[1.5rem] bg-white px-4 py-4">
                            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">{storyUiText.recordHint}</p>
                            <p className="text-sm font-semibold text-slate-600">{safeTrim(storyTranscript).length} 字</p>
                          </div>
                        </div>
                      )}
                      <textarea
                        value={storyTranscript}
                        onChange={(event) => setStoryTranscript(event.target.value)}
                        placeholder={storyUiText.transcriptPlaceholder}
                        className="w-full min-h-[220px] sm:min-h-[260px] resize-none rounded-[1.25rem] sm:rounded-[1.5rem] bg-white px-4 sm:px-5 py-4 outline-none text-base md:text-lg text-slate-700 placeholder:text-slate-300"
                      />
                      <div className="mt-4 flex flex-wrap gap-3">
                        {!isListening ? (
                          <button onClick={() => void startVoiceInput()} className="rounded-[1.25rem] sm:rounded-[1.5rem] bg-kitty-500 px-5 py-4 text-white font-black flex items-center gap-3">
                            <Mic size={18} /> {storyStage === 'review' ? storyUiText.keepAdding : storyUiText.startRecording}
                          </button>
                        ) : (
                          <button onClick={() => void stopVoiceInput('story_pause')} className="rounded-[1.25rem] sm:rounded-[1.5rem] bg-amber-500 px-5 py-4 text-white font-black flex items-center gap-3">
                            <Square size={18} /> {storyUiText.pauseAndTranscribe}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (isListening) {
                              void stopVoiceInput('story_finish');
                            } else if (safeTrim(storyTranscript)) {
                              setStoryStage('review');
                            }
                          }}
                          disabled={!isListening && !safeTrim(storyTranscript)}
                          className="rounded-[1.25rem] sm:rounded-[1.5rem] bg-slate-900 px-5 py-4 text-white font-black disabled:opacity-50"
                        >
                          {storyUiText.finishStep}
                        </button>
                        {storyStage === 'review' && (
                          <button
                            onClick={() => {
                              setStoryTranscript('');
                              setStoryStage('record');
                              setSpeechDraft('');
                            }}
                            className="rounded-[1.25rem] sm:rounded-[1.5rem] bg-white px-5 py-4 text-slate-700 font-black border border-slate-200"
                          >
                            {storyUiText.clearDraft}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="rounded-[2rem] md:rounded-[2.5rem] bg-white p-5 sm:p-6 md:p-8 shadow-xl border border-slate-100">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">
                      {storyStage === 'review' ? storyUiText.reviewTitle : storyUiText.lightGuidance}
                    </p>
                    <div className="space-y-3">
                      {(storyStage === 'review'
                        ? [
                            storyUiText.reviewDesc,
                            storyUiText.keepAdding,
                            storyUiText.generateStory,
                          ]
                        : storyUiText.guidanceList
                      ).map((item) => (
                        <div key={item} className="rounded-[1.5rem] bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-600">
                          {item}
                        </div>
                      ))}
                    </div>
                    {storyStage === 'review' && (
                      <button onClick={() => void handleGenerateTodayStory()} disabled={isStoryGenerating || !safeTrim(storyTranscript)} className="mt-6 w-full rounded-[1.75rem] bg-kitty-500 px-6 py-4 text-white font-black disabled:opacity-50 flex items-center justify-center gap-3">
                        {isStoryGenerating ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />}
                        {storyUiText.generateStory}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {speakingTrack === 'chat' && (
                <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[2rem] md:rounded-[2.5rem] bg-white p-5 sm:p-6 md:p-10 shadow-xl border border-slate-100">
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                      <span className="rounded-full bg-indigo-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-indigo-600">
                        {freeTalkUiText.badge}
                      </span>
                      <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500">
                        {freeTalkUiText.microMode}
                      </span>
                    </div>
                    <h3 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-900 leading-tight">{freeTalkUiText.title}</h3>
                    <p className="mt-3 text-slate-500 font-medium text-sm sm:text-base md:text-lg leading-relaxed">
                      {freeTalkUiText.description}
                    </p>
                    {isListening && (
                      <div className="mt-4 inline-flex items-center gap-3 rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">
                        <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                        {freeTalkUiText.liveLabel} · {formatRecordingDuration(recordingDurationSec)}
                      </div>
                    )}

                    <div className="mt-6 sm:mt-8 space-y-4 max-h-[40vh] sm:max-h-[46vh] overflow-y-auto pr-2 no-scrollbar">
                      {isListening && (
                        <div className="rounded-[1.75rem] border border-emerald-100 bg-emerald-50 px-5 py-4 text-emerald-700">
                          <p className="text-xs font-black uppercase tracking-widest mb-2 opacity-80">
                            {freeTalkUiText.userRole}
                          </p>
                          <p className="text-sm sm:text-base md:text-lg font-medium leading-relaxed">
                            {freeTalkUiText.recording}
                          </p>
                        </div>
                      )}
                      {freeTalkMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`rounded-[1.75rem] px-5 py-4 ${
                            message.role === 'assistant' ? 'bg-slate-50 text-slate-800' : 'bg-kitty-500 text-white'
                          }`}
                        >
                          <p className="text-xs font-black uppercase tracking-widest mb-2 opacity-70">
                            {message.role === 'assistant' ? freeTalkUiText.assistantRole : freeTalkUiText.userRole}
                          </p>
                          <p className="text-sm sm:text-base md:text-lg font-medium leading-relaxed whitespace-pre-wrap">{message.text}</p>
                        </div>
                      ))}
                      {isFreeTalkLoading && (
                        <div className="rounded-[1.75rem] bg-slate-50 px-5 py-4 text-sm font-black text-slate-500">
                          {freeTalkUiText.replying}
                        </div>
                      )}
                    </div>

                    <div className="mt-5 sm:mt-6 rounded-[1.5rem] sm:rounded-[2rem] bg-slate-50 p-4 sm:p-5 md:p-6">
                      {speechDraft ? (
                        <div className="mb-4 rounded-[1.5rem] bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">{speechDraft}</div>
                      ) : null}
                      <textarea
                        value={freeTalkInput}
                        onChange={(event) => {
                          setFreeTalkInput(event.target.value);
                          if (speechDraft === freeTalkUiText.transcriptReady) {
                            setSpeechDraft('');
                          }
                        }}
                        placeholder={freeTalkUiText.placeholder}
                        className="w-full min-h-[110px] sm:min-h-[120px] resize-none rounded-[1.25rem] sm:rounded-[1.5rem] bg-white px-4 sm:px-5 py-4 outline-none text-base md:text-lg text-slate-700 placeholder:text-slate-300"
                      />
                      <div className="mt-4 flex flex-wrap gap-3">
                        {!isListening ? (
                          <button onClick={() => void startVoiceInput()} className="rounded-[1.25rem] sm:rounded-[1.5rem] bg-kitty-500 px-5 py-4 text-white font-black flex items-center gap-3">
                            <Mic size={18} /> {freeTalkUiText.startButton}
                          </button>
                        ) : (
                          <button onClick={() => void stopVoiceInput('chat')} className="rounded-[1.25rem] sm:rounded-[1.5rem] bg-amber-500 px-5 py-4 text-white font-black flex items-center gap-3">
                            <Square size={18} /> {freeTalkUiText.stopButton}
                          </button>
                        )}
                        <button
                          onClick={() => void handleSubmitFreeTalk()}
                          disabled={isFreeTalkLoading || !safeTrim(freeTalkInput)}
                          className="rounded-[1.25rem] sm:rounded-[1.5rem] bg-slate-900 px-5 py-4 text-white font-black disabled:opacity-50"
                        >
                          {freeTalkUiText.sendButton}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-5 sm:space-y-6">
                    <div className="rounded-[2rem] md:rounded-[2.5rem] bg-white p-5 sm:p-6 md:p-8 shadow-xl border border-slate-100">
                      <h4 className="text-xl sm:text-2xl font-black text-slate-900 mb-4">{freeTalkUiText.startHere}</h4>
                      <div className="flex flex-wrap gap-3">
                        {freeTalkQuickReplies.map((item) => (
                          <button
                            key={item}
                            onClick={() => setFreeTalkInput(item)}
                            className="rounded-full bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-600 hover:bg-indigo-100 transition-all text-left"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[2rem] md:rounded-[2.5rem] bg-white p-5 sm:p-6 md:p-8 shadow-xl border border-slate-100">
                      <h4 className="text-xl sm:text-2xl font-black text-slate-900 mb-4">{freeTalkUiText.betterWays}</h4>
                      <div className="space-y-4">
                        {freeTalkImprovements.length ? (
                          freeTalkImprovements.map((item, index) => (
                            <div key={`${index}-${item}`} className="rounded-[1.5rem] bg-slate-50 px-4 py-4">
                              <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-2">{index + 1}</p>
                              <p className="text-base font-semibold text-slate-700 leading-relaxed">{item}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-base font-semibold text-slate-600 leading-relaxed">
                            {freeTalkUiText.betterWaysEmpty}
                          </p>
                        )}
                        {freeTalkCorrection ? (
                          <div className="rounded-[1.5rem] bg-kitty-50 px-4 py-4">
                            <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-2">{freeTalkUiText.coachNote}</p>
                            <p className="text-sm font-semibold text-kitty-700 leading-relaxed">{freeTalkCorrection}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-[2rem] md:rounded-[2.5rem] bg-slate-50 p-5 sm:p-6 md:p-8 border border-slate-100">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">{freeTalkUiText.rulesTitle}</p>
                      <div className="space-y-3">
                        {freeTalkUiText.rules.map((item) => (
                          <div key={item} className="rounded-[1.5rem] bg-white px-4 py-4 text-sm font-semibold text-slate-600">
                            {item}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {speakingTrack === 'story' && storyStage === 'result' && storyResult && (
                <div className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
                  <div className="rounded-[2.5rem] bg-white p-7 md:p-10 shadow-xl border border-slate-100">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-3">{storyUiText.storyResultLabel} · {new Date().toLocaleDateString()}</p>
                        <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">{storyResult.title}</h3>
                        <p className="mt-3 text-sm font-semibold text-slate-500">{storyModeLabel(storyMode)}</p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button onClick={() => void copyStoryText(storyResult.rewritten)} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
                          {storyUiText.copyEnglish}
                        </button>
                        <button onClick={openStoryLibrary} className="rounded-full bg-kitty-500 px-5 py-3 text-sm font-black text-white">
                          {storyUiText.goLibrary}
                        </button>
                      </div>
                    </div>
                    <div className="mt-8 grid gap-5">
                      <div className="rounded-[2rem] bg-slate-50 px-5 py-5">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">{storyUiText.originalVersion}</p>
                        <p className="text-base md:text-lg leading-relaxed text-slate-600 whitespace-pre-wrap">{storyResult.original}</p>
                      </div>
                      <div className="rounded-[2rem] bg-emerald-50 px-5 py-5 border border-emerald-100">
                        <p className="text-xs font-black uppercase tracking-widest text-emerald-500 mb-3">{storyUiText.rewrittenVersion}</p>
                        <p className="text-base md:text-lg leading-relaxed text-slate-800 whitespace-pre-wrap font-medium">{storyResult.rewritten}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="rounded-[2.5rem] bg-white p-7 md:p-8 shadow-xl border border-slate-100">
                      <h4 className="text-2xl font-black text-slate-900 mb-4">{storyUiText.keyPhrases}</h4>
                      <div className="space-y-4">
                        {storyResult.keyPhrases.map((phrase, index) => (
                          <div key={`${phrase.original}-${index}`} className="rounded-[1.75rem] bg-kitty-50 px-5 py-4">
                            <p className="text-base font-black text-slate-900">{phrase.original}</p>
                            <p className="mt-2 text-sm font-semibold text-slate-600">{phrase.explanation}</p>
                            <p className="mt-2 text-sm text-kitty-700 font-bold">{storyUiText.alternativeLabel}：{phrase.alternative}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[2.5rem] bg-white p-7 md:p-8 shadow-xl border border-slate-100">
                      <h4 className="text-2xl font-black text-slate-900 mb-4">{storyUiText.summary}</h4>
                      <p className="text-base font-semibold text-slate-600 leading-relaxed">
                        {storyResult.comment || '今天这段故事已经有内容了。下一次继续练习“发生了什么 + 你怎么想”。'}
                      </p>
                      {storyResult.tags?.length ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {storyResult.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-600">
                              {tag}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-[2.5rem] bg-slate-50 p-7 md:p-8 border border-slate-100">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">{storyUiText.next}</p>
                      <div className="grid gap-3">
                        <button onClick={() => { setStoryStage('record'); setStoryResult(null); }} className="rounded-[1.5rem] bg-white px-5 py-4 text-left text-sm font-black text-slate-700 border border-slate-100">
                          {storyUiText.retry}
                        </button>
                        <button onClick={() => { setStoryStage('choose_mode'); setStoryTranscript(''); setStoryResult(null); }} className="rounded-[1.5rem] bg-white px-5 py-4 text-left text-sm font-black text-slate-700 border border-slate-100">
                          {storyUiText.restart}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === AppMode.STORY_LIBRARY && (
            <div className="h-full p-4 md:p-8 lg:p-10 max-w-7xl mx-auto overflow-y-auto no-scrollbar">
              <div className="mb-4">{renderSubpageBackButton()}</div>
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                <div>
                  <div className="inline-flex items-center gap-3 rounded-full bg-kitty-50 px-5 py-3 text-kitty-600 text-xs font-black uppercase tracking-widest mb-4">
                    <BookOpen size={16} /> {generalUiText.myStoriesBadge}
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">{generalUiText.storyLibraryTitle}</h2>
                  <p className="mt-3 text-slate-500 text-base md:text-lg font-medium max-w-2xl">
                    {generalUiText.storyLibraryDesc}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => void enterSpeakingMode()} className="rounded-full bg-kitty-500 px-5 py-3 text-sm font-black text-white">
                    {generalUiText.storyButton}
                  </button>
                  <button onClick={() => setMode(AppMode.DASHBOARD)} className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-700 border border-slate-100">
                    {generalUiText.backHome}
                  </button>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-[2.5rem] bg-white p-6 md:p-8 shadow-xl border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-black text-slate-900">{storyUiText.sortByDate}</h3>
                    <span className="text-sm font-black text-slate-400">{storyEntries.filter((item) => item.language === language).length}{storyUiText.countSuffix}</span>
                  </div>
                  <div className="space-y-5 max-h-[65vh] overflow-y-auto pr-2 no-scrollbar">
                    {groupNotebookItemsByDate<TodayStoryEntry>(storyEntries.filter((item) => item.language === language)).map((group) => (
                      <div key={group.title}>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">{group.title}</p>
                        <div className="space-y-3">
                          {group.items.map((item) => (
                            <button
                              key={item.id}
                              onClick={() => setSelectedStoryId(item.id)}
                              className={`w-full rounded-[1.75rem] px-5 py-4 text-left border transition-all ${selectedStory?.id === item.id ? 'bg-kitty-50 border-kitty-200' : 'bg-slate-50 border-slate-100 hover:border-kitty-150'}`}
                            >
                              <p className="text-base font-black text-slate-900">{item.title}</p>
                              <p className="mt-2 text-xs font-black uppercase tracking-widest text-kitty-500">{storyModeLabel(item.mode)}</p>
                              <p className="mt-2 text-sm font-semibold text-slate-500 line-clamp-2">{item.rewrittenText}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {!storyEntries.filter((item) => item.language === language).length && (
                      <div className="rounded-[1.75rem] bg-slate-50 px-5 py-4 text-sm font-semibold text-slate-500">
                        {storyUiText.emptyLibrary}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-[2.5rem] bg-white p-6 md:p-8 shadow-xl border border-slate-100">
                  {selectedStory ? (
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-3">{new Date(selectedStory.date).toLocaleDateString()} · {storyModeLabel(selectedStory.mode)}</p>
                      <h3 className="text-3xl font-black text-slate-900 tracking-tight">{selectedStory.title}</h3>
                      <div className="mt-6 grid gap-5">
                        <div className="rounded-[1.75rem] bg-slate-50 px-5 py-4">
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">{storyUiText.originalStory}</p>
                          <p className="text-base leading-relaxed text-slate-600 whitespace-pre-wrap">{selectedStory.originalText}</p>
                        </div>
                        <div className="rounded-[1.75rem] bg-emerald-50 px-5 py-4 border border-emerald-100">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <p className="text-xs font-black uppercase tracking-widest text-emerald-500">{storyUiText.optimizedStory}</p>
                            <button onClick={() => void copyStoryText(selectedStory.rewrittenText)} className="text-xs font-black text-kitty-600">
                              {storyUiText.copy}
                            </button>
                          </div>
                          <p className="text-base leading-relaxed text-slate-800 whitespace-pre-wrap font-medium">{selectedStory.rewrittenText}</p>
                        </div>
                        <div className="rounded-[1.75rem] bg-white border border-slate-100 px-5 py-4">
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">{storyUiText.keyPhrases}</p>
                          <div className="space-y-3">
                            {selectedStory.keyPhrases.map((phrase, index) => (
                              <div key={`${phrase.original}-${index}`} className="rounded-[1.5rem] bg-kitty-50 px-4 py-4">
                                <p className="text-sm font-black text-slate-900">{phrase.original}</p>
                                <p className="mt-1 text-sm font-semibold text-slate-600">{phrase.explanation}</p>
                                <p className="mt-1 text-sm text-kitty-700 font-bold">{storyUiText.alternativeLabel}：{phrase.alternative}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {selectedStory.comment && (
                          <div className="rounded-[1.75rem] bg-slate-50 px-5 py-4">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">{storyUiText.comment}</p>
                            <p className="text-sm font-semibold text-slate-600">{selectedStory.comment}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center rounded-[2rem] bg-slate-50 text-slate-500 font-semibold">
                      {storyUiText.noStoryYet}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {(mode === AppMode.LISTENING || mode === AppMode.READING) && (
            <div className="h-full overflow-y-auto no-scrollbar p-3 sm:p-4 md:p-8 lg:p-10 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="mb-4">{renderSubpageBackButton()}</div>
              <div className={`relative bg-white rounded-[2rem] md:rounded-[4rem] p-4 sm:p-6 md:p-10 lg:p-16 shadow-2xl min-h-full border ${mode === AppMode.LISTENING ? 'border-indigo-100' : 'border-orange-100'}`}>
                <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)] xl:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-6 mb-8 md:mb-12">
                      <div>
                        <div className={`inline-block px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 ${dailyContent ? mode === AppMode.LISTENING ? 'bg-indigo-50 text-indigo-500' : 'bg-orange-50 text-orange-500' : 'bg-kitty-100 text-kitty-600'}`}>
                          {dailyContent?.source || contentUiText.loadingBadge}
                        </div>
                        <h2 className={`text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-black leading-tight tracking-tight ${dailyContent ? 'text-slate-900' : 'text-kitty-500'}`}>{dailyContent?.title || contentUiText.loadingTitle}</h2>
                        {!dailyContent && (
                          <p className="mt-4 text-base sm:text-lg md:text-2xl font-black text-slate-500">{contentUiText.loadingHint}</p>
                        )}
                        {dailyContent?.url && dailyContent.url !== '#' && (
                          <a href={dailyContent.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-kitty-600 hover:text-kitty-700">
                            {contentUiText.openSource} <ArrowRight size={16} />
                          </a>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-3 sm:gap-4">
                        <button onClick={() => setIsSourcePanelOpen(true)} className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl border border-slate-100 bg-white px-4 text-sm font-black text-slate-600 hover:bg-kitty-50 hover:text-kitty-600 transition-all">
                          <Globe size={18} /> {contentUiText.sourcePanelButton}
                        </button>
                        <button onClick={handleTTS} disabled={isTTSLoading || !dailyContent} className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 transition-all shadow-lg disabled:opacity-50">
                          {isTTSLoading ? <RefreshCw className="animate-spin" /> : <Volume2 />}
                        </button>
                        {mode === AppMode.LISTENING && (
                          <button
                            onClick={() => void handleToggleTTSPlayback()}
                            disabled={!dailyContent?.content || (!isPlaybackActive && !isPlaybackPaused && isTTSLoading)}
                            className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center bg-white text-slate-500 rounded-2xl border border-slate-100 hover:bg-slate-50 hover:text-kitty-500 transition-all disabled:opacity-40"
                            title={isPlaybackPaused ? contentUiText.resumeTitle : isPlaybackActive ? contentUiText.pauseTitle : contentUiText.playTitle}
                          >
                            {isPlaybackPaused ? <Play /> : <Pause />}
                          </button>
                        )}
                        <button onClick={() => void loadDailyContent(mode === AppMode.READING ? 'reading' : 'listening')} className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center bg-slate-50 text-slate-400 rounded-2xl hover:bg-kitty-50 hover:text-kitty-500 transition-all">
                          <RefreshCw />
                        </button>
                      </div>
                    </div>
                    {dailyContent ? (
                      <div className="overflow-y-auto no-scrollbar text-base sm:text-lg md:text-xl lg:text-2xl text-slate-700 leading-loose font-medium whitespace-pre-wrap selection:bg-kitty-200 xl:max-h-[calc(100vh-22rem)]" onMouseUp={handleTextSelection}>
                        {dailyContent.content}
                      </div>
                    ) : (
                      <div className="rounded-[2rem] border border-kitty-100 bg-gradient-to-br from-kitty-50 via-white to-kitty-100/60 px-5 py-7 md:px-8 md:py-10">
                        <div className="inline-flex items-center gap-3 rounded-full bg-kitty-500 px-4 py-2 text-xs font-black uppercase tracking-widest text-white shadow-sm">
                          <RefreshCw className="animate-spin" size={14} /> {contentUiText.loadingBadge}
                        </div>
                        <p className="mt-5 text-base sm:text-lg md:text-xl font-bold leading-relaxed text-slate-600">
                          {contentUiText.loadingBody}
                        </p>
                        <div className="mt-6 space-y-4">
                          <div className="h-4 w-40 rounded-full bg-kitty-100 animate-pulse" />
                          <div className="h-7 w-full rounded-full bg-white/90 shadow-sm animate-pulse" />
                          <div className="h-7 w-5/6 rounded-full bg-white/80 animate-pulse" />
                          <div className="h-7 w-4/6 rounded-full bg-white/70 animate-pulse" />
                        </div>
                        <div className="mt-6 grid gap-3 sm:grid-cols-3">
                          {['正在换一个源', '正在抽一篇新内容', '正在整理成可练习版本'].map((item) => (
                            <div key={item} className="rounded-[1.25rem] bg-white/90 px-4 py-3 text-sm font-black text-kitty-600 shadow-sm">
                              {item}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {isSourcePanelOpen && (
                  <div className="absolute inset-0 z-30 rounded-[2rem] md:rounded-[4rem] bg-slate-950/20 backdrop-blur-[2px]">
                    <div className="absolute inset-y-0 right-0 w-full max-w-[420px] rounded-[2rem] md:rounded-l-[3rem] md:rounded-r-[4rem] border-l border-slate-100 bg-white p-5 md:p-6 shadow-2xl overflow-y-auto no-scrollbar">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">{contentUiText.sourcePanelLabel}</p>
                          <h3 className="text-lg md:text-xl font-black text-slate-900">
                            {contentUiText.sourcePanelTitle}
                          </h3>
                          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">
                            {contentUiText.sourcePanelDesc}
                          </p>
                        </div>
                        <button
                          onClick={() => setIsSourcePanelOpen(false)}
                          className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-600"
                        >
                          <X size={14} /> {contentUiText.sourcePanelClose}
                        </button>
                      </div>

                      <div className="mt-4 rounded-[1.25rem] bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500 border border-slate-100">
                        {contentUiText.customCountLabel} {mode === AppMode.LISTENING ? listeningSources.length : readingSources.length} 个
                        <br />
                        {contentUiText.defaultCountLabel} {mode === AppMode.LISTENING ? languageSourceHints.listeningNames.length : languageSourceHints.readingNames.length} 个
                      </div>

                      <div className="mt-5 space-y-3">
                        <input
                          value={sourceNameInput}
                          onChange={(event) => setSourceNameInput(event.target.value)}
                          placeholder={mode === AppMode.LISTENING ? languageSourceHints.listeningPlaceholder : languageSourceHints.readingPlaceholder}
                          className="w-full rounded-[1.25rem] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none border border-slate-100"
                        />
                        <input
                          value={sourceUrlInput}
                          onChange={(event) => setSourceUrlInput(event.target.value)}
                          placeholder="https://..."
                          className="w-full rounded-[1.25rem] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none border border-slate-100"
                        />
                        <select
                          value={sourceTypeInput}
                          onChange={(event) => setSourceTypeInput(event.target.value as ContentSourceType)}
                          className="w-full rounded-[1.25rem] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none border border-slate-100"
                        >
                          <option value="both">{contentUiText.sourceTypeBoth}</option>
                          <option value="reading">{contentUiText.sourceTypeReading}</option>
                          <option value="listening">{contentUiText.sourceTypeListening}</option>
                        </select>
                        <input
                          value={sourceDescriptionInput}
                          onChange={(event) => setSourceDescriptionInput(event.target.value)}
                          placeholder={contentUiText.sourceDescPlaceholder}
                          className="w-full rounded-[1.25rem] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none border border-slate-100"
                        />
                        <button
                          onClick={() => {
                            addContentSource();
                            setIsSourcePanelOpen(false);
                          }}
                          disabled={!safeTrim(sourceNameInput) || !safeTrim(sourceUrlInput)}
                          className="w-full rounded-[1.25rem] bg-kitty-500 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                        >
                          {contentUiText.addSource}
                        </button>
                      </div>

                      <div className="mt-4 flex max-h-64 flex-wrap gap-3 overflow-y-auto no-scrollbar">
                        {(mode === AppMode.LISTENING ? listeningSources : readingSources).map((item) => (
                          <div key={item.id} className="inline-flex items-center gap-3 rounded-full bg-slate-50 px-4 py-2 text-sm font-bold text-slate-600 border border-slate-100">
                            <a href={item.url} target="_blank" rel="noreferrer" className="hover:text-kitty-600 transition-colors">
                              {item.name}
                            </a>
                            <span className="text-[10px] font-black uppercase tracking-widest text-kitty-500">{item.type}</span>
                            <button onClick={() => removeContentSource(item.id)} className="text-slate-300 hover:text-red-500 transition-colors">
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        {!(mode === AppMode.LISTENING ? listeningSources : readingSources).length && (
                          <div className="rounded-[1.25rem] bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-400 border border-slate-100">
                            {contentUiText.noCustomSource}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === AppMode.WRITING && (
            <div className="h-full p-3 sm:p-4 md:p-8 lg:p-10 max-w-7xl mx-auto flex flex-col xl:flex-row gap-5 md:gap-8 lg:gap-10 animate-in fade-in duration-700 overflow-y-auto no-scrollbar">
              <div className="w-full xl:hidden">{renderSubpageBackButton()}</div>
              <div className="flex-1 flex flex-col bg-white rounded-[2rem] md:rounded-[4rem] p-4 sm:p-6 md:p-8 lg:p-12 shadow-2xl border border-pink-100 relative overflow-hidden min-h-[520px]">
                <div className="hidden xl:block mb-4">{renderSubpageBackButton()}</div>
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-8 md:mb-10">
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-800">{generalUiText.writingTitle}</h2>
                  <div className="flex w-full lg:w-auto flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-3">
                    <button onClick={async () => { setIsWritingLoading(true); setWritingTopic(await AIService.generateWritingTopic(language)); setIsWritingLoading(false); }} className="flex items-center justify-center gap-3 bg-pink-50 text-pink-600 px-5 py-3 md:px-8 md:py-4 rounded-full font-black text-sm hover:bg-pink-100 transition-all">
                      <Wand2 size={20} /> {labels.inspire}
                    </button>
                    <button onClick={saveWritingEntry} disabled={!safeTrim(writingInput)} className="flex items-center justify-center gap-3 bg-emerald-50 text-emerald-600 px-5 py-3 md:px-8 md:py-4 rounded-full font-black text-sm hover:bg-emerald-100 transition-all disabled:opacity-40">
                      <Bookmark size={18} /> {writingResult ? generalUiText.saveDiary : generalUiText.saveDraft}
                    </button>
                  </div>
                </div>
                {writingSavedNotice && <div className="mb-6 rounded-[1.75rem] bg-emerald-50 px-6 py-4 text-sm font-black text-emerald-700">{writingSavedNotice}</div>}
                {writingTopic && <div className="mb-8 md:mb-10 p-5 md:p-8 bg-pink-50/30 rounded-[1.75rem] md:rounded-[2.5rem] border border-pink-100 text-base sm:text-lg md:text-xl font-bold italic text-pink-800">"{writingTopic}"</div>}
                <textarea value={writingInput} onChange={(event) => setWritingInput(event.target.value)} placeholder="先把你想写的内容打出来，不用一开始就很完美。" className="flex-1 w-full resize-none outline-none text-base sm:text-lg md:text-xl lg:text-2xl text-slate-600 bg-transparent placeholder:text-slate-300 font-medium leading-relaxed no-scrollbar min-h-[260px]" />
                <button onClick={handleWritingSubmit} disabled={isWritingLoading || !safeTrim(writingInput)} className="mt-8 md:mt-10 w-full py-4 md:py-6 bg-kitty-500 text-white rounded-3xl font-black text-lg md:text-2xl hover:bg-kitty-600 disabled:opacity-50 shadow-xl transition-all flex items-center justify-center gap-4">
                  {isWritingLoading ? <RefreshCw className="animate-spin" /> : <><CheckCircle size={28} /> {labels.check}</>}
                </button>
              </div>
              <div className="w-full xl:w-[480px] space-y-6 md:space-y-8 overflow-y-auto no-scrollbar">
                {writingResult ? (
                  <div className="space-y-6 animate-in slide-in-from-right-8 duration-500" onMouseUp={handleTextSelection}>
                    {[
                      { label: 'Corrected', title: generalUiText.corrected, text: writingResult.corrected, color: 'emerald' },
                      { label: 'Pro Upgrade', title: generalUiText.proUpgrade, text: writingResult.upgraded, color: 'indigo' },
                      { label: 'Model Essay', title: generalUiText.modelEssay, text: writingResult.modelEssay, color: 'slate' },
                    ].map((result, index) => (
                      <div key={index} className={`bg-${result.color}-50 p-6 md:p-8 lg:p-10 rounded-[2rem] md:rounded-[3rem] border border-${result.color}-100 shadow-sm`}>
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <span className={`text-[10px] font-black uppercase tracking-widest text-${result.color}-600`}>{result.title}</span>
                          <button onClick={() => saveDiaryVariant(result.label as 'Corrected' | 'Pro Upgrade' | 'Model Essay', result.text)} className="text-xs font-black text-kitty-600 hover:text-kitty-700">
                            {generalUiText.saveToDiary}
                          </button>
                        </div>
                        <p className="text-slate-800 text-base md:text-lg leading-relaxed font-bold break-words">{result.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-16 glass rounded-[4rem] border-2 border-dashed border-slate-200">
                    <PenTool size={64} className="text-slate-200 mb-6" />
                    <p className="text-lg text-slate-400 font-black">{generalUiText.feedbackPlaceholder}</p>
                  </div>
                )}
                {writingEntries.length > 0 && (
                  <div className="bg-white rounded-[3rem] border border-slate-100 p-8 shadow-sm">
                    <h3 className="text-xl font-black text-slate-800 mb-5">{generalUiText.savedDiaries}</h3>
                    <div className="space-y-4">
                      {writingEntries.slice(0, 3).map((entry) => (
                        <div key={entry.id} className="rounded-[1.75rem] bg-slate-50 px-5 py-4">
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">{entry.topic}</p>
                          <p className="text-sm font-semibold text-slate-600 max-h-16 overflow-hidden">{entry.original}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === AppMode.EXAM_PORTAL && (
            <div className="h-full p-3 sm:p-4 md:p-8 lg:p-16 max-w-6xl mx-auto overflow-y-auto no-scrollbar animate-in fade-in duration-1000">
              <div className="mb-4">{renderSubpageBackButton()}</div>
              <div className="text-center mb-10 md:mb-16">
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 mb-4">{generalUiText.examTitle}</h2>
                <p className="text-slate-400 text-base sm:text-lg md:text-xl font-medium">{generalUiText.examDesc}</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                {(EXAM_RESOURCES[language] || []).map((resource, index) => (
                  <a key={index} href={resource.url} target="_blank" rel="noreferrer" className="bg-white p-5 sm:p-7 md:p-12 rounded-[2rem] md:rounded-[4rem] shadow-sm hover:shadow-2xl transition-all border border-slate-100 flex items-center gap-4 sm:gap-6 md:gap-10 group">
                    <div className={`p-4 sm:p-6 md:p-8 bg-${resource.color}-50 text-${resource.color}-500 rounded-[1.5rem] md:rounded-[2.5rem] group-hover:scale-110 transition-transform`}>
                      <resource.icon size={36} />
                    </div>
                    <div>
                      <h4 className="text-xl sm:text-2xl md:text-3xl font-black text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">{resource.name}</h4>
                      <p className="text-slate-400 text-sm sm:text-base md:text-lg font-medium">{resource.desc}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
