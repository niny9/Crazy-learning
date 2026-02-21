
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  BookOpen, Mic, PenTool, Volume2, ArrowRight, ChevronLeft, 
  Plus, Trash2, ExternalLink, Headphones, Upload, 
  FileText, CheckCircle, Sparkles, Play, Square, RefreshCw, X,
  MessageSquare, Send, Brain, GraduationCap, Globe, Link as LinkIcon, Wand2, ImageIcon, Star, Zap, ShoppingBag, Bookmark, Camera, Video, VideoOff, AlertCircle
} from 'lucide-react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { AppMode, VocabItem, ChatMessage, SavedSentence, DailyContent, WritingFeedback, SpeakingScenario } from './types';
import * as GeminiService from './services/geminiService';
import { decodeAudioData, encodeBase64, base64ToUint8Array, blobToBase64 } from './services/audioUtils';

const SUPPORTED_LANGUAGES = [
  { code: 'English', flag: '🇺🇸', label: 'English' },
  { code: 'French', flag: '🇫🇷', label: 'Français' },
  { code: 'Japanese', flag: '🇯🇵', label: '日本語' },
];

const SPEAKING_SCENARIOS: SpeakingScenario[] = [
  { id: 'casual', title: 'Casual Chat', description: 'Just a friendly conversation about your day.', icon: MessageSquare, prompt: 'You are a friendly personal language tutor. Start a casual conversation with the user.' },
  { id: 'interview', title: 'Job Interview', description: 'Practice for your dream job with professional questions.', icon: FileText, prompt: 'You are an interviewer for a global tech company. Conduct a professional job interview in the target language.' },
  { id: 'coffee', title: 'Ordering Coffee', description: 'Roleplay a busy morning at a Starbucks-like café.', icon: ShoppingBag, prompt: 'You are a barista at a busy coffee shop. The user is a customer. Take their order and handle small talk.' },
  { id: 'travel', title: 'Airport Check-in', description: 'Navigate the complexities of international travel.', icon: Globe, prompt: 'You are a check-in agent at an international airport. Assist the user with their flight and luggage.' },
];

const UI_LABELS: Record<string, any> = {
  'English': {
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
    empty: 'Start learning to fill your studio!',
    inspire: 'Inspire Me',
    check: 'Check & Polish',
    narrate: 'AI Narrator',
    connecting: 'Connecting to AI...',
    errorMic: 'Mic Access Needed'
  }
};

const EXAM_RESOURCES: Record<string, any[]> = {
  'English': [
    { name: 'KMF (考满分)', desc: 'IELTS / TOEFL / GRE Practice', url: 'https://www.kmf.com/', icon: FileText, color: 'blue' },
    { name: 'Burning Vocab', desc: 'CET-4/6 Questions', url: 'https://zhenti.burningvocabulary.cn/', icon: Zap, color: 'red' }
  ],
  'Japanese': [{ name: 'NHK Web Easy', desc: 'Easy Japanese News', url: 'https://www3.nhk.or.jp/news/easy/', icon: Headphones, color: 'orange' }],
  'French': [{ name: 'RFI Savoirs', desc: 'Apprendre le français', url: 'https://savoirs.rfi.fr/fr', icon: Globe, color: 'blue' }]
};

