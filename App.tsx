import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  CheckCircle,
  FileText,
  Globe,
  GraduationCap,
  Headphones,
  Mic,
  PenTool,
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
  { code: 'French', flag: '🇫🇷', label: 'Français' },
  { code: 'Japanese', flag: '🇯🇵', label: '日本語' },
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
};

const EXAM_RESOURCES: Record<string, any[]> = {
  English: [
    { name: 'KMF (考满分)', desc: 'IELTS / TOEFL / GRE Practice', url: 'https://www.kmf.com/', icon: FileText, color: 'blue' },
    { name: 'Burning Vocab', desc: 'CET-4/6 Questions', url: 'https://zhenti.burningvocabulary.cn/', icon: Zap, color: 'red' },
  ],
  Japanese: [{ name: 'NHK Web Easy', desc: 'Easy Japanese News', url: 'https://www3.nhk.or.jp/news/easy/', icon: Headphones, color: 'orange' }],
  French: [{ name: 'RFI Savoirs', desc: 'Apprendre le francais', url: 'https://savoirs.rfi.fr/fr', icon: Globe, color: 'blue' }],
};

const SPEECH_RECOGNITION_LOCALE: Record<string, string> = {
  English: 'en-US',
  French: 'fr-FR',
  Japanese: 'ja-JP',
};

const READING_BOOKSHELF = [
  { title: 'Inspired', author: 'Marty Cagan', note: '产品方法与 PM 思维' },
  { title: 'The Mom Test', author: 'Rob Fitzpatrick', note: '用户访谈与验证' },
  { title: 'Deep Work', author: 'Cal Newport', note: '深度工作与专注表达' },
  { title: 'Atomic Habits', author: 'James Clear', note: '习惯、成长与日常非虚构' },
  { title: 'Thinking, Fast and Slow', author: 'Daniel Kahneman', note: '思维模型与认知表达' },
  { title: 'The Elements of Style', author: 'Strunk & White', note: '英文表达与写作基本功' },
  { title: 'Word Power Made Easy', author: 'Norman Lewis', note: '词汇扩展与词根语感' },
  { title: 'Steve Jobs', author: 'Walter Isaacson', note: '人物叙事与传记表达' },
];

const LISTENING_LADDER = [
  {
    title: 'VOA 慢速',
    note: '先练能听懂主线，适合热身和建立信心。',
  },
  {
    title: 'VOA 常速',
    note: '开始接近真实新闻语速，练抓关键词。',
  },
  {
    title: 'TED',
    note: '结构清晰，适合练观点表达和演讲型英语。',
  },
  {
    title: '母语者访谈 / 播客',
    note: '最后进入真实聊天节奏，适合长期沉浸。',
  },
];

const DEFAULT_READING_SOURCE_NAMES = [
  'Stratechery',
  'First Round Review',
  'SVPG Articles',
  'Harvard Business Review',
  'Farnam Street',
  'James Clear',
  'Medium PM',
  'Indie Hackers',
];

