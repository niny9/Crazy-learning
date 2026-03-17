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
  MessageSquare,
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
  Zap
} from 'lucide-react';
import { AppMode, ChatMessage, DailyContent, SavedSentence, SpeakingScenario, VocabItem, WritingFeedback } from './types';
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

const SUPPORTED_LANGUAGES = [
  { code: 'English', flag: '🇺🇸', label: 'English' },
  { code: 'French', flag: '🇫🇷', label: 'Français' },
  { code: 'Japanese', flag: '🇯🇵', label: '日本語' },
];

const SPEAKING_SCENARIOS: SpeakingScenario[] = [
  { id: 'casual', title: 'Casual Chat', description: 'Just a friendly conversation about your day.', icon: MessageSquare, prompt: 'You are a friendly personal language tutor. Start a casual conversation with the user.' },
  { id: 'interview', title: 'Job Interview', description: 'Practice for your dream job with professional questions.', icon: FileText, prompt: 'You are an interviewer for a global tech company. Conduct a professional job interview in the target language.' },
  { id: 'coffee', title: 'Ordering Coffee', description: 'Roleplay a busy morning at a Starbucks-like cafe.', icon: ShoppingBag, prompt: 'You are a barista at a busy coffee shop. The user is a customer. Take their order and handle small talk.' },
  { id: 'travel', title: 'Airport Check-in', description: 'Navigate the complexities of international travel.', icon: Globe, prompt: 'You are a check-in agent at an international airport. Assist the user with their flight and luggage.' },
  { id: 'immersive', title: 'Scene Explorer', description: 'Use what the learner describes around them to roleplay naturally.', icon: Camera, prompt: 'You are an immersive language coach. Ask the learner to describe the environment around them, identify useful vocabulary from that description, and roleplay in that setting.' },
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
    connecting: 'Connecting to AI...',
    errorMic: 'AI assistant is temporarily unavailable'
  }
};

const EXAM_RESOURCES: Record<string, any[]> = {
  English: [
    { name: 'KMF (考满分)', desc: 'IELTS / TOEFL / GRE Practice', url: 'https://www.kmf.com/', icon: FileText, color: 'blue' },
    { name: 'Burning Vocab', desc: 'CET-4/6 Questions', url: 'https://zhenti.burningvocabulary.cn/', icon: Zap, color: 'red' }
  ],
  Japanese: [{ name: 'NHK Web Easy', desc: 'Easy Japanese News', url: 'https://www3.nhk.or.jp/news/easy/', icon: Headphones, color: 'orange' }],
  French: [{ name: 'RFI Savoirs', desc: 'Apprendre le francais', url: 'https://savoirs.rfi.fr/fr', icon: Globe, color: 'blue' }]
};

const SPEECH_RECOGNITION_LOCALE: Record<string, string> = {
  English: 'en-US',
  French: 'fr-FR',
  Japanese: 'ja-JP',
};