const App = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [language, setLanguage] = useState("English");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'vocab' | 'sentences'>('vocab');
  
  const [vocabList, setVocabList] = useState<VocabItem[]>([]);
  const [sentenceList, setSentenceList] = useState<SavedSentence[]>([]);
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [seenTitles, setSeenTitles] = useState<string[]>([]);
  
  const [writingInput, setWritingInput] = useState("");
  const [writingTopic, setWritingTopic] = useState("");
  const [isWritingLoading, setIsWritingLoading] = useState(false);
  const [writingResult, setWritingResult] = useState<WritingFeedback | null>(null);
  
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<SpeakingScenario | null>(null);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isTTSLoading, setIsTTSLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [selectedText, setSelectedText] = useState("");

  const [visualizerData, setVisualizerData] = useState<number[]>(new Array(16).fill(0));

  const labels = UI_LABELS[language] || UI_LABELS['English'];

  // Live Session Lifecycle Refs
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const visualizerIntervalRef = useRef<number | null>(null);

  const addToVocab = async (word: string, context: string = "") => {
    const newItem: VocabItem = {
      id: Date.now().toString(),
      word,
      definition: "Fetching...",
      chineseDefinition: "获取中...",
      contextSentence: context,
      dateAdded: new Date().toISOString(),
      language
    };
    setVocabList(p => [newItem, ...p]);
    setSidebarOpen(true);
    setActiveTab('vocab');
    try {
      const details = await GeminiService.generateVocabContext(word, language);
      setVocabList(p => p.map(i => i.id === newItem.id ? { ...i, ...details } : i));
    } catch (e) { console.error(e); }
  };

  const saveSentence = (text: string) => {
    const newSentence: SavedSentence = {
      id: Date.now().toString(),
      text,
      source: dailyContent?.title || "Manual",
      dateAdded: new Date().toISOString(),
      language
    };
    setSentenceList(p => [newSentence, ...p]);
    setSidebarOpen(true);
    setActiveTab('sentences');
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) { setSelectionRect(null); return; }
    const text = selection.toString().trim();
    if (text.length > 0 && text.length < 150) {
      const rect = selection.getRangeAt(0).getBoundingClientRect();
      setSelectionRect(rect);
      setSelectedText(text);
    } else { setSelectionRect(null); }
  };

  const loadDailyContent = async (type: 'reading' | 'listening') => {
    setDailyContent(null);
    try {
      if (type === 'reading') {
        const data = await GeminiService.getReadingSuggestions('Intermediate', language);
        setDailyContent(data[0]);
      } else {
        const data = await GeminiService.getDailyListeningContent(language, seenTitles);
        setDailyContent(data);
        setSeenTitles(p => [...p, data.title]);
      }
    } catch (e) { console.error(e); }
  };

  // Fix: Implemented handleTTS to narrate text using gemini-2.5-flash-preview-tts
  const handleTTS = async () => {
    if (!dailyContent || !dailyContent.content) return;
    setIsTTSLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Narration for the student learning ${language}: ${dailyContent.content}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: language === 'Japanese' ? 'Puck' : 'Kore' },
            },
          },
        },
      });

      const audioBase64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioBase64) {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        const buffer = await decodeAudioData(base64ToUint8Array(audioBase64), audioCtx, 24000, 1);
        const source = audioCtx.createBufferSource();
        source.buffer = buffer;
        source.connect(audioCtx.destination);
        source.start();
      }
    } catch (e) {
      console.error("TTS failed", e);
    } finally {
      setIsTTSLoading(false);
    }
  };

  const handleWritingSubmit = async () => {
    if (!writingInput.trim()) return;
    setIsWritingLoading(true);
    try {
      const feedback = await GeminiService.analyzeWriting(writingInput, language);
      setWritingResult(feedback);
    } finally {
      setIsWritingLoading(false);
    }
  };

  const startSpeakingSession = async (scenario: SpeakingScenario) => {
    setSelectedScenario(scenario);
    setIsConnecting(true);
    setErrorMsg(null);
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isCameraOn });
      mediaStreamRef.current = stream;
      
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      audioContextRef.current = audioCtx;
      
      const inputAudioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      const analyzer = inputAudioCtx.createAnalyser();
      analyzer.fftSize = 64;
      analyzerRef.current = analyzer;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            setIsConnecting(false);
            setIsSpeaking(true);
            const source = inputAudioCtx.createMediaStreamSource(stream);
            source.connect(analyzer);

            const scriptProcessor = inputAudioCtx.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const int16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) int16[i] = inputData[i] * 32768;
              const pcmBlob = { data: encodeBase64(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
              sessionPromise.then(session => session.sendRealtimeInput({ media: pcmBlob }));
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioCtx.destination);

            // Visualizer Loop
            const freqData = new Uint8Array(analyzer.frequencyBinCount);
            visualizerIntervalRef.current = window.setInterval(() => {
              analyzer.getByteFrequencyData(freqData);
              const reduced = Array.from(freqData.slice(0, 16)).map(v => v / 255);
              setVisualizerData(reduced);
            }, 100);

            if (isCameraOn && videoRef.current && canvasRef.current) {
              const video = videoRef.current;
              const canvas = canvasRef.current;
              const ctx = canvas.getContext('2d');
              const frameInterval = window.setInterval(() => {
                if (!video || !ctx) return;
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
                canvas.toBlob(async (blob) => {
                  if (blob) {
                    const base64Data = await blobToBase64(blob);
                    sessionPromise.then(s => s.sendRealtimeInput({ media: { data: base64Data, mimeType: 'image/jpeg' } }));
                  }
                }, 'image/jpeg', 0.5);
              }, 1000);
              (window as any)._frameInterval = frameInterval;
            }
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && audioContextRef.current) {
              const ctx = audioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const buffer = await decodeAudioData(base64ToUint8Array(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = buffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => sourcesRef.current.delete(source));
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += buffer.duration;
              sourcesRef.current.add(source);
            }
          },
          onerror: (e) => {
            console.error(e);
            setErrorMsg("Connection lost. Please try again.");
            stopSpeakingSession();
          },
          onclose: () => stopSpeakingSession(),
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
          systemInstruction: `You are a patient ${language} coach. Focus on making the user feel confident. ${scenario.prompt} Keep your responses natural and concise. If the user makes a mistake, gently correct it after their turn.`
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (e) {
      console.error(e);
      setErrorMsg(labels.errorMic);
      setIsConnecting(false);
    }
  };

  const stopSpeakingSession = () => {
    setIsSpeaking(false);
    setIsConnecting(false);
    setSelectedScenario(null);
    if (liveSessionRef.current) { liveSessionRef.current.close(); liveSessionRef.current = null; }
    if (mediaStreamRef.current) { mediaStreamRef.current.getTracks().forEach(t => t.stop()); mediaStreamRef.current = null; }
    if (visualizerIntervalRef.current) clearInterval(visualizerIntervalRef.current);
    if ((window as any)._frameInterval) clearInterval((window as any)._frameInterval);
    sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} });
    sourcesRef.current.clear();
  };

  useEffect(() => {
    if (isCameraOn && videoRef.current && mediaStreamRef.current) {
      videoRef.current.srcObject = mediaStreamRef.current;
    }
  }, [isCameraOn, isSpeaking]);

  return (
    <div className="h-screen w-screen bg-kitty-50 flex overflow-hidden relative">
      {/* Selection Tooltip */}
      {selectionRect && (
        <div 
          style={{ top: selectionRect.top - 80, left: selectionRect.left + (selectionRect.width/2) - 100 }} 
          className="fixed z-[100] bg-slate-900 text-white p-2.5 rounded-3xl shadow-2xl flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200"
        >
          <button onClick={() => { addToVocab(selectedText); setSelectionRect(null); }} className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-800 rounded-2xl text-xs font-black transition-all border-r border-slate-700">
            <Plus size={16}/> Word
          </button>
          <button onClick={() => { saveSentence(selectedText); setSelectionRect(null); }} className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-800 rounded-2xl text-xs font-black transition-all">
            <Bookmark size={16}/> Save
          </button>
        </div>
      )}

      {/* Sidebar - Studio */}
      <div className={`fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl z-50 transform transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'} border-l border-kitty-100 flex flex-col`}>
        <div className="p-8 border-b border-kitty-50">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-black text-kitty-800 flex items-center gap-3 text-2xl"><Sparkles className="text-kitty-400"/> {labels.notebook}</h2>
            <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-kitty-50 rounded-full transition-all text-slate-400"><X/></button>
          </div>
          <div className="flex bg-kitty-100/50 p-1.5 rounded-2xl border border-kitty-100">
            {['vocab', 'sentences'].map(t => (
              <button key={t} onClick={() => setActiveTab(t as any)} className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${activeTab === t ? 'bg-white text-kitty-600 shadow-sm' : 'text-kitty-300 hover:text-kitty-400'}`}>
                {t === 'vocab' ? labels.words : labels.sentences}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
          {(activeTab === 'vocab' ? vocabList : sentenceList).filter(i => i.language === language).map(item => (
            <div key={item.id} className="bg-white border border-kitty-100 rounded-[2rem] p-6 shadow-sm hover:shadow-md transition-all group animate-in slide-in-from-right-4">
              <div className="flex justify-between items-start mb-2">
                <span className="font-black text-slate-800 text-xl tracking-tight">{ (item as any).word || (item as any).text.substring(0, 30) + '...' }</span>
                <button onClick={() => activeTab === 'vocab' ? setVocabList(p => p.filter(v => v.id !== item.id)) : setSentenceList(p => p.filter(s => s.id !== item.id))} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all"><Trash2 size={16}/></button>
              </div>
              <p className="text-sm text-kitty-500 mb-3 font-bold">{(item as any).chineseDefinition || 'Language Clip'}</p>
              <div className="text-xs text-slate-500 italic leading-relaxed bg-kitty-50/50 p-4 rounded-2xl">"{(item as any).contextSentence || (item as any).text}"</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Navbar */}
        <div className="h-20 px-10 flex items-center justify-between glass shrink-0 z-40">
          <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setMode(AppMode.DASHBOARD)}>
            <div className="bg-kitty-500 text-white p-2.5 rounded-2xl shadow-lg group-hover:rotate-12 transition-all"><Star size={24}/></div>
            <div>
              <h1 className="font-black text-2xl text-slate-900 tracking-tighter">LinguaFlow</h1>
              <p className="text-[10px] font-black text-kitty-400 uppercase tracking-widest">AI English Coach</p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex bg-white p-1 rounded-2xl border border-kitty-100 shadow-sm">
              {SUPPORTED_LANGUAGES.map(l => (
                <button key={l.code} onClick={() => { setLanguage(l.code); setMode(AppMode.DASHBOARD); }} className={`px-5 py-2.5 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${language === l.code ? 'bg-kitty-500 text-white shadow-md' : 'text-slate-400 hover:bg-kitty-50'}`}>
                  <span>{l.flag}</span> <span className="hidden md:block">{l.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setSidebarOpen(true)} className="relative p-3.5 bg-white rounded-2xl shadow-sm text-kitty-500 hover:scale-105 border border-kitty-100 transition-all">
              <ShoppingBag size={24}/>
              { (vocabList.length + sentenceList.length) > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white">!</span>}
            </button>
          </div>
        </div>

        {/* Dynamic Content */}
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
                  { m: AppMode.SPEAKING, icon: Mic, color: 'emerald', label: labels.speaking, tag: 'Realtime' },
                  { m: AppMode.LISTENING, icon: Headphones, color: 'indigo', label: labels.listening, tag: 'Media' },
                  { m: AppMode.WRITING, icon: PenTool, color: 'pink', label: labels.writing, tag: 'Analysis' },
                  { m: AppMode.READING, icon: BookOpen, color: 'orange', label: labels.reading, tag: 'Library' },
                  { m: AppMode.EXAM_PORTAL, icon: GraduationCap, color: 'blue', label: labels.exams, tag: 'Tests' },
                ].map((card, i) => (
                  <div 
                    key={card.m}
                    onClick={() => { setMode(card.m); if(card.m === AppMode.READING || card.m === AppMode.LISTENING) loadDailyContent(card.m === AppMode.READING ? 'reading' : 'listening'); }} 
                    className="group bg-white p-10 rounded-[3rem] cursor-pointer shadow-sm hover:shadow-2xl hover:-translate-y-2 transition-all border border-slate-100 hover:border-kitty-200 flex flex-col animate-in fade-in slide-in-from-bottom-8 duration-700"
                    style={{ animationDelay: `${i * 100}ms` }}
                  >
                    <div className={`w-20 h-20 bg-${card.color}-50 text-${card.color}-500 rounded-[2rem] flex items-center justify-center mb-8 group-hover:scale-110 transition-transform`}>
                      <card.icon size={40}/>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-3xl font-black text-slate-800 tracking-tighter">{card.label}</h3>
                        <span className={`text-[10px] font-black px-3 py-1 rounded-full bg-${card.color}-100 text-${card.color}-600 uppercase`}>{card.tag}</span>
                      </div>
                      <p className="text-slate-400 font-medium leading-relaxed">Level up your {language} skills with adaptive AI-powered sessions.</p>
                    </div>
                    <div className="mt-8 flex justify-end">
                      <div className="p-4 bg-slate-50 rounded-full group-hover:bg-kitty-500 group-hover:text-white transition-all"><ArrowRight/></div>
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
                     <p className="text-slate-400 text-xl font-medium">Practice speaking in safe, realistic environments.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {SPEAKING_SCENARIOS.map((s) => (
                      <button key={s.id} onClick={() => startSpeakingSession(s)} className="bg-white p-10 rounded-[3rem] shadow-sm hover:shadow-xl transition-all border border-slate-100 flex flex-col items-center group">
                        <div className="p-6 bg-emerald-50 text-emerald-500 rounded-[2rem] mb-6 group-hover:scale-110 transition-transform">
                          <s.icon size={48}/>
                        </div>
                        <h4 className="text-2xl font-black text-slate-800 mb-2">{s.title}</h4>
                        <p className="text-slate-400 text-sm font-medium text-center">{s.description}</p>
                      </button>
                    ))}
                  </div>
                  <div className="mt-16 flex flex-col items-center gap-4">
                    <button onClick={() => setIsCameraOn(!isCameraOn)} className={`flex items-center gap-4 px-10 py-5 rounded-full font-black text-lg shadow-lg transition-all ${isCameraOn ? 'bg-emerald-500 text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-emerald-200'}`}>
                      {isCameraOn ? <Video size={24}/> : <VideoOff size={24}/>}
                      {isCameraOn ? 'Vision Enabled' : 'Voice Only Mode'}
                    </button>
                    {errorMsg && <p className="text-red-500 font-bold flex items-center gap-2 animate-bounce"><AlertCircle size={18}/> {errorMsg}</p>}
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-5xl bg-white rounded-[5rem] p-16 shadow-2xl border border-kitty-100 relative overflow-hidden flex flex-col items-center">
                  <div className="absolute top-10 left-10 flex items-center gap-4">
                     {/* Fix: Use React.createElement to dynamically render the icon component from selectedScenario */}
                     <div className="bg-emerald-50 text-emerald-500 p-4 rounded-3xl">
                       {selectedScenario?.icon && React.createElement(selectedScenario.icon, { size: 24 })}
                     </div>
                     <div>
                       <h3 className="text-xl font-black text-slate-800 leading-none">{selectedScenario?.title}</h3>
                       <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mt-1">Live AI Session</p>
                     </div>
                  </div>

                  {isConnecting ? (
                    <div className="flex flex-col items-center py-20 animate-pulse">
                       <RefreshCw size={64} className="text-kitty-300 animate-spin mb-8"/>
                       <p className="text-2xl font-black text-slate-400">{labels.connecting}</p>
                    </div>
                  ) : (
                    <>
                      {isCameraOn && (
                        <div className="w-full aspect-video bg-slate-900 rounded-[3rem] mb-12 overflow-hidden shadow-2xl relative border-4 border-white">
                          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover scale-x-[-1]"/>
                          <canvas ref={canvasRef} className="hidden"/>
                        </div>
                      )}

                      <div className="flex gap-4 mb-16 h-32 items-end justify-center">
                        {visualizerData.map((v, i) => (
                          <div key={i} className="w-3 bg-gradient-to-t from-kitty-400 to-kitty-200 rounded-full transition-all duration-100" style={{ height: `${20 + v * 100}%` }}></div>
                        ))}
                      </div>
                      
                      <div className="text-center mb-12">
                        <h2 className="text-4xl font-black text-slate-800 mb-4 animate-pulse">Gemini is listening...</h2>
                        <p className="text-slate-400 text-xl font-medium italic">"Go ahead, start speaking your mind."</p>
                      </div>

                      <button onClick={stopSpeakingSession} className="px-12 py-6 bg-red-50 text-red-500 rounded-full font-black text-xl hover:bg-red-100 transition-all flex items-center gap-4 border border-red-100">
                        <Square size={24}/> Finish Practice
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Listening & Reading Modes */}
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
                          {isTTSLoading ? <RefreshCw className="animate-spin"/> : <Volume2/>}
                       </button>
                       <button onClick={() => loadDailyContent(mode === AppMode.READING ? 'reading' : 'listening')} className="w-16 h-16 flex items-center justify-center bg-slate-50 text-slate-400 rounded-2xl hover:bg-kitty-50 hover:text-kitty-500 transition-all">
                          <RefreshCw/>
                       </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto pr-6 no-scrollbar text-2xl text-slate-700 leading-loose font-medium whitespace-pre-wrap selection:bg-kitty-200" onMouseUp={handleTextSelection}>
                    {dailyContent?.content || "Synchronizing with external libraries..."}
                  </div>
                </div>
             </div>
          )}

          {mode === AppMode.WRITING && (
            <div className="h-full p-10 max-w-7xl mx-auto flex gap-10 animate-in fade-in duration-700">
              <div className="flex-1 flex flex-col bg-white rounded-[4rem] p-12 shadow-2xl border border-pink-100 relative overflow-hidden">
                  <div className="flex justify-between items-center mb-10">
                    <h2 className="text-3xl font-black text-slate-800">Writing Studio</h2>
                    <button onClick={async () => { setIsWritingLoading(true); setWritingTopic(await GeminiService.generateWritingTopic(language)); setIsWritingLoading(false); }} className="flex items-center gap-3 bg-pink-50 text-pink-600 px-8 py-4 rounded-full font-black text-sm hover:bg-pink-100 transition-all">
                      <Wand2 size={20}/> {labels.inspire}
                    </button>
                  </div>
                  {writingTopic && <div className="mb-10 p-8 bg-pink-50/30 rounded-[2.5rem] border border-pink-100 text-xl font-bold italic text-pink-800">"{writingTopic}"</div>}
                  <textarea value={writingInput} onChange={e => setWritingInput(e.target.value)} placeholder="Type your story, essay or journal here..." className="flex-1 w-full resize-none outline-none text-2xl text-slate-600 bg-transparent placeholder:text-slate-200 font-medium leading-relaxed no-scrollbar"/>
                  <button onClick={handleWritingSubmit} disabled={isWritingLoading || !writingInput.trim()} className="mt-10 w-full py-6 bg-kitty-500 text-white rounded-3xl font-black text-2xl hover:bg-kitty-600 disabled:opacity-50 shadow-xl transition-all flex items-center justify-center gap-4">
                    {isWritingLoading ? <RefreshCw className="animate-spin"/> : <><CheckCircle size={28}/> {labels.check}</>}
                  </button>
              </div>
              <div className="w-[480px] space-y-8 overflow-y-auto no-scrollbar">
                {writingResult ? (
                   <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
                      {[
                        { label: 'Corrected', text: writingResult.corrected, color: 'emerald' },
                        { label: 'Pro Upgrade', text: writingResult.upgraded, color: 'indigo' },
                        { label: 'Model Essay', text: writingResult.modelEssay, color: 'slate' }
                      ].map((r, idx) => (
                        <div key={idx} className={`bg-${r.color}-50 p-10 rounded-[3rem] border border-${r.color}-100 shadow-sm`}>
                          <div className="flex items-center gap-3 mb-4">
                            <span className={`text-[10px] font-black uppercase tracking-widest text-${r.color}-600`}>{r.label}</span>
                          </div>
                          <p className="text-slate-800 text-lg leading-relaxed font-bold">{r.text}</p>
                        </div>
                      ))}
                   </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-16 glass rounded-[4rem] border-2 border-dashed border-slate-200">
                    <PenTool size={64} className="text-slate-200 mb-6"/>
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
                {(EXAM_RESOURCES[language] || []).map((res, i) => (
                  <a key={i} href={res.url} target="_blank" className="bg-white p-12 rounded-[4rem] shadow-sm hover:shadow-2xl transition-all border border-slate-100 flex items-center gap-10 group">
                    <div className={`p-8 bg-${res.color}-50 text-${res.color}-500 rounded-[2.5rem] group-hover:scale-110 transition-transform`}>
                      <res.icon size={48}/>
                    </div>
                    <div>
                      <h4 className="text-3xl font-black text-slate-800 mb-2 group-hover:text-blue-600 transition-colors">{res.name}</h4>
                      <p className="text-slate-400 text-lg font-medium">{res.desc}</p>
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