const DEFAULT_LISTENING_SOURCE_NAMES = [
  "Lenny's Podcast",
  'Masters of Scale',
  'Tim Ferriss Show',
  'a16z Podcast',
  'The Journal',
  'How I Built This',
  'Look & Sound of Leadership',
];

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
    title: safeTrim(value.title) || 'Untitled content',
    summary: safeTrim(value.summary) || 'No summary yet.',
    url: safeTrim(value.url) || '#',
    content: safeTrim(value.content) || 'No content available yet.',
    source: safeTrim(value.source) || 'LinguaFlow',
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

  if (type === 'listening') {
    return {
      title: `${source} · Quick listening fallback`,
      source,
      url: '#',
      summary: 'A lightweight backup listening card while the live source refreshes.',
      content:
        language === 'English'
          ? `Today’s listening fallback comes from your default source pool. Try this: listen once for the main idea, then replay and shadow one or two lines aloud. After that, summarize the speaker’s point in your own English.`
          : `Here is a temporary listening card while we refresh your live source. Listen once for the main idea, then replay and summarize it in ${language}.`,
    };
  }

  return {
    title: `${source} · Quick reading fallback`,
    source,
    url: '#',
    summary: 'A lightweight backup reading card while the live source refreshes.',
    content:
      language === 'English'
        ? `Today’s reading fallback comes from your default source pool. Read this slowly, find three useful expressions, and then say what the main idea is in one or two sentences. The goal is not to finish fast, but to turn input into reusable English.`
        : `Here is a temporary reading card while we refresh your live source. Read it slowly, collect a few useful phrases, and summarize the main idea in ${language}.`,
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
    'What are you working on lately?',
    'How are you feeling right now?',
  ]);
  const [freeTalkCorrection, setFreeTalkCorrection] = useState('');
  const [freeTalkImprovements, setFreeTalkImprovements] = useState<string[]>([]);
  const [isFreeTalkLoading, setIsFreeTalkLoading] = useState(false);
  const [contentSources, setContentSources] = useState<CustomContentSource[]>([]);
  const [sourceNameInput, setSourceNameInput] = useState('');
  const [sourceUrlInput, setSourceUrlInput] = useState('');
  const [sourceDescriptionInput, setSourceDescriptionInput] = useState('');
  const [sourceTypeInput, setSourceTypeInput] = useState<ContentSourceType>('both');
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
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isVoiceOutputEnabled, setIsVoiceOutputEnabled] = useState(true);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
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
  const speechDetectedRef = useRef(false);
  const cloudUserIdRef = useRef<string | null>(null);
  const hasBootstrappedCloudRef = useRef(false);
  const isApplyingCloudSnapshotRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);
  const usageQueueRef = useRef<UsageEventPayload[]>([]);
  const listeningAutoplayRef = useRef<string | null>(null);
  const cloudRetryTimerRef = useRef<number | null>(null);

  const labels = UI_LABELS[language] || UI_LABELS.English;
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
      topic: manualDiaryTitle || 'Manual note',
      title: manualDiaryTitle || 'Manual diary note',
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
    if (!writingResult || !safeTrim(writingInput)) return;

    const entry: WritingEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      topic: writingTopic || 'Free writing',
      original: writingInput,
      feedback: writingResult,
      language,
    };

    setWritingEntries((prev) => [entry, ...prev].slice(0, 20));
    setWritingSavedNotice('Today’s diary is saved.');
    window.setTimeout(() => setWritingSavedNotice(''), 2200);
    queueUsageEvent('save_writing_entry', { topic: entry.topic });
  };

  const saveDiaryVariant = (sourceLabel: 'Corrected' | 'Pro Upgrade' | 'Model Essay', content: string) => {
    if (!safeTrim(content)) return;

    const entry: DiaryEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      topic: writingTopic || 'Free writing',
      title: `${sourceLabel} · ${writingTopic || 'Free writing'}`,
      content,
      sourceLabel,
      language,
    };

    setDiaryEntries((prev) => [entry, ...prev].slice(0, 50));
    setSidebarOpen(true);
    setActiveTab('diary');
    setWritingSavedNotice(`${sourceLabel} saved to Diary.`);
    window.setTimeout(() => setWritingSavedNotice(''), 2200);
    queueUsageEvent('save_diary_variant', { sourceLabel, topic: entry.topic });
  };

  const storyModeMeta: Record<TodayStoryMode, { title: string; description: string }> = {
    zh: { title: '我先用中文讲', description: '适合完全不敢开口，先把今天的事情讲顺。' },
    mixed: { title: '我用中英夹杂讲', description: '适合已经能说一点英语，但会自然夹中文。' },
    en: { title: '我尝试全英文讲', description: '适合想挑战自己，用英文讲清楚今天的一件事。' },
  };

  const storyModeLabel = (value: TodayStoryMode) => storyModeMeta[value].title;

  const beginFreeTalk = async () => {
    const opener: FreeTalkMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      text: 'Hey, I am here. How was your day today?',
    };

    setSpeakingTrack('chat');
    setFreeTalkMessages([opener]);
    setFreeTalkInput('');
    setFreeTalkCorrection('');
    setStoryNotice('');
    setErrorMsg(null);
    setSpeechDraft('');
    setFreeTalkQuickReplies([
      'Tell me about your day.',
      'What are you doing right now?',
      'What made you smile today?',
    ]);
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
      setErrorMsg('We could not open Free Talk right now.');
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
      setErrorMsg(error instanceof Error ? error.message : 'Free Talk is unavailable right now.');
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
        setDailyContent(nextItem || null);
        if (nextItem) {
          setSeenReadingTitles((prev) => [...prev, nextItem.title || 'Untitled reading']);
          setSeenReadingUrls((prev) => [...prev, nextItem.url || '']);
          queueUsageEvent('open_reading_content', { title: nextItem.title || 'Untitled reading', source: nextItem.source || 'Unknown source' });
        }
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
          setDailyContent(null);
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
          ? buildLocalFallbackContent('reading', language, DEFAULT_READING_SOURCE_NAMES)
          : buildLocalFallbackContent('listening', language, DEFAULT_LISTENING_SOURCE_NAMES);
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
  };

  const stopRecorder = async () => {
    clearSilenceTimer();
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

  const getRecordedAudioBase64 = () => {
    const totalLength = recordedChunksRef.current.reduce((sum, chunk) => sum + chunk.length, 0);
    const combined = new Float32Array(totalLength);
    let offset = 0;
    recordedChunksRef.current.forEach((chunk) => {
      combined.set(chunk, offset);
      offset += chunk.length;
    });
    return encodeWavBase64(combined, recordingSampleRateRef.current);
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
      utterance.onend = () => resolve();
      utterance.onerror = () => reject(new Error('Native speech playback failed'));
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });

  const playGeneratedSpeech = async (text: string) => {
    if (!isVoiceOutputEnabled || !safeTrim(text)) return;
    const spokenText = shapeSpokenText(text);

    if (language === 'English') {
      await playNativeSpeech(spokenText).catch((nativeError) => {
        console.error('Native speech playback failed', nativeError);
      });
      return;
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
      audio.onended = () => stopCurrentSpeechPlayback();
      await audio.play();
    } catch (error) {
      console.error('Voice playback failed', error);
      await playNativeSpeech(spokenText).catch((nativeError) => {
        console.error('Native speech playback failed', nativeError);
      });
    }
  };

  const endSpeakingSession = (reason: 'user_exit' | 'timeout') => {
    void stopRecorder();
    stopMediaStream();
    stopCurrentSpeechPlayback();
    setIsListening(false);
    setSpeechDraft('');
    setSpeakingTrack(null);
    speechDetectedRef.current = false;
    freeTalkTurnIdRef.current = Date.now();
    setFreeTalkMessages([]);
    setFreeTalkInput('');
    setFreeTalkCorrection('');
    setFreeTalkQuickReplies([
      'Tell me about your day.',
      'What are you working on lately?',
      'How are you feeling right now?',
    ]);
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
    setSpeechDraft(hasRecording ? 'Transcribing your speech...' : '');

    await stopRecorder();

    if (!hasRecording) {
      setSpeechDraft('');
      return;
    }

    try {
      const audioBase64 = getRecordedAudioBase64();
      const asrLanguage =
        mode === AppMode.SPEAKING
          ? speakingTrack === 'story'
            ? storyMode === 'en'
              ? 'English'
              : 'Chinese'
            : 'English'
          : language;
      const { transcript } = await AIService.transcribeSpeech(audioBase64, recordingSampleRateRef.current, asrLanguage);
      const finalText = safeTrim(transcript);
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
            void handleSubmitFreeTalk(finalText);
          }
        }
      }
    } catch (error) {
      console.error(error);
      recordedChunksRef.current = [];
      setSpeechDraft('');
      const message = error instanceof Error ? error.message : 'Voice input is temporarily unavailable. Please try again or type your reply below.';
      if (/arrearage|access denied|overdue-payment/i.test(message)) {
        setErrorMsg('Voice input is temporarily unavailable because the current Alibaba ASR account is not available. You can still type your reply below and continue the practice.');
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

    const scheduleChatAutoStop = () => {
      if (mode !== AppMode.SPEAKING || speakingTrack !== 'chat') return;
      clearSilenceTimer();
      silenceTimerRef.current = window.setTimeout(() => {
        if (recorderRef.current && speechDetectedRef.current) {
          void stopVoiceInput('chat');
        }
      }, 1200);
    };

    setErrorMsg(null);
    setIsListening(true);
    setSpeechDraft(
      mode === AppMode.SPEAKING
        ? speakingTrack === 'chat'
          ? 'Listening... speak naturally and I will reply right after you stop.'
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
          scheduleChatAutoStop();
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
  }, []);

  return (
    <div className="h-screen w-screen bg-kitty-50 flex overflow-hidden relative">
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
                {tab === 'vocab' ? labels.words : tab === 'sentences' ? labels.sentences : 'Diary'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
          <div className="rounded-[2rem] bg-kitty-50/70 border border-kitty-100 p-4">
            {activeTab === 'vocab' && (
              <div className="flex gap-3">
                <input
                  value={manualVocabInput}
                  onChange={(event) => setManualVocabInput(event.target.value)}
                  placeholder="Add a new word manually..."
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
                  Add
                </button>
              </div>
            )}
            {activeTab === 'sentences' && (
              <div className="flex gap-3">
                <input
                  value={manualSentenceInput}
                  onChange={(event) => setManualSentenceInput(event.target.value)}
                  placeholder="Add a useful sentence manually..."
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
                  Add
                </button>
              </div>
            )}
            {activeTab === 'diary' && (
              <div className="space-y-3">
                <input
                  value={manualDiaryTitle}
                  onChange={(event) => setManualDiaryTitle(event.target.value)}
                  placeholder="Diary title..."
                  className="w-full rounded-2xl bg-white px-4 py-3 outline-none text-sm text-slate-700 placeholder:text-slate-300"
                />
                <textarea
                  value={manualDiaryInput}
                  onChange={(event) => setManualDiaryInput(event.target.value)}
                  placeholder="Add a diary note manually..."
                  className="w-full min-h-28 rounded-2xl bg-white px-4 py-3 outline-none text-sm text-slate-700 placeholder:text-slate-300 resize-none"
                />
                <button
                  onClick={addManualDiary}
                  className="w-full rounded-2xl bg-kitty-500 px-4 py-3 text-sm font-black text-white"
                >
                  Add to Diary
                </button>
              </div>
            )}
          </div>

          {groupNotebookItemsByDate(
            (activeTab === 'vocab' ? vocabList : activeTab === 'sentences' ? sentenceList : diaryEntries).filter((item) => item && item.language === language)
          ).map((group) => (
            <div key={group.title || 'untitled-group'} className="space-y-4">
              <div className="inline-flex rounded-full bg-white px-4 py-2 text-[11px] font-black uppercase tracking-widest text-slate-400 shadow-sm border border-kitty-100">
                {group.title || 'Unknown date'}
              </div>
              {group.items.filter(Boolean).map((item) => (
                <div key={item.id || `${group.title}-item`} className="bg-white border border-kitty-100 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all group animate-in slide-in-from-right-4">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-black text-slate-800 text-xl tracking-tight">
                      {activeTab === 'vocab'
                        ? (item as VocabItem).word || 'Untitled word'
                        : activeTab === 'sentences'
                          ? `${((item as SavedSentence).text || 'Untitled sentence').substring(0, 30)}...`
                          : (item as DiaryEntry).title || 'Untitled diary'}
                    </span>
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
                      ? (item as VocabItem).chineseDefinition || 'Language Clip'
                      : activeTab === 'sentences'
                        ? 'Saved sentence'
                        : `${(item as DiaryEntry).sourceLabel} · ${new Date((item as DiaryEntry).date).toLocaleDateString()}`}
                  </p>
                  {activeTab !== 'diary' && (((item as VocabItem).sourceUrl) || ((item as SavedSentence).sourceUrl)) && (
                    <a
                      href={((item as VocabItem).sourceUrl || (item as SavedSentence).sourceUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="mb-3 inline-flex items-center gap-2 text-xs font-black text-kitty-600 hover:text-kitty-700"
                    >
                      Open source <ArrowRight size={14} />
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

      <div className="flex-1 flex flex-col min-w-0">
        <div className="min-h-20 px-4 py-4 md:px-6 lg:px-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between glass shrink-0 z-40">
          <div className="flex items-center gap-3 md:gap-4 cursor-pointer group" onClick={() => setMode(AppMode.DASHBOARD)}>
            <div className="bg-kitty-500 text-white p-2.5 rounded-2xl shadow-lg group-hover:rotate-12 transition-all"><Star size={24} /></div>
            <div>
              <h1 className="font-black text-xl md:text-2xl text-slate-900 tracking-tighter">LinguaFlow</h1>
              <p className="text-[10px] font-black text-kitty-400 uppercase tracking-widest">AI English Coach</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:gap-4 lg:justify-end">
            <div className="flex w-full sm:w-auto bg-white p-1 rounded-2xl border border-kitty-100 shadow-sm overflow-x-auto">
              {SUPPORTED_LANGUAGES.map((item) => (
                <button key={item.code} onClick={() => { setLanguage(item.code); setMode(AppMode.DASHBOARD); }} className={`px-3 py-2 md:px-5 md:py-2.5 rounded-xl text-xs md:text-sm font-black transition-all flex items-center gap-2 whitespace-nowrap ${language === item.code ? 'bg-kitty-500 text-white shadow-md' : 'text-slate-400 hover:bg-kitty-50'}`}>
                  <span>{item.flag}</span>
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
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
                <span className="truncate">{isEmailUser ? `Signed in · ${currentUserEmail}` : 'Email login'}</span>
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

        <main className="flex-1 overflow-hidden relative">
          {isSupabaseConfigured() && isAuthChecked && !isEmailUser && (
            <div className="absolute inset-0 z-[65] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center px-6">
              <div className="w-full max-w-lg rounded-[2.5rem] bg-white p-8 shadow-2xl border border-kitty-100">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-kitty-500 mb-2">Cloud Account</p>
                    <h3 className="text-3xl font-black text-slate-900">Sign in with email</h3>
                    <p className="mt-2 text-sm text-slate-500 font-medium">
                      Sign in first, then your notebook, diary, and study history will stay attached to your account.
                    </p>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-[1.75rem] bg-slate-50 px-5 py-4">
                    <input
                      type="email"
                      value={authEmail}
                      onChange={(event) => setAuthEmail(event.target.value)}
                      placeholder="you@example.com"
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
                        placeholder="Verification code"
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
                      {isAuthLoading ? 'Sending code...' : 'Send verification code'}
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
                        Change email
                      </button>
                      <button
                        onClick={() => void handleOtpVerify()}
                        disabled={isAuthLoading || safeTrim(authOtp).length < 4}
                        className="rounded-[1.75rem] bg-kitty-500 px-6 py-4 text-white font-black disabled:opacity-50"
                      >
                        {isAuthLoading ? 'Verifying...' : 'Verify code'}
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
            <div className="absolute inset-0 z-[65] bg-slate-950/45 backdrop-blur-sm flex items-center justify-center px-6">
              <div className="w-full max-w-lg rounded-[2.5rem] bg-white p-8 shadow-2xl border border-kitty-100">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-kitty-500 mb-2">Cloud Account</p>
                    <h3 className="text-3xl font-black text-slate-900">Account</h3>
                    <p className="mt-2 text-sm text-slate-500 font-medium">
                      Your notebook is now tied to your account and will sync across sessions.
                    </p>
                  </div>
                  <button onClick={() => setIsAuthModalOpen(false)} className="p-2 rounded-full hover:bg-kitty-50 text-slate-400">
                    <X size={18} />
                  </button>
                </div>
                <div className="rounded-[1.75rem] bg-emerald-50 px-5 py-4">
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-500 mb-2">Current account</p>
                  <p className="text-sm font-semibold text-emerald-700">{currentUserEmail}</p>
                </div>
                <div className="mt-4 rounded-[1.75rem] bg-slate-50 px-5 py-4 border border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-2">Chrome Clipper</p>
                      <p className="text-sm text-slate-500 font-medium">
                        先生成你的插件连接码，再粘到 Chrome 插件里。之后插件就能直接把单词和句子存进你的账号。
                      </p>
                    </div>
                    <button
                      onClick={() => void generateClipperToken()}
                      disabled={isGeneratingClipperToken}
                      className="rounded-full bg-kitty-500 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                    >
                      {isGeneratingClipperToken ? '生成中...' : '生成连接码'}
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
                          复制
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
                  {isAuthLoading ? 'Signing out...' : 'Sign out'}
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
                  <RefreshCw className="animate-spin" size={18} /> Opening speaking space...
                </div>
                <p className="text-slate-500 font-semibold">We are getting your scene upload flow ready for a low-pressure speaking session.</p>
              </div>
            </div>
          )}
          {mode === AppMode.DASHBOARD && (
            <div className="h-full p-5 md:p-8 lg:p-12 max-w-6xl mx-auto overflow-y-auto no-scrollbar pb-24 md:pb-32">
              <div className="rounded-[2.5rem] md:rounded-[4rem] bg-white p-8 md:p-12 lg:p-16 shadow-2xl border border-kitty-100">
                <div className="inline-flex items-center gap-3 rounded-full bg-kitty-50 px-5 py-3 text-kitty-600 text-xs font-black uppercase tracking-widest mb-8">
                  <Mic size={16} /> Today Story
                </div>
                <div className="grid gap-10 xl:grid-cols-[1.2fr_0.8fr] items-start">
                  <div>
                    <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-slate-900 tracking-tight leading-[0.95]">
                      每天用英语讲清楚
                      <br />
                      今天的一件事
                    </h2>
                    <p className="mt-6 text-lg md:text-xl text-slate-500 font-medium leading-relaxed max-w-2xl">
                      不用背模板，不用准备话题。你只要讲今天发生在你身上的一件事，我来帮你整理成一篇更自然、以后也能复用的英语故事。
                    </p>
                    <div className="mt-8 flex flex-wrap gap-3">
                      {['门槛低：中文 / 中英 / 全英文都可以', '结果感强：立刻看到优化版故事', '积累可见：每天自动进入故事库'].map((item) => (
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
                        <Mic size={22} /> 开始今天的故事
                      </button>
                      <button
                        onClick={() => void enterFreeTalkMode()}
                        className="inline-flex items-center justify-center gap-3 rounded-[1.75rem] bg-indigo-50 px-8 py-5 text-indigo-700 text-lg font-black hover:bg-indigo-100 transition-all"
                      >
                        <Headphones size={22} /> 直接聊几句英语
                      </button>
                      <button
                        onClick={openStoryLibrary}
                        className="inline-flex items-center justify-center gap-3 rounded-[1.75rem] bg-slate-100 px-8 py-5 text-slate-700 text-lg font-black hover:bg-slate-200 transition-all"
                      >
                        <BookOpen size={22} /> 我的故事库
                      </button>
                    </div>
                    <div className="mt-10">
                      <div className="flex items-center justify-between gap-4 mb-4">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Other Modules</p>
                        <p className="text-sm font-semibold text-slate-400">听 / 读 / 写 / 考试都还在</p>
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
                      <p className="text-xs font-black uppercase tracking-widest text-emerald-500 mb-2">Today’s loop</p>
                      <div className="space-y-3">
                        {['1. 选一个模式，直接开讲', '2. 自动转写原话，可手动补几句', '3. AI 生成一篇像你自己会说的英文故事', '4. 存进故事库，后面继续复述和复用'].map((step) => (
                          <div key={step} className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700">
                            {step}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[2rem] bg-slate-50 p-6 border border-slate-100">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">连续积累</p>
                      <p className="text-3xl font-black text-slate-900">{storyEntries.filter((item) => item.language === language).length}</p>
                      <p className="mt-2 text-sm font-semibold text-slate-500">篇属于你的英语故事已经存下来</p>
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
            <div className="h-full p-4 md:p-8 lg:p-10 max-w-7xl mx-auto overflow-y-auto no-scrollbar">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                <div>
                  <div className="inline-flex items-center gap-3 rounded-full bg-kitty-50 px-5 py-3 text-kitty-600 text-xs font-black uppercase tracking-widest mb-4">
                    <Mic size={16} /> Today Story
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">每天讲清楚今天的一件事</h2>
                  <p className="mt-3 text-slate-500 text-base md:text-lg font-medium max-w-2xl">
                    不用准备模板。你只要把今天的事讲出来，我帮你整理成一篇更自然、更容易复述的英文故事。
                  </p>
                </div>
                <button onClick={() => endSpeakingSession('user_exit')} className="self-start rounded-full bg-white px-5 py-3 text-sm font-black text-slate-700 shadow-sm border border-slate-100 flex items-center gap-3">
                  <X size={16} /> 返回首页
                </button>
              </div>

              {storyNotice && <div className="mb-4 rounded-[1.5rem] bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">{storyNotice}</div>}
              {errorMsg && <div className="mb-4 rounded-[1.5rem] bg-red-50 px-5 py-4 text-sm font-black text-red-600">{errorMsg}</div>}

              {speakingTrack === null && storyStage === 'choose_mode' && (
                <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                  <div className="rounded-[2.5rem] bg-white p-7 md:p-10 shadow-xl border border-slate-100">
                    <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-3">Step 1</p>
                    <h3 className="text-2xl md:text-3xl font-black text-slate-900">先选你今天更需要哪种口语练习</h3>
                    <p className="mt-3 text-slate-500 font-medium text-base md:text-lg">
                      如果你已经知道今天想讲什么，就走 Today Story；如果你只是想找个人直接聊几句英语，就走 Free Talk。
                    </p>
                    <div className="mt-8 grid gap-4">
                      <button
                        onClick={() => void beginFreeTalk()}
                        className="w-full rounded-[2rem] border border-indigo-100 bg-indigo-50 px-5 py-5 text-left hover:border-indigo-200 transition-all"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-lg font-black text-slate-900">Free Talk</p>
                            <p className="mt-1 text-sm font-semibold text-slate-500">不知道说什么也没关系，先和 AI 直接聊几句英语。</p>
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
                          className="w-full rounded-[2rem] border border-slate-100 bg-slate-50 px-5 py-5 text-left hover:border-kitty-200 hover:bg-kitty-50 transition-all"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <p className="text-lg font-black text-slate-900">{storyModeMeta[item].title}</p>
                              <p className="mt-1 text-sm font-semibold text-slate-500">{storyModeMeta[item].description}</p>
                            </div>
                            <ArrowRight className="text-kitty-500 shrink-0" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-[2.5rem] bg-kitty-50 p-7 md:p-10 border border-kitty-100">
                    <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-3">What you get</p>
                    <div className="space-y-3">
                      {[
                        '一版整理后的原话，让你知道自己刚刚到底讲了什么',
                        '一篇更清晰、以后可以直接复述的英文故事',
                        '3 个重点表达，方便以后面试、口语考试和聊天复用',
                      ].map((item) => (
                        <div key={item} className="rounded-[1.5rem] bg-white px-5 py-4 text-sm font-bold text-slate-700">
                          {item}
                        </div>
                      ))}
                    </div>
                    <div className="mt-6 rounded-[1.75rem] bg-white px-5 py-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Daily reminder</p>
                      <div className="flex items-center gap-3">
                        <input
                          type="time"
                          value={storyReminder}
                          onChange={(event) => setStoryReminder(event.target.value)}
                          className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700"
                        />
                        <p className="text-sm font-semibold text-slate-500">打开页面时会提醒你：今天还没讲故事哦。</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {speakingTrack === 'story' && (storyStage === 'record' || storyStage === 'review') && (
                <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="rounded-[2.5rem] bg-white p-7 md:p-10 shadow-xl border border-slate-100">
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                      <span className="rounded-full bg-kitty-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-kitty-600">
                        Step 2 · {storyModeLabel(storyMode)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500">
                        建议录 3–5 分钟
                      </span>
                    </div>
                    <h3 className="text-2xl md:text-3xl font-black text-slate-900">讲讲今天发生在你身上的一件事</h3>
                    <p className="mt-3 text-slate-500 font-medium text-base md:text-lg">
                      可以是一次沟通、一个情绪、一件小开心、一个决定，或者今天最想记住的一幕。
                    </p>
                    <div className="mt-8 rounded-[2rem] bg-slate-50 p-5 md:p-6">
                      {speechDraft ? (
                        <div className="mb-4 rounded-[1.5rem] bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">{speechDraft}</div>
                      ) : null}
                      <textarea
                        value={storyTranscript}
                        onChange={(event) => setStoryTranscript(event.target.value)}
                        placeholder="这里会出现语音转写结果。你也可以直接手动输入，先把故事讲顺最重要。"
                        className="w-full min-h-[260px] resize-none rounded-[1.5rem] bg-white px-5 py-4 outline-none text-base md:text-lg text-slate-700 placeholder:text-slate-300"
                      />
                      <div className="mt-4 flex flex-wrap gap-3">
                        {!isListening ? (
                          <button onClick={() => void startVoiceInput()} className="rounded-[1.5rem] bg-kitty-500 px-6 py-4 text-white font-black flex items-center gap-3">
                            <Mic size={18} /> 开始录音
                          </button>
                        ) : (
                          <button onClick={() => void stopVoiceInput('story_pause')} className="rounded-[1.5rem] bg-amber-500 px-6 py-4 text-white font-black flex items-center gap-3">
                            <Square size={18} /> 暂停并转写
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
                          className="rounded-[1.5rem] bg-slate-900 px-6 py-4 text-white font-black disabled:opacity-50"
                        >
                          结束并进入下一步
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-[2.5rem] bg-white p-7 md:p-8 shadow-xl border border-slate-100">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Light guidance</p>
                    <div className="space-y-3">
                      {[
                        '先讲发生了什么，再讲你当时怎么想。',
                        '如果卡壳，就先用中文补一句。',
                        '不需要太完整，AI 会帮你理顺结构。',
                      ].map((item) => (
                        <div key={item} className="rounded-[1.5rem] bg-slate-50 px-4 py-4 text-sm font-semibold text-slate-600">
                          {item}
                        </div>
                      ))}
                    </div>
                    {storyStage === 'review' && (
                      <button onClick={() => void handleGenerateTodayStory()} disabled={isStoryGenerating || !safeTrim(storyTranscript)} className="mt-6 w-full rounded-[1.75rem] bg-kitty-500 px-6 py-4 text-white font-black disabled:opacity-50 flex items-center justify-center gap-3">
                        {isStoryGenerating ? <RefreshCw className="animate-spin" size={18} /> : <Sparkles size={18} />}
                        生成我的故事
                      </button>
                    )}
                  </div>
                </div>
              )}

              {speakingTrack === 'chat' && (
                <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[2.5rem] bg-white p-7 md:p-10 shadow-xl border border-slate-100">
                    <div className="flex flex-wrap items-center gap-3 mb-6">
                      <span className="rounded-full bg-indigo-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-indigo-600">
                        Free Talk
                      </span>
                      <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500">
                        Say one thing, get one reply
                      </span>
                    </div>
                    <h3 className="text-2xl md:text-3xl font-black text-slate-900">直接聊，不知道说什么也可以</h3>
                    <p className="mt-3 text-slate-500 font-medium text-base md:text-lg">
                      你说一句，我就回一句，并自动用英文播报。重点是把聊天节奏跑起来，不需要先想一个完整故事。
                    </p>

                    <div className="mt-8 space-y-4 max-h-[46vh] overflow-y-auto pr-2 no-scrollbar">
                      {freeTalkMessages.map((message) => (
                        <div
                          key={message.id}
                          className={`rounded-[1.75rem] px-5 py-4 ${
                            message.role === 'assistant' ? 'bg-slate-50 text-slate-800' : 'bg-kitty-500 text-white'
                          }`}
                        >
                          <p className="text-xs font-black uppercase tracking-widest mb-2 opacity-70">
                            {message.role === 'assistant' ? 'AI partner' : 'You'}
                          </p>
                          <p className="text-base md:text-lg font-medium leading-relaxed whitespace-pre-wrap">{message.text}</p>
                        </div>
                      ))}
                      {isFreeTalkLoading && (
                        <div className="rounded-[1.75rem] bg-slate-50 px-5 py-4 text-sm font-black text-slate-500">
                          Replying...
                        </div>
                      )}
                    </div>

                    <div className="mt-6 rounded-[2rem] bg-slate-50 p-5 md:p-6">
                      {speechDraft ? (
                        <div className="mb-4 rounded-[1.5rem] bg-emerald-50 px-5 py-4 text-sm font-black text-emerald-700">{speechDraft}</div>
                      ) : null}
                      <textarea
                        value={freeTalkInput}
                        onChange={(event) => setFreeTalkInput(event.target.value)}
                        placeholder="Say something simple... for example: Today was busy, I am a little tired, but I still wanted to practice."
                        className="w-full min-h-[120px] resize-none rounded-[1.5rem] bg-white px-5 py-4 outline-none text-base md:text-lg text-slate-700 placeholder:text-slate-300"
                      />
                      <div className="mt-4 flex flex-wrap gap-3">
                        {!isListening ? (
                          <button onClick={() => void startVoiceInput()} className="rounded-[1.5rem] bg-kitty-500 px-6 py-4 text-white font-black flex items-center gap-3">
                            <Mic size={18} /> 开始说话
                          </button>
                        ) : (
                          <button onClick={() => void stopVoiceInput('chat')} className="rounded-[1.5rem] bg-amber-500 px-6 py-4 text-white font-black flex items-center gap-3">
                            <Square size={18} /> 停止并让 AI 回复
                          </button>
                        )}
                        <button
                          onClick={() => void handleSubmitFreeTalk()}
                          disabled={isFreeTalkLoading || !safeTrim(freeTalkInput)}
                          className="rounded-[1.5rem] bg-slate-900 px-6 py-4 text-white font-black disabled:opacity-50"
                        >
                          Send
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-[2.5rem] bg-white p-7 md:p-8 shadow-xl border border-slate-100">
                      <h4 className="text-2xl font-black text-slate-900 mb-4">Start here</h4>
                      <div className="flex flex-wrap gap-3">
                        {freeTalkQuickReplies.map((item) => (
                          <button
                            key={item}
                            onClick={() => setFreeTalkInput(item)}
                            className="rounded-full bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-600 hover:bg-indigo-100 transition-all"
                          >
                            {item}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[2.5rem] bg-white p-7 md:p-8 shadow-xl border border-slate-100">
                      <h4 className="text-2xl font-black text-slate-900 mb-4">Better ways to say it</h4>
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
                            Once you send a message, I will give you 1 to 2 stronger versions so you can reuse them next time.
                          </p>
                        )}
                        {freeTalkCorrection ? (
                          <div className="rounded-[1.5rem] bg-kitty-50 px-4 py-4">
                            <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-2">Coach note</p>
                            <p className="text-sm font-semibold text-kitty-700 leading-relaxed">{freeTalkCorrection}</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div className="rounded-[2.5rem] bg-slate-50 p-7 md:p-8 border border-slate-100">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Good enough rule</p>
                      <div className="space-y-3">
                        {[
                          '先说短句，不要追求完整。',
                          '卡住时就先说最简单的版本。',
                          '重点是把一来一回跑起来。',
                        ].map((item) => (
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
                        <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-3">Today’s Story · {new Date().toLocaleDateString()}</p>
                        <h3 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">{storyResult.title}</h3>
                        <p className="mt-3 text-sm font-semibold text-slate-500">{storyModeLabel(storyMode)}</p>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <button onClick={() => void copyStoryText(storyResult.rewritten)} className="rounded-full bg-slate-100 px-5 py-3 text-sm font-black text-slate-700">
                          复制英文故事
                        </button>
                        <button onClick={openStoryLibrary} className="rounded-full bg-kitty-500 px-5 py-3 text-sm font-black text-white">
                          去我的故事库
                        </button>
                      </div>
                    </div>
                    <div className="mt-8 grid gap-5">
                      <div className="rounded-[2rem] bg-slate-50 px-5 py-5">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">原话整理版</p>
                        <p className="text-base md:text-lg leading-relaxed text-slate-600 whitespace-pre-wrap">{storyResult.original}</p>
                      </div>
                      <div className="rounded-[2rem] bg-emerald-50 px-5 py-5 border border-emerald-100">
                        <p className="text-xs font-black uppercase tracking-widest text-emerald-500 mb-3">优化后的英文版本</p>
                        <p className="text-base md:text-lg leading-relaxed text-slate-800 whitespace-pre-wrap font-medium">{storyResult.rewritten}</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div className="rounded-[2.5rem] bg-white p-7 md:p-8 shadow-xl border border-slate-100">
                      <h4 className="text-2xl font-black text-slate-900 mb-4">重点表达</h4>
                      <div className="space-y-4">
                        {storyResult.keyPhrases.map((phrase, index) => (
                          <div key={`${phrase.original}-${index}`} className="rounded-[1.75rem] bg-kitty-50 px-5 py-4">
                            <p className="text-base font-black text-slate-900">{phrase.original}</p>
                            <p className="mt-2 text-sm font-semibold text-slate-600">{phrase.explanation}</p>
                            <p className="mt-2 text-sm text-kitty-700 font-bold">可替换说法：{phrase.alternative}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-[2.5rem] bg-white p-7 md:p-8 shadow-xl border border-slate-100">
                      <h4 className="text-2xl font-black text-slate-900 mb-4">今天的总评</h4>
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
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Next</p>
                      <div className="grid gap-3">
                        <button onClick={() => { setStoryStage('record'); setStoryResult(null); }} className="rounded-[1.5rem] bg-white px-5 py-4 text-left text-sm font-black text-slate-700 border border-slate-100">
                          再讲一版，把故事说得更顺
                        </button>
                        <button onClick={() => { setStoryStage('choose_mode'); setStoryTranscript(''); setStoryResult(null); }} className="rounded-[1.5rem] bg-white px-5 py-4 text-left text-sm font-black text-slate-700 border border-slate-100">
                          换一种模式重新开始
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
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                <div>
                  <div className="inline-flex items-center gap-3 rounded-full bg-kitty-50 px-5 py-3 text-kitty-600 text-xs font-black uppercase tracking-widest mb-4">
                    <BookOpen size={16} /> My Stories
                  </div>
                  <h2 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">我的故事库</h2>
                  <p className="mt-3 text-slate-500 text-base md:text-lg font-medium max-w-2xl">
                    这里会慢慢长出你自己的英语故事素材。以后面试、考试、聊天，都可以从这里复述和调用。
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button onClick={() => void enterSpeakingMode()} className="rounded-full bg-kitty-500 px-5 py-3 text-sm font-black text-white">
                    开始今天的故事
                  </button>
                  <button onClick={() => setMode(AppMode.DASHBOARD)} className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-700 border border-slate-100">
                    返回首页
                  </button>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                <div className="rounded-[2.5rem] bg-white p-6 md:p-8 shadow-xl border border-slate-100">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-black text-slate-900">按日期倒序</h3>
                    <span className="text-sm font-black text-slate-400">{storyEntries.filter((item) => item.language === language).length} stories</span>
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
                        你还没有保存任何故事。今天先讲第一篇吧。
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
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">原始故事</p>
                          <p className="text-base leading-relaxed text-slate-600 whitespace-pre-wrap">{selectedStory.originalText}</p>
                        </div>
                        <div className="rounded-[1.75rem] bg-emerald-50 px-5 py-4 border border-emerald-100">
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <p className="text-xs font-black uppercase tracking-widest text-emerald-500">优化后的英文故事</p>
                            <button onClick={() => void copyStoryText(selectedStory.rewrittenText)} className="text-xs font-black text-kitty-600">
                              复制
                            </button>
                          </div>
                          <p className="text-base leading-relaxed text-slate-800 whitespace-pre-wrap font-medium">{selectedStory.rewrittenText}</p>
                        </div>
                        <div className="rounded-[1.75rem] bg-white border border-slate-100 px-5 py-4">
                          <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">重点表达</p>
                          <div className="space-y-3">
                            {selectedStory.keyPhrases.map((phrase, index) => (
                              <div key={`${phrase.original}-${index}`} className="rounded-[1.5rem] bg-kitty-50 px-4 py-4">
                                <p className="text-sm font-black text-slate-900">{phrase.original}</p>
                                <p className="mt-1 text-sm font-semibold text-slate-600">{phrase.explanation}</p>
                                <p className="mt-1 text-sm text-kitty-700 font-bold">可替换说法：{phrase.alternative}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        {selectedStory.comment && (
                          <div className="rounded-[1.75rem] bg-slate-50 px-5 py-4">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">点评</p>
                            <p className="text-sm font-semibold text-slate-600">{selectedStory.comment}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center rounded-[2rem] bg-slate-50 text-slate-500 font-semibold">
                      先去生成你的第一篇 Today Story。
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {(mode === AppMode.LISTENING || mode === AppMode.READING) && (
            <div className="h-full p-4 md:p-8 lg:p-10 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className={`bg-white rounded-[2.5rem] md:rounded-[4rem] p-6 md:p-10 lg:p-16 shadow-2xl h-full flex flex-col border ${mode === AppMode.LISTENING ? 'border-indigo-100' : 'border-orange-100'} overflow-hidden`}>
                <div className="mb-6 md:mb-8 rounded-[2rem] border border-slate-100 bg-slate-50/80 p-5 md:p-6">
                  <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">My sources</p>
                      <h3 className="text-xl md:text-2xl font-black text-slate-900">
                        {mode === AppMode.LISTENING ? '自定义你的听力信息源' : '自定义你的阅读信息源'}
                      </h3>
                      <p className="mt-2 text-sm md:text-base font-semibold text-slate-500 max-w-2xl">
                        加上你自己常看的播客、网站或专栏之后，后面的每日素材会优先从这些源里抽，不再只用默认推荐。
                      </p>
                    </div>
                    <div className="rounded-[1.5rem] bg-white px-4 py-3 text-sm font-bold text-slate-500 border border-slate-100">
                      当前自定义 {mode === AppMode.LISTENING ? listeningSources.length : readingSources.length} 个 · 默认 {mode === AppMode.LISTENING ? DEFAULT_LISTENING_SOURCE_NAMES.length : DEFAULT_READING_SOURCE_NAMES.length} 个
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1.2fr_0.9fr_auto]">
                    <input
                      value={sourceNameInput}
                      onChange={(event) => setSourceNameInput(event.target.value)}
                      placeholder={mode === AppMode.LISTENING ? '比如 Lenny’s Podcast' : '比如 Stratechery'}
                      className="rounded-[1.25rem] bg-white px-4 py-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none border border-slate-100"
                    />
                    <input
                      value={sourceUrlInput}
                      onChange={(event) => setSourceUrlInput(event.target.value)}
                      placeholder="https://..."
                      className="rounded-[1.25rem] bg-white px-4 py-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none border border-slate-100"
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        value={sourceTypeInput}
                        onChange={(event) => setSourceTypeInput(event.target.value as ContentSourceType)}
                        className="rounded-[1.25rem] bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none border border-slate-100"
                      >
                        <option value="both">读 + 听</option>
                        <option value="reading">只给阅读</option>
                        <option value="listening">只给听力</option>
                      </select>
                      <input
                        value={sourceDescriptionInput}
                        onChange={(event) => setSourceDescriptionInput(event.target.value)}
                        placeholder="补一句主题，比如 AI / 商业 / 影视"
                        className="rounded-[1.25rem] bg-white px-4 py-3 text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none border border-slate-100"
                      />
                    </div>
                    <button
                      onClick={addContentSource}
                      disabled={!safeTrim(sourceNameInput) || !safeTrim(sourceUrlInput)}
                      className="rounded-[1.25rem] bg-kitty-500 px-5 py-3 text-sm font-black text-white disabled:opacity-50"
                    >
                      添加源
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    {(mode === AppMode.LISTENING ? listeningSources : readingSources).map((item) => (
                      <div key={item.id} className="inline-flex items-center gap-3 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-600 border border-slate-100">
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
                      <div className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-400 border border-slate-100">
                        还没有自定义源，当前会直接从默认源池里抽内容。
                      </div>
                    )}
                  </div>
                </div>

                {mode === AppMode.READING ? (
                  <div className="mb-6 md:mb-8 rounded-[2rem] border border-orange-100 bg-orange-50/60 p-5 md:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-orange-500 mb-2">Reading bookshelf</p>
                        <h3 className="text-xl md:text-2xl font-black text-slate-900">英文书也给你留个入口</h3>
                        <p className="mt-2 text-sm md:text-base font-semibold text-slate-500 max-w-2xl">
                          这块先不做整本书抓取，先把适合你这类用户长期读的书挂出来，方便后面继续扩展成书单阅读。
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {READING_BOOKSHELF.map((book) => (
                        <div key={book.title} className="rounded-[1.5rem] bg-white px-4 py-4 border border-orange-100">
                          <p className="text-sm font-black text-slate-900">{book.title}</p>
                          <p className="mt-1 text-xs font-bold text-orange-500">{book.author}</p>
                          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{book.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mb-6 md:mb-8 rounded-[2rem] border border-indigo-100 bg-indigo-50/60 p-5 md:p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-indigo-500 mb-2">Listening ladder</p>
                        <h3 className="text-xl md:text-2xl font-black text-slate-900">按难度往上走，会更有感觉</h3>
                        <p className="mt-2 text-sm md:text-base font-semibold text-slate-500 max-w-2xl">
                          你现在默认会抽真实播客和音频源。这条阶梯先帮用户知道自己大概在哪一档，不会一进来就迷路。
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {LISTENING_LADDER.map((item, index) => (
                        <div key={item.title} className="rounded-[1.5rem] bg-white px-4 py-4 border border-indigo-100">
                          <p className="text-[10px] font-black uppercase tracking-widest text-indigo-500 mb-2">Level {index + 1}</p>
                          <p className="text-sm font-black text-slate-900">{item.title}</p>
                          <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{item.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-6 mb-8 md:mb-12">
                  <div>
                    <div className={`inline-block px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 ${mode === AppMode.LISTENING ? 'bg-indigo-50 text-indigo-500' : 'bg-orange-50 text-orange-500'}`}>
                      {dailyContent?.source || 'Curated Content'}
                    </div>
                    <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-slate-900 leading-tight tracking-tight">{dailyContent?.title || 'Finding the best material...'}</h2>
                    {dailyContent?.url && dailyContent.url !== '#' && (
                      <a href={dailyContent.url} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-kitty-600 hover:text-kitty-700">
                        Open original source <ArrowRight size={16} />
                      </a>
                    )}
                  </div>
                  <div className="flex gap-4">
                    <button onClick={handleTTS} disabled={isTTSLoading || !dailyContent} className="w-16 h-16 flex items-center justify-center bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 transition-all shadow-lg disabled:opacity-50">
                      {isTTSLoading ? <RefreshCw className="animate-spin" /> : <Volume2 />}
                    </button>
                    <button onClick={() => void loadDailyContent(mode === AppMode.READING ? 'reading' : 'listening')} className="w-16 h-16 flex items-center justify-center bg-slate-50 text-slate-400 rounded-2xl hover:bg-kitty-50 hover:text-kitty-500 transition-all">
                      <RefreshCw />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto pr-0 md:pr-4 lg:pr-6 no-scrollbar text-lg md:text-xl lg:text-2xl text-slate-700 leading-loose font-medium whitespace-pre-wrap selection:bg-kitty-200" onMouseUp={handleTextSelection}>
                  {dailyContent?.content || 'Synchronizing with external libraries...'}
                </div>
              </div>
            </div>
          )}

          {mode === AppMode.WRITING && (
            <div className="h-full p-4 md:p-8 lg:p-10 max-w-7xl mx-auto flex flex-col xl:flex-row gap-6 md:gap-8 lg:gap-10 animate-in fade-in duration-700 overflow-y-auto no-scrollbar">
              <div className="flex-1 flex flex-col bg-white rounded-[2.5rem] md:rounded-[4rem] p-6 md:p-8 lg:p-12 shadow-2xl border border-pink-100 relative overflow-hidden min-h-[520px]">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4 mb-8 md:mb-10">
                  <h2 className="text-2xl md:text-3xl font-black text-slate-800">Writing Studio</h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <button onClick={async () => { setIsWritingLoading(true); setWritingTopic(await AIService.generateWritingTopic(language)); setIsWritingLoading(false); }} className="flex items-center gap-3 bg-pink-50 text-pink-600 px-6 py-3 md:px-8 md:py-4 rounded-full font-black text-sm hover:bg-pink-100 transition-all">
                      <Wand2 size={20} /> {labels.inspire}
                    </button>
                    <button onClick={saveWritingEntry} disabled={!writingResult || !safeTrim(writingInput)} className="flex items-center gap-3 bg-emerald-50 text-emerald-600 px-6 py-3 md:px-8 md:py-4 rounded-full font-black text-sm hover:bg-emerald-100 transition-all disabled:opacity-50">
                      <Bookmark size={18} /> Save Diary
                    </button>
                  </div>
                </div>
                {writingSavedNotice && <div className="mb-6 rounded-[1.75rem] bg-emerald-50 px-6 py-4 text-sm font-black text-emerald-700">{writingSavedNotice}</div>}
                {writingTopic && <div className="mb-8 md:mb-10 p-6 md:p-8 bg-pink-50/30 rounded-[2rem] md:rounded-[2.5rem] border border-pink-100 text-lg md:text-xl font-bold italic text-pink-800">"{writingTopic}"</div>}
                <textarea value={writingInput} onChange={(event) => setWritingInput(event.target.value)} placeholder="Type your story, essay or journal here..." className="flex-1 w-full resize-none outline-none text-lg md:text-xl lg:text-2xl text-slate-600 bg-transparent placeholder:text-slate-200 font-medium leading-relaxed no-scrollbar min-h-[260px]" />
                <button onClick={handleWritingSubmit} disabled={isWritingLoading || !safeTrim(writingInput)} className="mt-8 md:mt-10 w-full py-5 md:py-6 bg-kitty-500 text-white rounded-3xl font-black text-xl md:text-2xl hover:bg-kitty-600 disabled:opacity-50 shadow-xl transition-all flex items-center justify-center gap-4">
                  {isWritingLoading ? <RefreshCw className="animate-spin" /> : <><CheckCircle size={28} /> {labels.check}</>}
                </button>
              </div>
              <div className="w-full xl:w-[480px] space-y-6 md:space-y-8 overflow-y-auto no-scrollbar">
                {writingResult ? (
                  <div className="space-y-6 animate-in slide-in-from-right-8 duration-500" onMouseUp={handleTextSelection}>
                    {[
                      { label: 'Corrected', text: writingResult.corrected, color: 'emerald' },
                      { label: 'Pro Upgrade', text: writingResult.upgraded, color: 'indigo' },
                      { label: 'Model Essay', text: writingResult.modelEssay, color: 'slate' },
                    ].map((result, index) => (
                      <div key={index} className={`bg-${result.color}-50 p-6 md:p-8 lg:p-10 rounded-[2rem] md:rounded-[3rem] border border-${result.color}-100 shadow-sm`}>
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <span className={`text-[10px] font-black uppercase tracking-widest text-${result.color}-600`}>{result.label}</span>
                          <button onClick={() => saveDiaryVariant(result.label as 'Corrected' | 'Pro Upgrade' | 'Model Essay', result.text)} className="text-xs font-black text-kitty-600 hover:text-kitty-700">
                            Save to Diary
                          </button>
                        </div>
                        <p className="text-slate-800 text-base md:text-lg leading-relaxed font-bold break-words">{result.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-16 glass rounded-[4rem] border-2 border-dashed border-slate-200">
                    <PenTool size={64} className="text-slate-200 mb-6" />
                    <p className="text-lg text-slate-400 font-black">AI feedback will appear here once you submit.</p>
                  </div>
                )}
                {writingEntries.length > 0 && (
                  <div className="bg-white rounded-[3rem] border border-slate-100 p-8 shadow-sm">
                    <h3 className="text-xl font-black text-slate-800 mb-5">Saved Diaries</h3>
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
            <div className="h-full p-16 max-w-6xl mx-auto overflow-y-auto no-scrollbar animate-in fade-in duration-1000">
              <div className="text-center mb-16">
                <h2 className="text-5xl font-black text-slate-900 mb-4">Exam Hub</h2>
                <p className="text-slate-400 text-xl font-medium">External resources to supercharge your official preparation.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {(EXAM_RESOURCES[language] || []).map((resource, index) => (
                  <a key={index} href={resource.url} target="_blank" rel="noreferrer" className="bg-white p-12 rounded-[4rem] shadow-sm hover:shadow-2xl transition-all border border-slate-100 flex items-center gap-10 group">
                    <div className={`p-8 bg-${resource.color}-50 text-${resource.color}-500 rounded-[2.5rem] group-hover:scale-110 transition-transform`}>
                      <resource.icon size={48} />
                    </div>
                    <div>
                      <h4 className="text-3xl font-black text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">{resource.name}</h4>
                      <p className="text-slate-400 text-lg font-medium">{resource.desc}</p>
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