const App = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [language, setLanguage] = useState('English');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'vocab' | 'sentences'>('vocab');

  const [vocabList, setVocabList] = useState<VocabItem[]>([]);
  const [sentenceList, setSentenceList] = useState<SavedSentence[]>([]);
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [seenTitles, setSeenTitles] = useState<string[]>([]);

  const [writingInput, setWritingInput] = useState('');
  const [writingTopic, setWritingTopic] = useState('');
  const [isWritingLoading, setIsWritingLoading] = useState(false);
  const [writingResult, setWritingResult] = useState<WritingFeedback | null>(null);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<SpeakingScenario | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speechDraft, setSpeechDraft] = useState('');
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const speakingListRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  const labels = UI_LABELS[language] || UI_LABELS.English;

  const stopVoiceInput = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setSpeechDraft('');
  };

  const addToVocab = async (word: string, context: string = '') => {
    const newItem: VocabItem = {
      id: Date.now().toString(),
      word,
      definition: 'Fetching...',
      chineseDefinition: '获取中...',
      contextSentence: context,
      dateAdded: new Date().toISOString(),
      language
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
      language
    };
    setSentenceList((prev) => [newSentence, ...prev]);
    setSidebarOpen(true);
    setActiveTab('sentences');
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
    if (!dailyContent?.content) {
      return;
    }

    setIsTTSLoading(true);
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(dailyContent.content);
      utterance.lang =
        language === 'French' ? 'fr-FR' : language === 'Japanese' ? 'ja-JP' : 'en-US';
      utterance.rate = 0.95;
      utterance.onend = () => setIsTTSLoading(false);
      utterance.onerror = () => setIsTTSLoading(false);
      window.speechSynthesis.speak(utterance);
    } catch (error) {
      console.error('TTS failed', error);
      setIsTTSLoading(false);
    }
  };

  const handleWritingSubmit = async () => {
    if (!writingInput.trim()) {
      return;
    }

    setIsWritingLoading(true);
    try {
      const feedback = await AIService.analyzeWriting(writingInput, language);
      setWritingResult(feedback);
    } finally {
      setIsWritingLoading(false);
    }
  };

  const startSpeakingSession = async (scenario: SpeakingScenario) => {
    setSelectedScenario(scenario);
    setIsConnecting(true);
    setErrorMsg(null);
    setChatMessages([]);
    setChatInput('');
    setSpeechDraft('');

    try {
      const result = await AIService.startScenarioConversation(language, scenario.prompt, scenario.title);
      setChatMessages([{ role: 'model', text: result.reply }]);
      setIsSpeaking(true);
    } catch (error) {
      console.error(error);
      setErrorMsg(labels.errorMic);
    } finally {
      setIsConnecting(false);
    }
  };

  const stopSpeakingSession = () => {
    stopVoiceInput();
    setIsSpeaking(false);
    setIsConnecting(false);
    setSelectedScenario(null);
    setChatMessages([]);
    setChatInput('');
    setIsChatLoading(false);
  };

  const startVoiceInput = () => {
    const SpeechRecognitionApi = (
      window as Window & {
        SpeechRecognition?: BrowserSpeechRecognitionConstructor;
        webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
      }
    ).SpeechRecognition || (
      window as Window & {
        SpeechRecognition?: BrowserSpeechRecognitionConstructor;
        webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
      }
    ).webkitSpeechRecognition;

    if (!SpeechRecognitionApi) {
      setErrorMsg('This browser does not support voice input. Please type instead.');
      setSpeechSupported(false);
      return;
    }

    stopVoiceInput();

    const recognition = new SpeechRecognitionApi();
    recognition.lang = SPEECH_RECOGNITION_LOCALE[language] || 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

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

      setSpeechDraft(interimTranscript.trim());
      if (finalTranscript.trim()) {
        setChatInput((prev) => `${prev} ${finalTranscript.trim()}`.trim());
      }
    };

    recognition.onerror = (event) => {
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

  const sendChatMessage = async () => {
    if (!selectedScenario || !chatInput.trim() || isChatLoading) {
      return;
    }

    const userMessage: ChatMessage = {
      role: 'user',
      text: chatInput.trim()
    };

    const nextHistory = [...chatMessages, userMessage];
    setChatMessages(nextHistory);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const result = await AIService.continueScenarioConversation(language, selectedScenario.prompt, nextHistory);
      setChatMessages((prev) => [...prev, { role: 'model', text: result.reply }]);
    } catch (error) {
      console.error(error);
      setErrorMsg('Message failed to send. Please try again.');
    } finally {
      setIsChatLoading(false);
    }
  };

  useEffect(() => {
    if (speakingListRef.current) {
      speakingListRef.current.scrollTop = speakingListRef.current.scrollHeight;
    }
  }, [chatMessages, isChatLoading]);

  useEffect(() => {
    const SpeechRecognitionApi = (
      window as Window & {
        SpeechRecognition?: BrowserSpeechRecognitionConstructor;
        webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
      }
    ).SpeechRecognition || (
      window as Window & {
        SpeechRecognition?: BrowserSpeechRecognitionConstructor;
        webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
      }
    ).webkitSpeechRecognition;
    setSpeechSupported(Boolean(SpeechRecognitionApi));
  }, []);

  useEffect(() => () => {
    stopVoiceInput();
  }, []);

  return (
    <div className="h-screen w-screen bg-kitty-50 flex overflow-hidden relative">
      {selectionRect && (
        <div
          style={{ top: selectionRect.top - 80, left: selectionRect.left + selectionRect.width / 2 - 100 }}
          className="fixed z-[100] bg-slate-900 text-white p-2.5 rounded-3xl shadow-2xl flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200"
        >
          <button onClick={() => { addToVocab(selectedText); setSelectionRect(null); }} className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-800 rounded-2xl text-xs font-black transition-all border-r border-slate-700">
            <Plus size={16} /> Word
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
            {['vocab', 'sentences'].map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab as 'vocab' | 'sentences')} className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${activeTab === tab ? 'bg-white text-kitty-600 shadow-sm' : 'text-kitty-300 hover:text-kitty-400'}`}>
                {tab === 'vocab' ? labels.words : labels.sentences}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
          {(activeTab === 'vocab' ? vocabList : sentenceList).filter((item) => item.language === language).map((item) => (
            <div key={item.id} className="bg-white border border-kitty-100 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all group animate-in slide-in-from-right-4">
              <div className="flex justify-between items-start mb-2">
                <span className="font-black text-slate-800 text-xl tracking-tight">{(item as VocabItem).word || `${(item as SavedSentence).text.substring(0, 30)}...`}</span>
                <button onClick={() => activeTab === 'vocab' ? setVocabList((prev) => prev.filter((entry) => entry.id !== item.id)) : setSentenceList((prev) => prev.filter((entry) => entry.id !== item.id))} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all"><Trash2 size={16} /></button>
              </div>
              <p className="text-sm text-kitty-500 mb-3 font-bold">{(item as VocabItem).chineseDefinition || 'Language Clip'}</p>
              <div className="text-xs text-slate-500 italic leading-relaxed bg-kitty-50/50 p-4 rounded-2xl">"{(item as VocabItem).contextSentence || (item as SavedSentence).text}"</div>
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
          {mode === AppMode.DASHBOARD && (
            <div className="h-full p-12 max-w-7xl mx-auto overflow-y-auto no-scrollbar pb-32">
              <header className="mb-20 text-center animate-in fade-in slide-in-from-top-4 duration-1000">
                <div className="inline-block bg-kitty-100 text-kitty-600 px-6 py-2 rounded-full text-sm font-black uppercase tracking-widest mb-6">Mastery Hub</div>
                <h2 className="text-6xl font-black text-slate-900 mb-6 tracking-tight leading-none">{labels.welcome}</h2>
                <p className="text-slate-400 text-2xl font-medium max-w-2xl mx-auto">{labels.sub}</p>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {[
                  { m: AppMode.SPEAKING, icon: Mic, color: 'emerald', label: labels.speaking, tag: 'Dialogue' },
                  { m: AppMode.LISTENING, icon: Headphones, color: 'indigo', label: labels.listening, tag: 'Media' },
                  { m: AppMode.WRITING, icon: PenTool, color: 'pink', label: labels.writing, tag: 'Analysis' },
                  { m: AppMode.READING, icon: BookOpen, color: 'orange', label: labels.reading, tag: 'Library' },
                  { m: AppMode.EXAM_PORTAL, icon: GraduationCap, color: 'blue', label: labels.exams, tag: 'Tests' },
                ].map((card, index) => (
                  <div
                    key={card.m}
                    onClick={() => { setMode(card.m); if (card.m === AppMode.READING || card.m === AppMode.LISTENING) loadDailyContent(card.m === AppMode.READING ? 'reading' : 'listening'); }}
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
                      <p className="text-slate-400 font-medium leading-relaxed">Level up your {language} skills with adaptive AI-powered sessions.</p>
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
            <div className="h-full flex flex-col items-center justify-center p-8">
              {!isSpeaking && !isConnecting ? (
                <div className="w-full max-w-6xl animate-in fade-in zoom-in-95 duration-500">
                  <div className="text-center mb-16">
                    <h2 className="text-5xl font-black text-slate-900 mb-4">Choose a Scenario</h2>
                    <p className="text-slate-400 text-xl font-medium">Practice with a scenario-based AI assistant powered by Zhipu.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {SPEAKING_SCENARIOS.map((scenario) => (
                      <button key={scenario.id} onClick={() => startSpeakingSession(scenario)} className="bg-white p-10 rounded-[3rem] shadow-sm hover:shadow-xl transition-all border border-slate-100 flex flex-col items-center group">
                        <div className="p-6 bg-emerald-50 text-emerald-500 rounded-[2rem] mb-6 group-hover:scale-110 transition-transform">
                          <scenario.icon size={48} />
                        </div>
                        <h4 className="text-2xl font-black text-slate-800 mb-2">{scenario.title}</h4>
                        <p className="text-slate-400 text-sm font-medium text-center">{scenario.description}</p>
                      </button>
                    ))}
                  </div>
                  {errorMsg && <p className="mt-10 text-red-500 font-bold text-center">{errorMsg}</p>}
                </div>
              ) : (
                <div className="w-full max-w-5xl bg-white rounded-[5rem] p-10 md:p-16 shadow-2xl border border-kitty-100 relative overflow-hidden flex flex-col h-[82vh]">
                  <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-4">
                      <div className="bg-emerald-50 text-emerald-500 p-4 rounded-3xl">
                        {selectedScenario?.icon && React.createElement(selectedScenario.icon, { size: 24 })}
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-800 leading-none">{selectedScenario?.title}</h3>
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1">AI Dialogue Session</p>
                      </div>
                    </div>
                    <button onClick={stopSpeakingSession} className="px-6 py-3 bg-red-50 text-red-500 rounded-full font-black hover:bg-red-100 transition-all flex items-center gap-3 border border-red-100">
                      <Square size={18} /> End Session
                    </button>
                  </div>

                  {isConnecting ? (
                    <div className="flex-1 flex flex-col items-center justify-center animate-pulse">
                      <RefreshCw size={64} className="text-kitty-300 animate-spin mb-8" />
                      <p className="text-2xl font-black text-slate-400">{labels.connecting}</p>
                    </div>
                  ) : (
                    <>
                      <div ref={speakingListRef} className="flex-1 overflow-y-auto pr-2 space-y-4 no-scrollbar">
                        {chatMessages.map((message, index) => (
                          <div key={`${message.role}-${index}`} className={`max-w-[85%] rounded-[2rem] px-6 py-5 text-lg leading-relaxed shadow-sm ${message.role === 'user' ? 'ml-auto bg-kitty-500 text-white' : 'bg-slate-50 text-slate-700 border border-slate-100'}`}>
                            {message.text}
                          </div>
                        ))}
                        {isChatLoading && (
                          <div className="max-w-[85%] rounded-[2rem] px-6 py-5 text-lg bg-slate-50 text-slate-400 border border-slate-100">
                            AI is thinking...
                          </div>
                        )}
                      </div>

                      <div className="mt-8 border-t border-slate-100 pt-6">
                        <p className="text-sm text-slate-400 mb-4">
                          Tip: use the target language directly. The assistant will roleplay and gently correct your mistakes.
                        </p>
                        {speechSupported && (
                          <div className="mb-4 flex items-center gap-3">
                            <button
                              onClick={isListening ? stopVoiceInput : startVoiceInput}
                              disabled={isChatLoading}
                              className={`px-5 py-3 rounded-full font-black text-sm border transition-all flex items-center gap-3 ${isListening ? 'bg-red-50 text-red-500 border-red-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'} disabled:opacity-50`}
                            >
                              <Mic size={16} />
                              {isListening ? 'Stop Voice Input' : 'Start Voice Input'}
                            </button>
                            <span className="text-sm text-slate-400">
                              {isListening ? 'Listening... speak naturally and we will transcribe into the text box.' : 'Use your microphone to fill the reply box.'}
                            </span>
                          </div>
                        )}
                        {speechDraft && (
                          <div className="mb-4 rounded-[1.5rem] bg-emerald-50 border border-emerald-100 px-5 py-4 text-sm text-emerald-700">
                            Live transcript: {speechDraft}
                          </div>
                        )}
                        <div className="flex gap-4">
                          <textarea
                            value={chatInput}
                            onChange={(event) => setChatInput(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' && !event.shiftKey) {
                                event.preventDefault();
                                void sendChatMessage();
                              }
                            }}
                            placeholder="Type your reply here..."
                            className="flex-1 min-h-24 resize-none rounded-[2rem] border border-slate-200 px-6 py-4 text-lg outline-none focus:border-kitty-400"
                          />
                          <button onClick={() => void sendChatMessage()} disabled={!chatInput.trim() || isChatLoading} className="self-end px-8 py-4 bg-kitty-500 text-white rounded-2xl font-black disabled:opacity-50 flex items-center gap-3 shadow-lg">
                            <Send size={18} /> Send
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
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
                  </div>
                  <div className="flex gap-4">
                    <button onClick={handleTTS} disabled={isTTSLoading || !dailyContent} className="w-16 h-16 flex items-center justify-center bg-emerald-500 text-white rounded-2xl hover:bg-emerald-600 transition-all shadow-lg disabled:opacity-50">
                      {isTTSLoading ? <RefreshCw className="animate-spin" /> : <Volume2 />}
                    </button>
                    <button onClick={() => loadDailyContent(mode === AppMode.READING ? 'reading' : 'listening')} className="w-16 h-16 flex items-center justify-center bg-slate-50 text-slate-400 rounded-2xl hover:bg-kitty-50 hover:text-kitty-500 transition-all">
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
                  <button onClick={async () => { setIsWritingLoading(true); setWritingTopic(await AIService.generateWritingTopic(language)); setIsWritingLoading(false); }} className="flex items-center gap-3 bg-pink-50 text-pink-600 px-8 py-4 rounded-full font-black text-sm hover:bg-pink-100 transition-all">
                    <Wand2 size={20} /> {labels.inspire}
                  </button>
                </div>
                {writingTopic && <div className="mb-10 p-8 bg-pink-50/30 rounded-[2.5rem] border border-pink-100 text-xl font-bold italic text-pink-800">"{writingTopic}"</div>}
                <textarea value={writingInput} onChange={(event) => setWritingInput(event.target.value)} placeholder="Type your story, essay or journal here..." className="flex-1 w-full resize-none outline-none text-2xl text-slate-600 bg-transparent placeholder:text-slate-200 font-medium leading-relaxed no-scrollbar" />
                <button onClick={handleWritingSubmit} disabled={isWritingLoading || !writingInput.trim()} className="mt-10 w-full py-6 bg-kitty-500 text-white rounded-3xl font-black text-2xl hover:bg-kitty-600 disabled:opacity-50 shadow-xl transition-all flex items-center justify-center gap-4">
                  {isWritingLoading ? <RefreshCw className="animate-spin" /> : <><CheckCircle size={28} /> {labels.check}</>}
                </button>
              </div>
              <div className="w-[480px] space-y-8 overflow-y-auto no-scrollbar">
                {writingResult ? (
                  <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
                    {[
                      { label: 'Corrected', text: writingResult.corrected, color: 'emerald' },
                      { label: 'Pro Upgrade', text: writingResult.upgraded, color: 'indigo' },
                      { label: 'Model Essay', text: writingResult.modelEssay, color: 'slate' }
                    ].map((result, index) => (
                      <div key={index} className={`bg-${result.color}-50 p-10 rounded-[3rem] border border-${result.color}-100 shadow-sm`}>
                        <div className="flex items-center gap-3 mb-4">
                          <span className={`text-[10px] font-black uppercase tracking-widest text-${result.color}-600`}>{result.label}</span>
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
