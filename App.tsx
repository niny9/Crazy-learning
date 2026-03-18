import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Camera,
  CheckCircle,
  FileText,
  Globe,
  GraduationCap,
  Headphones,
  Mic,
  PenTool,
  Plus,
  RefreshCw,
  Send,
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
  ChatMessage,
  DailyContent,
  DiaryEntry,
  SavedSentence,
  SceneContext,
  SceneHint,
  SceneWord,
  SpeakingFeedback,
  VocabItem,
  WritingEntry,
  WritingFeedback,
} from './types';
import * as AIService from './services/aiService';

type SpeechRecognitionAlternative = {
  transcript: string;
};

type SpeechRecognitionResult = {
  isFinal: boolean;
  0: SpeechRecognitionAlternative;
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResult>;
};

type BrowserSpeechRecognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type SpeakingMode = 'words' | 'sentences';
type SpeakingEvent =
  | { type: 'session_start'; environmentTag: string }
  | { type: 'intent_update'; intentTag: string }
  | { type: 'user_utterance'; lengthMs: number }
  | { type: 'ai_feedback'; tags: string[] }
  | { type: 'session_end'; reason: 'user_exit' | 'timeout' };

const SUPPORTED_LANGUAGES = [
  { code: 'English', flag: '🇺🇸', label: 'English' },
  { code: 'French', flag: '🇫🇷', label: 'Français' },
  { code: 'Japanese', flag: '🇯🇵', label: '日本語' },
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
    errorMic: 'Microphone or camera access is needed to start speaking.',
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

const DEFAULT_SCENE_CONTEXT: SceneContext = {
  objects: ['laptop', 'desk', 'notebook'],
  environmentTag: 'home_desk',
  intentTag: 'casual_chat',
  timeOfDay: 'afternoon',
  persona: 'friendly study buddy',
};

const DEFAULT_SCENE_HINT: SceneHint = {
  title: 'Detected: 🏠 Desk study',
  suggestions: ['talk about what is on your desk', 'share today’s plan', 'describe how you feel right now'],
};

const DEFAULT_SCENE_WORDS: SceneWord[] = [
  { word: 'planner', meaning: 'a tool for organizing tasks', chineseHint: '计划本', example: 'I write my study goals in my planner every morning.' },
  { word: 'focus', meaning: 'full attention on one task', chineseHint: '专注', example: 'I want to focus on speaking practice for ten minutes.' },
  { word: 'deadline', meaning: 'the time something must be finished', chineseHint: '截止时间', example: 'I have a deadline for my project this week.' },
];

const WRITING_STORAGE_KEY = 'linguaflow-writing-entries';
const VOCAB_STORAGE_KEY = 'linguaflow-vocab';
const SENTENCE_STORAGE_KEY = 'linguaflow-sentences';
const DIARY_STORAGE_KEY = 'linguaflow-diary-entries';

const App = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [language, setLanguage] = useState('English');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'vocab' | 'sentences' | 'diary'>('vocab');

  const [vocabList, setVocabList] = useState<VocabItem[]>([]);
  const [sentenceList, setSentenceList] = useState<SavedSentence[]>([]);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [seenTitles, setSeenTitles] = useState<string[]>([]);

  const [writingInput, setWritingInput] = useState('');
  const [writingTopic, setWritingTopic] = useState('');
  const [isWritingLoading, setIsWritingLoading] = useState(false);
  const [writingResult, setWritingResult] = useState<WritingFeedback | null>(null);
  const [writingEntries, setWritingEntries] = useState<WritingEntry[]>([]);
  const [writingSavedNotice, setWritingSavedNotice] = useState('');
  const [isLaunchingSpeaking, setIsLaunchingSpeaking] = useState(false);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [speakingMode, setSpeakingMode] = useState<SpeakingMode>('sentences');
  const [sceneContext, setSceneContext] = useState<SceneContext>(DEFAULT_SCENE_CONTEXT);
  const [sceneHint, setSceneHint] = useState<SceneHint>(DEFAULT_SCENE_HINT);
  const [sceneWords, setSceneWords] = useState<SceneWord[]>(DEFAULT_SCENE_WORDS);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechDraft, setSpeechDraft] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isVoiceOutputEnabled, setIsVoiceOutputEnabled] = useState(true);
  const [lastFeedback, setLastFeedback] = useState<SpeakingFeedback | null>(null);
  const [lastNextPrompt, setLastNextPrompt] = useState('');
  const [sessionSummary, setSessionSummary] = useState('');
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [selectedText, setSelectedText] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const transcriptBufferRef = useRef('');
  const utteranceStartRef = useRef<number | null>(null);
  const sceneRefreshIntervalRef = useRef<number | null>(null);
  const speakingEventsRef = useRef<SpeakingEvent[]>([]);
  const speakingListRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const holdTriggeredRef = useRef(false);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);

  const labels = UI_LABELS[language] || UI_LABELS.English;

  const logSpeakingEvent = (event: SpeakingEvent) => {
    speakingEventsRef.current = [...speakingEventsRef.current.slice(-19), event];
  };

  const isSentenceSelection = (text: string) => text.trim().split(/\s+/).filter(Boolean).length > 2;

  const addSelectionToNotebook = (text: string) => {
    if (isSentenceSelection(text)) {
      saveSentence(text);
    } else {
      void addToVocab(text);
    }
  };

  const addToVocab = async (word: string, context: string = '') => {
    const newItem: VocabItem = {
      id: Date.now().toString(),
      word,
      definition: 'Fetching...',
      chineseDefinition: '获取中...',
      contextSentence: context,
      dateAdded: new Date().toISOString(),
      language,
    };
    setVocabList((prev) => [newItem, ...prev]);
    setSidebarOpen(true);
    setActiveTab('vocab');

    try {
      const details = await AIService.generateVocabContext(word, language);
      setVocabList((prev) => prev.map((item) => (item.id === newItem.id ? { ...item, ...details } : item)));
    } catch (error) {
      console.error(error);
    }
  };

  const saveSentence = (text: string) => {
    const newSentence: SavedSentence = {
      id: Date.now().toString(),
      text,
      source: dailyContent?.title || 'Manual',
      dateAdded: new Date().toISOString(),
      language,
    };
    setSentenceList((prev) => [newSentence, ...prev]);
    setSidebarOpen(true);
    setActiveTab('sentences');
  };

  const saveWritingEntry = () => {
    if (!writingResult || !writingInput.trim()) return;

    const entry: WritingEntry = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      topic: writingTopic || 'Free writing',
      original: writingInput,
      feedback: writingResult,
    };

    setWritingEntries((prev) => [entry, ...prev].slice(0, 20));
    setWritingSavedNotice('Today’s diary is saved.');
    window.setTimeout(() => setWritingSavedNotice(''), 2200);
  };

  const saveDiaryVariant = (sourceLabel: 'Corrected' | 'Pro Upgrade' | 'Model Essay', content: string) => {
    if (!content.trim()) return;

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
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionRect(null);
      return;
    }

    const text = selection.toString().trim();
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
    try {
      if (type === 'reading') {
        const data = await AIService.getReadingSuggestions('Intermediate', language);
        setDailyContent(data[0]);
      } else {
        const data = await AIService.getDailyListeningContent(language, seenTitles);
        setDailyContent(data);
        setSeenTitles((prev) => [...prev, data.title]);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handleTTS = async () => {
    if (!dailyContent?.content) return;

    setIsTTSLoading(true);
    try {
      await playGeneratedSpeech(dailyContent.content);
    } catch (error) {
      console.error('TTS failed', error);
    } finally {
      setIsTTSLoading(false);
    }
  };

  const handleWritingSubmit = async () => {
    if (!writingInput.trim()) return;
    setIsWritingLoading(true);
    try {
      const feedback = await AIService.analyzeWriting(writingInput, language);
      setWritingResult(feedback);
    } finally {
      setIsWritingLoading(false);
    }
  };

  const getSpeechRecognitionApi = () => {
    return (
      (window as Window & { SpeechRecognition?: BrowserSpeechRecognitionConstructor; webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor }).SpeechRecognition ||
      (window as Window & { SpeechRecognition?: BrowserSpeechRecognitionConstructor; webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor }).webkitSpeechRecognition
    );
  };

  const stopMediaStream = () => {
    if (sceneRefreshIntervalRef.current) {
      clearInterval(sceneRefreshIntervalRef.current);
      sceneRefreshIntervalRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  };

  const stopCurrentSpeechPlayback = () => {
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
  };

  const playGeneratedSpeech = async (text: string) => {
    if (!isVoiceOutputEnabled || !text.trim()) return;

    try {
      stopCurrentSpeechPlayback();
      const { audioBase64, mimeType } = await AIService.synthesizeSpeech(text);
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
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = language === 'French' ? 'fr-FR' : language === 'Japanese' ? 'ja-JP' : 'en-US';
        utterance.rate = 0.95;
        window.speechSynthesis.speak(utterance);
      }
    }
  };

  const captureCurrentFrame = async (): Promise<string | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.72);
  };

  const applySceneAnalysis = async (firstUtterance = '') => {
    try {
      const imageBase64 = await captureCurrentFrame();
      const result = await AIService.analyzeSceneContext(language, imageBase64, firstUtterance, sceneContext);
      setSceneContext(result.context);
      setSceneHint(result.hint);
      if (result.words?.length) setSceneWords(result.words);
      if (result.context.intentTag && result.context.intentTag !== sceneContext.intentTag) {
        logSpeakingEvent({ type: 'intent_update', intentTag: result.context.intentTag });
      }
      if (!chatMessages.length) {
        setChatMessages([{ role: 'model', text: result.opener }]);
        void playGeneratedSpeech(result.opener);
      }
    } catch (error) {
      console.error(error);
      if (!chatMessages.length) {
        setChatMessages([
          {
            role: 'model',
            text: 'I am here with you. Tell me what you can see around you, and we will start with a simple real-life conversation.',
          },
        ]);
      }
    }
  };

  const endSpeakingSession = (reason: 'user_exit' | 'timeout') => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopMediaStream();
    stopCurrentSpeechPlayback();
    setIsListening(false);
    setSpeechDraft('');
    setChatInput('');
    setIsChatLoading(false);
    setIsSpeaking(false);
    setIsConnecting(false);
    setIsCameraReady(false);
    setLastFeedback(null);
    setLastNextPrompt('');
    setSessionSummary('');
    logSpeakingEvent({ type: 'session_end', reason });
  };

  const enterSpeakingMode = async () => {
    setIsLaunchingSpeaking(true);
    setIsConnecting(true);
    setErrorMsg(null);
    setChatMessages([]);
    setSceneContext(DEFAULT_SCENE_CONTEXT);
    setSceneHint(DEFAULT_SCENE_HINT);
    setSceneWords(DEFAULT_SCENE_WORDS);
    setLastFeedback(null);
    setLastNextPrompt('');
    setSessionSummary('');
    speakingEventsRef.current = [];
    stopCurrentSpeechPlayback();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true });
      mediaStreamRef.current = stream;
      setMode(AppMode.SPEAKING);
      setIsSpeaking(true);
      setIsCameraReady(false);
      logSpeakingEvent({ type: 'session_start', environmentTag: DEFAULT_SCENE_CONTEXT.environmentTag });
      window.setTimeout(() => {
        void applySceneAnalysis('');
      }, 1200);
      sceneRefreshIntervalRef.current = window.setInterval(() => {
        void applySceneAnalysis('');
      }, 22000);
    } catch (error) {
      console.error(error);
      setErrorMsg(labels.errorMic);
      setMode(AppMode.DASHBOARD);
    } finally {
      setIsConnecting(false);
      setIsLaunchingSpeaking(false);
    }
  };

  const submitUtterance = async (utterance: string) => {
    if (!utterance.trim() || isChatLoading) return;

    const duration = utteranceStartRef.current ? Date.now() - utteranceStartRef.current : 0;
    logSpeakingEvent({ type: 'user_utterance', lengthMs: duration });
    utteranceStartRef.current = null;

    const userMessage: ChatMessage = { role: 'user', text: utterance.trim() };
    const history = [...chatMessages, userMessage].slice(-10);
    setChatMessages(history);
    setChatInput('');
    setSpeechDraft('');
    setIsChatLoading(true);

    try {
      const imageBase64 = await captureCurrentFrame();
      let nextContext = sceneContext;
      let nextHint = sceneHint;

      try {
        const sceneResult = await AIService.analyzeSceneContext(language, imageBase64, utterance, sceneContext);
        nextContext = sceneResult.context;
        nextHint = sceneResult.hint;
      } catch (sceneError) {
        console.error('Scene analysis failed', sceneError);
      }

      const turn = await AIService.sendSpeakingTurn(language, speakingMode, nextContext, nextHint, history, utterance);

      setSceneContext(turn.context);
      setSceneHint(turn.hint);
      if (turn.words?.length) setSceneWords(turn.words);
      if (turn.intentUpdated && turn.intentUpdated !== sceneContext.intentTag) {
        logSpeakingEvent({ type: 'intent_update', intentTag: turn.intentUpdated });
      }
      if (turn.feedback?.tags?.length) {
        logSpeakingEvent({ type: 'ai_feedback', tags: turn.feedback.tags });
      }

      setLastFeedback(turn.feedback);
      setLastNextPrompt(turn.nextPrompt || '');
      setSessionSummary(turn.feedback?.summary || '');
      setChatMessages((prev) => [...prev.slice(-9), { role: 'model', text: turn.reply, feedback: turn.feedback }]);
      await playGeneratedSpeech(turn.reply);
    } catch (error) {
      console.error(error);
      const fallbackReply =
        speakingMode === 'words'
          ? 'Nice try. Pick one thing you can see and describe it with one short sentence, and I will help you polish it.'
          : 'Let’s keep it simple. Tell me one thing about your current scene, and I will reply like a real conversation partner.';
      const fallbackFeedback: SpeakingFeedback = {
        summary: 'Your input came through. Let’s keep the flow going with one shorter sentence.',
        suggestedSentence:
          speakingMode === 'words'
            ? 'This is my laptop, and I use it for studying English.'
            : 'I am at my desk now, and I want to practice speaking for a few minutes.',
        tags: ['fluency'],
        level: 'easy',
      };
      setLastFeedback(fallbackFeedback);
      setLastNextPrompt('Try one short sentence about what you see right now.');
      setSessionSummary(fallbackFeedback.summary);
      setChatMessages((prev) => [...prev.slice(-9), { role: 'model', text: fallbackReply, feedback: fallbackFeedback }]);
      await playGeneratedSpeech(fallbackReply);
      setErrorMsg('Speaking stayed available, but the AI scene coach had a temporary network hiccup.');
    } finally {
      setIsChatLoading(false);
    }
  };

  const stopVoiceInput = async () => {
    const finalText = transcriptBufferRef.current.trim() || chatInput.trim();
    holdTriggeredRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setSpeechDraft('');
    if (finalText) {
      setChatInput(finalText);
      transcriptBufferRef.current = '';
      await submitUtterance(finalText);
    }
  };

  const startVoiceInput = () => {
    const SpeechRecognitionApi = getSpeechRecognitionApi();
    if (!SpeechRecognitionApi) {
      setErrorMsg('This browser does not support voice input. Please type instead.');
      return;
    }
    if (isListening) return;

    const recognition = new SpeechRecognitionApi();
    recognition.lang = SPEECH_RECOGNITION_LOCALE[language] || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;
    transcriptBufferRef.current = '';
    utteranceStartRef.current = Date.now();

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (finalTranscript.trim()) {
        transcriptBufferRef.current = `${transcriptBufferRef.current} ${finalTranscript.trim()}`.trim();
        setChatInput(transcriptBufferRef.current);
      }
      setSpeechDraft(interimTranscript.trim());
    };

    recognition.onerror = (event) => {
      console.error(event.error);
      recognitionRef.current = null;
      setIsListening(false);
      setSpeechDraft('');
      if (event.error !== 'aborted') {
        setErrorMsg(`Voice input error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
      setSpeechDraft('');
    };

    recognitionRef.current = recognition;
    setErrorMsg(null);
    setIsListening(true);
    recognition.start();
  };

  useEffect(() => {
    if (videoRef.current && mediaStreamRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
      videoRef.current.onloadedmetadata = () => setIsCameraReady(true);
      videoRef.current.play().catch(() => {});
    }
  }, [isSpeaking, mode]);

  useEffect(() => {
    if (speakingListRef.current) {
      speakingListRef.current.scrollTop = speakingListRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading, lastFeedback]);

  useEffect(() => {
    setSpeechSupported(Boolean(getSpeechRecognitionApi()));
  }, []);

  useEffect(() => {
    try {
      const storedVocab = window.localStorage.getItem(VOCAB_STORAGE_KEY);
      const storedSentences = window.localStorage.getItem(SENTENCE_STORAGE_KEY);
      const stored = window.localStorage.getItem(WRITING_STORAGE_KEY);
      const storedDiaries = window.localStorage.getItem(DIARY_STORAGE_KEY);
      if (storedVocab) {
        setVocabList(JSON.parse(storedVocab) as VocabItem[]);
      }
      if (storedSentences) {
        setSentenceList(JSON.parse(storedSentences) as SavedSentence[]);
      }
      if (stored) {
        setWritingEntries(JSON.parse(stored) as WritingEntry[]);
      }
      if (storedDiaries) {
        setDiaryEntries(JSON.parse(storedDiaries) as DiaryEntry[]);
      }
    } catch (error) {
      console.error('Failed to load notebook entries', error);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(VOCAB_STORAGE_KEY, JSON.stringify(vocabList));
      window.localStorage.setItem(SENTENCE_STORAGE_KEY, JSON.stringify(sentenceList));
      window.localStorage.setItem(WRITING_STORAGE_KEY, JSON.stringify(writingEntries));
      window.localStorage.setItem(DIARY_STORAGE_KEY, JSON.stringify(diaryEntries));
    } catch (error) {
      console.error('Failed to save notebook entries', error);
    }
  }, [vocabList, sentenceList, writingEntries, diaryEntries]);

  useEffect(() => {
    if (mode !== AppMode.SPEAKING) {
      recognitionRef.current?.stop();
      recognitionRef.current = null;
      stopMediaStream();
      setIsListening(false);
      stopCurrentSpeechPlayback();
    }
  }, [mode]);

  useEffect(() => () => {
    recognitionRef.current?.stop();
    stopMediaStream();
    stopCurrentSpeechPlayback();
  }, []);

  const feedbackPill = (tag: 'fluency' | 'accuracy' | 'vocabulary') => {
    const styles: Record<string, string> = {
      fluency: 'bg-emerald-50 text-emerald-600',
      accuracy: 'bg-blue-50 text-blue-600',
      vocabulary: 'bg-orange-50 text-orange-600',
    };
    return styles[tag];
  };

  return (
    <div className="h-screen w-screen bg-kitty-50 flex overflow-hidden relative">
      {selectionRect && (
        <div
          style={{ top: selectionRect.top - 80, left: selectionRect.left + selectionRect.width / 2 - 100 }}
          className="fixed z-[100] bg-slate-900 text-white p-2.5 rounded-3xl shadow-2xl flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200"
        >
          <button onClick={() => { addSelectionToNotebook(selectedText); setSelectionRect(null); }} className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-800 rounded-2xl text-xs font-black transition-all border-r border-slate-700">
            <Plus size={16} /> {isSentenceSelection(selectedText) ? 'Sentence' : 'Word'}
          </button>
          <button onClick={() => { saveSentence(selectedText); setSelectionRect(null); }} className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-800 rounded-2xl text-xs font-black transition-all">
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

        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
          {(activeTab === 'vocab' ? vocabList : activeTab === 'sentences' ? sentenceList : diaryEntries).filter((item) => item.language === language).map((item) => (
            <div key={item.id} className="bg-white border border-kitty-100 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all group animate-in slide-in-from-right-4">
              <div className="flex justify-between items-start mb-2">
                <span className="font-black text-slate-800 text-xl tracking-tight">
                  {activeTab === 'vocab'
                    ? (item as VocabItem).word
                    : activeTab === 'sentences'
                      ? `${(item as SavedSentence).text.substring(0, 30)}...`
                      : (item as DiaryEntry).title}
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
              <div className="text-xs text-slate-500 italic leading-relaxed bg-kitty-50/50 p-4 rounded-2xl">
                "
                {activeTab === 'vocab'
                  ? (item as VocabItem).contextSentence
                  : activeTab === 'sentences'
                    ? (item as SavedSentence).text
                    : (item as DiaryEntry).content}
                "
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-20 px-10 flex items-center justify-between glass shrink-0 z-40">
          <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setMode(AppMode.DASHBOARD)}>
            <div className="bg-kitty-500 text-white p-2.5 rounded-2xl shadow-lg group-hover:rotate-12 transition-all"><Star size={24} /></div>
            <div>
              <h1 className="font-black text-2xl text-slate-900 tracking-tighter">LinguaFlow</h1>
              <p className="text-[10px] font-black text-kitty-400 uppercase tracking-widest">AI English Coach</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex bg-white p-1 rounded-2xl border border-kitty-100 shadow-sm">
              {SUPPORTED_LANGUAGES.map((item) => (
                <button key={item.code} onClick={() => { setLanguage(item.code); setMode(AppMode.DASHBOARD); }} className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${language === item.code ? 'bg-kitty-500 text-white shadow-md' : 'text-slate-400 hover:bg-kitty-50'}`}>
                  <span>{item.flag}</span>
                  <span className="hidden md:block">{item.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setSidebarOpen(true)} className="relative p-3.5 bg-white rounded-2xl shadow-sm text-kitty-500 hover:scale-105 border border-kitty-100 transition-all">
              <ShoppingBag size={24} />
              {(vocabList.length + sentenceList.length) > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white">!</span>}
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-hidden relative">
          {isLaunchingSpeaking && (
            <div className="absolute inset-0 z-[60] bg-slate-950/92 backdrop-blur-sm flex items-center justify-center">
              <div className="rounded-[2.5rem] bg-white px-8 py-7 shadow-2xl text-center">
                <div className="inline-flex items-center gap-3 rounded-full bg-kitty-50 px-5 py-3 text-kitty-600 font-black mb-4">
                  <RefreshCw className="animate-spin" size={18} /> Opening camera...
                </div>
                <p className="text-slate-500 font-semibold">We are getting your scene ready for a low-pressure speaking session.</p>
              </div>
            </div>
          )}
          {mode === AppMode.DASHBOARD && (
            <div className="h-full p-12 max-w-7xl mx-auto overflow-y-auto no-scrollbar pb-32">
              <header className="mb-20 text-center animate-in fade-in slide-in-from-top-4 duration-1000">
                <div className="inline-block bg-kitty-100 text-kitty-600 px-6 py-2 rounded-full text-sm font-black uppercase tracking-widest mb-6">Mastery Hub</div>
                <h2 className="text-6xl font-black text-slate-900 mb-6 tracking-tight leading-none">{labels.welcome}</h2>
                <p className="text-slate-400 text-2xl font-medium max-w-2xl mx-auto">{labels.sub}</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  { m: AppMode.SPEAKING, icon: Mic, color: 'emerald', label: labels.speaking, tag: 'Scene Explorer' },
                  { m: AppMode.LISTENING, icon: Headphones, color: 'indigo', label: labels.listening, tag: 'Media' },
                  { m: AppMode.WRITING, icon: PenTool, color: 'pink', label: labels.writing, tag: 'Analysis' },
                  { m: AppMode.READING, icon: BookOpen, color: 'orange', label: labels.reading, tag: 'Library' },
                  { m: AppMode.EXAM_PORTAL, icon: GraduationCap, color: 'blue', label: labels.exams, tag: 'Tests' },
                ].map((card, index) => (
                  <div
                    key={card.m}
                    onClick={() => {
                      if (card.m === AppMode.SPEAKING) {
                        void enterSpeakingMode();
                        return;
                      }
                      setMode(card.m);
                      if (card.m === AppMode.READING || card.m === AppMode.LISTENING) {
                        void loadDailyContent(card.m === AppMode.READING ? 'reading' : 'listening');
                      }
                    }}
                    className="group bg-white p-10 rounded-[3rem] cursor-pointer shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all border border-slate-100 hover:border-kitty-200 flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-700"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    <div className={`w-20 h-20 bg-${card.color}-50 text-${card.color}-500 rounded-[2rem] flex items-center justify-center mb-8 group-hover:scale-110 transition-transform`}>
                      <card.icon size={40} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{card.label}</h3>
                        <span className={`text-[10px] font-black px-3 py-1 rounded-full bg-${card.color}-100 text-${card.color}-600 uppercase`}>{card.tag}</span>
                      </div>
                      <p className="text-slate-400 font-medium leading-relaxed">
                        {card.m === AppMode.SPEAKING
                          ? 'Tap once and speak inside your real environment.'
                          : `Level up your ${language} skills with adaptive AI-powered sessions.`}
                      </p>
                    </div>
                    <div className="mt-8 flex justify-end">
                      <div className="p-4 bg-slate-50 rounded-full group-hover:bg-kitty-500 group-hover:text-white transition-all"><ArrowRight /></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === AppMode.SPEAKING && (
            <div className="h-full relative bg-slate-950 overflow-hidden">
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              <div className="absolute inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/35 to-slate-950/85" />
              {!isCameraReady && (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.08),_transparent_50%),linear-gradient(180deg,#0f172a,#111827)]" />
              )}

              <div className="relative z-10 h-full p-6 md:p-10 flex flex-col">
                <div className="flex items-start justify-between gap-4 mb-6">
                  <div className="max-w-2xl rounded-[2.5rem] bg-white/90 backdrop-blur-md p-6 shadow-2xl border border-white/60">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-emerald-600">
                        <Camera size={14} /> Scene Explorer
                      </span>
                      <span className="text-xs font-black uppercase tracking-widest text-slate-400">{sceneContext.persona || 'Study buddy mode'}</span>
                      <button onClick={() => setIsVoiceOutputEnabled((prev) => !prev)} className="ml-auto rounded-full bg-slate-100 px-3 py-2 text-[11px] font-black uppercase tracking-widest text-slate-500">
                        {isVoiceOutputEnabled ? 'Voice on' : 'Voice off'}
                      </button>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-2">{sceneHint.title}</h2>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {sceneHint.suggestions.map((suggestion, index) => (
                        <span key={`${suggestion}-${index}`} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600">
                          {suggestion}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-slate-500 font-medium">
                      Objects in view: {sceneContext.objects.join(' · ')} {sceneContext.intentTag ? `· Intent: ${sceneContext.intentTag.replace(/_/g, ' ')}` : ''}
                    </p>
                  </div>

                  <button onClick={() => endSpeakingSession('user_exit')} className="rounded-full bg-white/90 px-6 py-3 text-sm font-black text-slate-700 shadow-lg backdrop-blur-md border border-white/60 flex items-center gap-3">
                    <Square size={16} /> End
                  </button>
                </div>

                <div className="flex items-center gap-3 mb-5">
                  {(['words', 'sentences'] as SpeakingMode[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setSpeakingMode(tab)}
                      className={`px-5 py-3 rounded-full text-sm font-black transition-all ${speakingMode === tab ? 'bg-white text-kitty-600 shadow-lg' : 'bg-white/15 text-white border border-white/20 backdrop-blur-md'}`}
                    >
                      {tab === 'words' ? labels.words : labels.sentences}
                    </button>
                  ))}
                </div>

                <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-6 flex-1 min-h-0">
                  <div className="rounded-[2.75rem] bg-white/12 backdrop-blur-md border border-white/15 shadow-2xl p-5 md:p-7 flex flex-col min-h-0">
                    <div ref={speakingListRef} className="flex-1 overflow-y-auto no-scrollbar space-y-4 pr-2">
                      {isConnecting && (
                        <div className="rounded-[2rem] bg-white/15 px-6 py-5 text-white/90 flex items-center gap-3">
                          <RefreshCw className="animate-spin" size={18} /> {labels.connecting}
                        </div>
                      )}
                      {!isCameraReady && !isConnecting && (
                        <div className="rounded-[2rem] bg-white/15 px-6 py-5 text-white/90">
                          Camera is warming up. You can already start speaking if you want.
                        </div>
                      )}

                      {chatMessages.map((message, index) => (
                        <div key={`${message.role}-${index}`} className={`max-w-[88%] ${message.role === 'user' ? 'ml-auto' : ''}`}>
                          <div className={`rounded-[2rem] px-6 py-5 text-lg leading-relaxed shadow-sm ${message.role === 'user' ? 'bg-kitty-500 text-white' : 'bg-white/92 text-slate-700'}`}>
                            {message.text}
                          </div>
                          {message.feedback && (
                            <div className="mt-3 rounded-[1.5rem] bg-white/85 px-5 py-4 shadow-sm">
                              <p className="text-sm font-bold text-slate-700">{message.feedback.summary}</p>
                              {message.feedback.suggestedSentence && (
                                <div className="mt-3 rounded-2xl bg-kitty-50 px-4 py-3 text-sm text-kitty-700 font-medium">
                                  Try this: {message.feedback.suggestedSentence}
                                </div>
                              )}
                              {message.feedback.tags?.length ? (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  {message.feedback.tags.map((tag) => (
                                    <span key={tag} className={`px-3 py-1 rounded-full text-xs font-black ${feedbackPill(tag)}`}>
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      ))}

                      {isChatLoading && (
                        <div className="max-w-[88%] rounded-[2rem] px-6 py-5 text-lg bg-white/80 text-slate-500">
                          Your scene buddy is thinking...
                        </div>
                      )}
                    </div>

                    <div className="mt-5">
                      {speechDraft && (
                        <div className="mb-3 rounded-[1.5rem] bg-emerald-50/95 px-5 py-4 text-sm font-semibold text-emerald-700">
                          Live transcript: {speechDraft}
                        </div>
                      )}
                      {lastNextPrompt && (
                        <div className="mb-3 rounded-[1.5rem] bg-white/80 px-5 py-4 text-sm font-semibold text-slate-600">
                          Next idea: {lastNextPrompt}
                        </div>
                      )}
                      {errorMsg && (
                        <div className="mb-3 rounded-[1.5rem] bg-red-50/95 px-5 py-4 text-sm font-semibold text-red-600">
                          {errorMsg}
                        </div>
                      )}
                      <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-end">
                        <div className="flex-1 rounded-[2rem] bg-white/90 px-5 py-4">
                          <textarea
                            value={chatInput}
                            onChange={(event) => setChatInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                void submitUtterance(chatInput);
                              }
                            }}
                            placeholder={speakingMode === 'words' ? 'Repeat a word, describe an object, or ask what something means...' : 'Say what you see, what you need, or just start talking...'}
                            className="w-full min-h-24 resize-none outline-none bg-transparent text-lg text-slate-700 placeholder:text-slate-300"
                          />
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={() => {
                              if (!speechSupported) return;
                              if (holdTriggeredRef.current) {
                                holdTriggeredRef.current = false;
                                return;
                              }
                              if (isListening) {
                                void stopVoiceInput();
                              } else {
                                startVoiceInput();
                              }
                            }}
                            onPointerDown={() => {
                              if (!speechSupported || isListening) return;
                              holdTimerRef.current = window.setTimeout(() => {
                                holdTriggeredRef.current = true;
                                startVoiceInput();
                              }, 180);
                            }}
                            onPointerUp={() => {
                              if (holdTimerRef.current) {
                                clearTimeout(holdTimerRef.current);
                                holdTimerRef.current = null;
                              }
                              if (holdTriggeredRef.current) {
                                void stopVoiceInput();
                              }
                            }}
                            onPointerLeave={() => {
                              if (holdTimerRef.current) {
                                clearTimeout(holdTimerRef.current);
                                holdTimerRef.current = null;
                              }
                              if (holdTriggeredRef.current) {
                                void stopVoiceInput();
                              }
                            }}
                            disabled={!speechSupported || isConnecting}
                            className={`min-w-[170px] md:min-w-[200px] rounded-[2rem] px-7 py-6 text-white font-black shadow-2xl transition-all ${isListening ? 'bg-red-500' : 'bg-kitty-500 hover:bg-kitty-600'} disabled:opacity-50`}
                          >
                            <div className="flex flex-col items-center gap-2">
                              <Mic size={24} />
                              <span>{isListening ? 'Release to send' : 'Press & hold / Tap to speak'}</span>
                            </div>
                          </button>
                          <button onClick={() => void submitUtterance(chatInput)} disabled={!chatInput.trim() || isChatLoading} className="rounded-[2rem] bg-white/90 px-6 py-6 text-slate-700 font-black shadow-2xl disabled:opacity-50 flex items-center gap-3">
                            <Send size={18} /> Send
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-5 min-h-0">
                    <div className="rounded-[2.5rem] bg-white/88 backdrop-blur-md p-6 shadow-2xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-black text-slate-800">{speakingMode === 'words' ? 'Scene Words' : 'Session Mood'}</h3>
                        {speakingMode === 'words' && (
                          <button onClick={() => void applySceneAnalysis(chatInput)} className="text-sm font-black text-kitty-600">
                            Show more words
                          </button>
                        )}
                      </div>
                      {speakingMode === 'words' ? (
                        <div className="space-y-3">
                          {sceneWords.slice(0, 5).map((word) => (
                            <div key={word.word} className="rounded-[1.75rem] border border-slate-100 bg-white px-5 py-4 shadow-sm">
                              <div className="flex items-center justify-between gap-3 mb-1">
                                <span className="text-lg font-black text-slate-800">{word.word}</span>
                                {word.chineseHint && <span className="text-xs font-black text-kitty-500">{word.chineseHint}</span>}
                              </div>
                              <p className="text-sm text-slate-500 font-semibold">{word.meaning}</p>
                              <p className="mt-2 text-sm text-slate-700">{word.example}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="rounded-[1.75rem] bg-kitty-50 px-5 py-4">
                            <p className="text-xs font-black uppercase tracking-widest text-kitty-500 mb-2">Persona</p>
                            <p className="text-lg font-black text-slate-800">{sceneContext.persona || 'Friendly study buddy'}</p>
                          </div>
                          <div className="rounded-[1.75rem] bg-slate-50 px-5 py-4">
                            <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2">Current Focus</p>
                            <p className="text-sm text-slate-700 font-semibold">{sceneContext.intentTag ? sceneContext.intentTag.replace(/_/g, ' ') : 'casual scene talk'}</p>
                          </div>
                          {sessionSummary && (
                            <div className="rounded-[1.75rem] bg-emerald-50 px-5 py-4">
                              <p className="text-xs font-black uppercase tracking-widest text-emerald-500 mb-2">Mini Win</p>
                              <p className="text-sm text-emerald-700 font-semibold">{sessionSummary}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="rounded-[2.5rem] bg-white/88 backdrop-blur-md p-6 shadow-2xl">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-black text-slate-800">Friendly Feedback</h3>
                        <button onClick={() => void applySceneAnalysis(chatInput)} className="text-sm font-black text-kitty-600">
                          Refresh scene
                        </button>
                      </div>
                      {lastFeedback ? (
                        <div>
                          <p className="text-sm text-slate-600 font-semibold">{lastFeedback.summary}</p>
                          {lastFeedback.suggestedSentence && (
                            <div className="mt-4 rounded-[1.75rem] bg-slate-50 px-5 py-4 text-sm text-slate-700">
                              Try this: {lastFeedback.suggestedSentence}
                            </div>
                          )}
                          {lastFeedback.tags?.length ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                              {lastFeedback.tags.map((tag) => (
                                <span key={tag} className={`px-3 py-1 rounded-full text-xs font-black ${feedbackPill(tag)}`}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 font-semibold">
                          Keep it light. Say one sentence about your environment and the coach will help you sound more natural.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {(mode === AppMode.LISTENING || mode === AppMode.READING) && (
            <div className="h-full p-10 max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className={`bg-white rounded-[4rem] p-16 shadow-2xl h-full flex flex-col border ${mode === AppMode.LISTENING ? 'border-indigo-100' : 'border-orange-100'} overflow-hidden`}>
                <div className="flex justify-between items-start mb-12">
                  <div>
                    <div className={`inline-block px-6 py-2 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 ${mode === AppMode.LISTENING ? 'bg-indigo-50 text-indigo-500' : 'bg-orange-50 text-orange-500'}`}>
                      {dailyContent?.source || 'Curated Content'}
                    </div>
                    <h2 className="text-5xl font-black text-slate-900 leading-tight tracking-tight">{dailyContent?.title || 'Finding the best material...'}</h2>
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
                <div className="flex-1 overflow-y-auto pr-6 no-scrollbar text-2xl text-slate-700 leading-loose font-medium whitespace-pre-wrap selection:bg-kitty-200" onMouseUp={handleTextSelection}>
                  {dailyContent?.content || 'Synchronizing with external libraries...'}
                </div>
              </div>
            </div>
          )}

          {mode === AppMode.WRITING && (
            <div className="h-full p-10 max-w-7xl mx-auto flex gap-10 animate-in fade-in duration-700">
              <div className="flex-1 flex flex-col bg-white rounded-[4rem] p-12 shadow-2xl border border-pink-100 relative overflow-hidden">
                <div className="flex justify-between items-center mb-10">
                  <h2 className="text-3xl font-black text-slate-800">Writing Studio</h2>
                  <div className="flex items-center gap-3">
                    <button onClick={async () => { setIsWritingLoading(true); setWritingTopic(await AIService.generateWritingTopic(language)); setIsWritingLoading(false); }} className="flex items-center gap-3 bg-pink-50 text-pink-600 px-8 py-4 rounded-full font-black text-sm hover:bg-pink-100 transition-all">
                      <Wand2 size={20} /> {labels.inspire}
                    </button>
                    <button onClick={saveWritingEntry} disabled={!writingResult || !writingInput.trim()} className="flex items-center gap-3 bg-emerald-50 text-emerald-600 px-8 py-4 rounded-full font-black text-sm hover:bg-emerald-100 transition-all disabled:opacity-50">
                      <Bookmark size={18} /> Save Diary
                    </button>
                  </div>
                </div>
                {writingSavedNotice && <div className="mb-6 rounded-[1.75rem] bg-emerald-50 px-6 py-4 text-sm font-black text-emerald-700">{writingSavedNotice}</div>}
                {writingTopic && <div className="mb-10 p-8 bg-pink-50/30 rounded-[2.5rem] border border-pink-100 text-xl font-bold italic text-pink-800">"{writingTopic}"</div>}
                <textarea value={writingInput} onChange={(event) => setWritingInput(event.target.value)} placeholder="Type your story, essay or journal here..." className="flex-1 w-full resize-none outline-none text-2xl text-slate-600 bg-transparent placeholder:text-slate-200 font-medium leading-relaxed no-scrollbar" />
                <button onClick={handleWritingSubmit} disabled={isWritingLoading || !writingInput.trim()} className="mt-10 w-full py-6 bg-kitty-500 text-white rounded-3xl font-black text-2xl hover:bg-kitty-600 disabled:opacity-50 shadow-xl transition-all flex items-center justify-center gap-4">
                  {isWritingLoading ? <RefreshCw className="animate-spin" /> : <><CheckCircle size={28} /> {labels.check}</>}
                </button>
              </div>
              <div className="w-[480px] space-y-8 overflow-y-auto no-scrollbar">
                {writingResult ? (
                  <div className="space-y-6 animate-in slide-in-from-right-8 duration-500" onMouseUp={handleTextSelection}>
                    {[
                      { label: 'Corrected', text: writingResult.corrected, color: 'emerald' },
                      { label: 'Pro Upgrade', text: writingResult.upgraded, color: 'indigo' },
                      { label: 'Model Essay', text: writingResult.modelEssay, color: 'slate' },
                    ].map((result, index) => (
                      <div key={index} className={`bg-${result.color}-50 p-10 rounded-[3rem] border border-${result.color}-100 shadow-sm`}>
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <span className={`text-[10px] font-black uppercase tracking-widest text-${result.color}-600`}>{result.label}</span>
                          <button onClick={() => saveDiaryVariant(result.label as 'Corrected' | 'Pro Upgrade' | 'Model Essay', result.text)} className="text-xs font-black text-kitty-600 hover:text-kitty-700">
                            Save to Diary
                          </button>
                        </div>
                        <p className="text-slate-800 text-lg leading-relaxed font-bold">{result.text}</p>
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
