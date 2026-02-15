import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, Mic, PenTool, Volume2, ArrowRight, ChevronLeft, 
  Plus, Trash2, ExternalLink, Headphones, Upload, 
  FileText, CheckCircle, Sparkles, Play, Square, RefreshCw, X,
  MessageSquare, Send, Brain, GraduationCap, Globe, Link as LinkIcon, Wand2, ImageIcon, Star, Zap, ShoppingBag, Bookmark
} from 'lucide-react';
import { AppMode, VocabItem, ChatMessage, SavedSentence, DailyContent, WritingFeedback, WritingEntry } from './types';
import * as GeminiService from './services/geminiService';

const SUPPORTED_LANGUAGES = [
  { code: 'English', flag: '🇺🇸', label: 'English' },
  { code: 'French', flag: '🇫🇷', label: 'Français' },
  { code: 'Japanese', flag: '🇯🇵', label: '日本語' },
];

const UI_LABELS: Record<string, any> = {
  'English': {
    welcome: 'Welcome back, Learner! 👋',
    sub: 'Which skill would you like to level up today?',
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
    check: 'Check & Polish'
  },
  'Japanese': {
    welcome: 'おかえりなさい！ 👋',
    sub: '今日はどのスキルを磨きますか？',
    speaking: '会話練習',
    listening: 'リスニング',
    reading: '読解',
    writing: 'ライティング',
    exams: '試験対策',
    notebook: '単語帳',
    words: '単語',
    sentences: '例文',
    empty: '学習を始めて、スタジオをいっぱいにしましょう！',
    inspire: 'お題を生成',
    check: '添削する'
  },
  'French': {
    welcome: 'Bon retour, Apprenant ! 👋',
    sub: 'Quelle compétence voulez-vous améliorer aujourd\'hui ?',
    speaking: 'Parler',
    listening: 'Écoute',
    reading: 'Lecture',
    writing: 'Écriture',
    exams: 'Examens',
    notebook: 'Carnet',
    words: 'Mots',
    sentences: 'Phrases',
    empty: 'Commencez à apprendre pour remplir votre studio !',
    inspire: 'Inspirez-moi',
    check: 'Vérifier'
  }
};

const EXAM_RESOURCES: Record<string, any[]> = {
  'English': [
    { name: 'KMF (考满分)', desc: 'IELTS / TOEFL / GRE Practice', url: 'https://www.kmf.com/', icon: FileText, color: 'blue' },
    { name: 'Burning Vocab', desc: 'CET-4/6 Questions', url: 'https://zhenti.burningvocabulary.cn/', icon: Zap, color: 'red' }
  ],
  'Japanese': [
    { name: 'NHK Web Easy', desc: 'Easy Japanese News', url: 'https://www3.nhk.or.jp/news/easy/', icon: Headphones, color: 'orange' },
    { name: 'JLPT Prep', desc: 'Official JLPT Samples', url: 'https://www.jlpt.jp/e/samples/forlearners.html', icon: GraduationCap, color: 'indigo' }
  ],
  'French': [
    { name: 'RFI Savoirs', desc: 'Apprendre le français', url: 'https://savoirs.rfi.fr/fr', icon: Globe, color: 'blue' }
  ]
};

const App = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [language, setLanguage] = useState("English");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'vocab' | 'sentences'>('vocab');
  
  // Data State
  const [vocabList, setVocabList] = useState<VocabItem[]>([]);
  const [sentenceList, setSentenceList] = useState<SavedSentence[]>([]);
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [seenTitles, setSeenTitles] = useState<string[]>([]);
  
  // UI States
  const [writingInput, setWritingInput] = useState("");
  const [writingTopic, setWritingTopic] = useState("");
  const [isWritingLoading, setIsWritingLoading] = useState(false);
  const [writingResult, setWritingResult] = useState<WritingFeedback | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [selectedText, setSelectedText] = useState("");

  const labels = UI_LABELS[language] || UI_LABELS['English'];

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

  return (
    <div className="h-screen w-screen bg-kitty-50 flex overflow-hidden relative">
      {/* Sidebar - Studio */}
      <div className={`fixed inset-y-0 right-0 w-[420px] bg-white shadow-2xl z-50 transform transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1) ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'} border-l-4 border-kitty-100 flex flex-col`}>
        <div className="p-8 border-b border-kitty-100 bg-white sticky top-0 z-10">
          <div className="flex justify-between items-center mb-6">
            <h2 className="font-black text-kitty-700 flex items-center gap-3 text-2xl"><ShoppingBag size={28}/> {labels.notebook}</h2>
            <button onClick={() => setSidebarOpen(false)} className="p-2 hover:bg-kitty-100 rounded-full transition-all"><X/></button>
          </div>
          <div className="flex bg-kitty-50 p-1.5 rounded-2xl border border-kitty-100">
            <button onClick={() => setActiveTab('vocab')} className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${activeTab === 'vocab' ? 'bg-white text-kitty-600 shadow-md scale-[1.02]' : 'text-kitty-300 hover:text-kitty-400'}`}>
              {labels.words} ({vocabList.filter(v => v.language === language).length})
            </button>
            <button onClick={() => setActiveTab('sentences')} className={`flex-1 py-3 rounded-xl text-sm font-black transition-all ${activeTab === 'sentences' ? 'bg-white text-kitty-600 shadow-md scale-[1.02]' : 'text-kitty-300 hover:text-kitty-400'}`}>
              {labels.sentences} ({sentenceList.filter(s => s.language === language).length})
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar bg-slate-50/30">
          {activeTab === 'vocab' ? (
            vocabList.filter(v => v.language === language).map(item => (
              <div key={item.id} className="bg-white border-2 border-kitty-100 rounded-[2rem] p-6 shadow-sm hover:shadow-md hover:border-kitty-300 transition-all group animate-in slide-in-from-right-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-black text-kitty-900 text-xl tracking-tight">{item.word}</span>
                  <button onClick={() => setVocabList(p => p.filter(v => v.id !== item.id))} className="opacity-0 group-hover:opacity-100 p-2 text-slate-300 hover:text-red-400 transition-all"><Trash2 size={16}/></button>
                </div>
                <p className="text-sm text-kitty-600 mb-3 font-bold">{item.chineseDefinition}</p>
                <div className="text-xs text-slate-500 italic leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-100">"{item.contextSentence}"</div>
              </div>
            ))
          ) : (
            sentenceList.filter(s => s.language === language).map(item => (
              <div key={item.id} className="bg-white border-2 border-kitty-100 rounded-[2rem] p-6 shadow-sm hover:shadow-md hover:border-kitty-300 transition-all group animate-in slide-in-from-right-4">
                <p className="text-sm text-slate-800 leading-relaxed font-medium mb-4">"{item.text}"</p>
                <div className="flex justify-between items-center text-[10px] text-slate-400 font-black uppercase tracking-widest">
                  <span className="bg-slate-100 px-3 py-1 rounded-full">{item.source}</span>
                  <button onClick={() => setSentenceList(p => p.filter(s => s.id !== item.id))} className="opacity-0 group-hover:opacity-100 text-red-300 hover:text-red-500 transition-all"><Trash2 size={16}/></button>
                </div>
              </div>
            ))
          )}
          {(activeTab === 'vocab' ? vocabList : sentenceList).filter(i => i.language === language).length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-300 text-center opacity-60">
              <Sparkles size={48} className="text-kitty-200 mb-4 animate-pulse"/>
              <p className="font-bold">{labels.empty}</p>
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        {/* Nav Bar */}
        <div className="h-20 px-10 flex items-center justify-between bg-white/80 backdrop-blur-2xl border-b border-kitty-100 shrink-0 z-40">
          <div className="flex items-center gap-4 cursor-pointer group" onClick={() => setMode(AppMode.DASHBOARD)}>
            <div className="bg-gradient-to-tr from-kitty-500 to-kitty-400 text-white p-2.5 rounded-2xl shadow-xl group-hover:rotate-12 transition-all"><Sparkles size={24}/></div>
            <div>
              <h1 className="font-black text-2xl text-kitty-900 tracking-tighter">LinguaFlow</h1>
              <p className="text-[10px] font-black text-kitty-400 uppercase tracking-[0.3em]">AI COACH</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex bg-white/40 p-1.5 rounded-2xl border border-kitty-100 shadow-sm">
              {SUPPORTED_LANGUAGES.map(l => (
                <button 
                  key={l.code} 
                  onClick={() => { setLanguage(l.code); setMode(AppMode.DASHBOARD); }} 
                  className={`px-5 py-2 rounded-xl text-sm font-black transition-all flex items-center gap-2 ${language === l.code ? 'bg-kitty-500 text-white shadow-lg scale-105' : 'text-kitty-300 hover:bg-kitty-50'}`}
                >
                  <span className="text-lg leading-none">{l.flag}</span>
                  <span className={language === l.code ? 'block' : 'hidden lg:block'}>{l.label}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setSidebarOpen(true)} className="relative p-3.5 bg-white rounded-2xl shadow-lg text-kitty-500 hover:scale-110 transition-all border border-kitty-50">
              <ShoppingBag size={24}/>
              {(vocabList.filter(v=>v.language===language).length > 0) && <span className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-red-500 text-white text-[11px] flex items-center justify-center rounded-full font-black border-4 border-white">!</span>}
            </button>
          </div>
        </div>

        {/* Content View */}
        <div className="flex-1 overflow-hidden">
          {mode === AppMode.DASHBOARD && (
            <div className="p-12 max-w-7xl mx-auto h-full overflow-y-auto no-scrollbar pb-32">
              <header className="mb-16 text-center animate-in fade-in slide-in-from-top-4 duration-700">
                <h2 className="text-5xl font-black text-slate-800 mb-6 tracking-tight">{labels.welcome}</h2>
                <p className="text-slate-400 text-xl font-bold max-w-2xl mx-auto">{labels.sub}</p>
              </header>
              
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                {[
                  { m: AppMode.SPEAKING, icon: Mic, color: 'emerald', label: labels.speaking, tag: 'Native' },
                  { m: AppMode.LISTENING, icon: Headphones, color: 'purple', label: labels.listening, tag: 'TED' },
                  { m: AppMode.WRITING, icon: PenTool, color: 'pink', label: labels.writing, tag: 'Pro' },
                  { m: AppMode.READING, icon: BookOpen, color: 'orange', label: labels.reading, tag: 'Deep' },
                  { m: AppMode.EXAM_PORTAL, icon: GraduationCap, color: 'blue', label: labels.exams, tag: 'Hub' },
                ].map((card, i) => (
                  <div 
                    key={card.m}
                    style={{ animationDelay: `${i * 100}ms` }}
                    onClick={() => { 
                      setMode(card.m); 
                      if(card.m === AppMode.READING) loadDailyContent('reading');
                      if(card.m === AppMode.LISTENING) loadDailyContent('listening');
                    }} 
                    className={`bg-white group p-10 rounded-[3.5rem] cursor-pointer shadow-xl hover:shadow-2xl hover:-translate-y-3 transition-all border-4 border-transparent hover:border-${card.color}-100 flex flex-col items-start animate-in fade-in slide-in-from-bottom-8`}
                  >
                    <div className={`bg-${card.color}-50 text-${card.color}-500 p-6 rounded-[2rem] flex items-center justify-center mb-8 group-hover:scale-110 group-hover:rotate-6 transition-all`}>
                      <card.icon size={36}/>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className={`text-3xl font-black text-${card.color}-900 tracking-tighter`}>{card.label}</h3>
                        <span className={`text-[10px] font-black px-3 py-1 rounded-full bg-${card.color}-100 text-${card.color}-600 uppercase`}>{card.tag}</span>
                      </div>
                      <p className="text-slate-400 font-bold opacity-80">Enhance your {language} proficiency with AI-driven exercises.</p>
                    </div>
                    <div className={`mt-8 self-end p-4 bg-slate-50 rounded-full text-${card.color}-500 group-hover:bg-${card.color}-500 group-hover:text-white transition-all shadow-sm`}>
                      <ArrowRight size={24}/>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mode === AppMode.SPEAKING && (
            <div className="h-full flex flex-col items-center justify-center p-12">
              <div className="bg-white w-full max-w-3xl rounded-[5rem] p-20 shadow-2xl flex flex-col items-center text-center border-8 border-emerald-50 animate-in zoom-in-95 duration-500">
                {!isSpeaking ? (
                  <>
                    <div className="bg-emerald-50 p-12 rounded-full mb-10 animate-bounce-slow shadow-inner">
                      <Mic size={100} className="text-emerald-500"/>
                    </div>
                    <h2 className="text-4xl font-black text-emerald-900 mb-6 tracking-tighter">AI Conversationalist</h2>
                    <p className="text-slate-500 max-w-md mb-12 text-lg font-bold">Immerse yourself in a real-time voice chat with Gemini to improve your fluency in {language}.</p>
                    <button 
                      onClick={() => setIsSpeaking(true)}
                      className="px-16 py-6 bg-emerald-500 text-white rounded-[2.5rem] font-black text-2xl hover:bg-emerald-600 shadow-2xl shadow-emerald-200 transition-all active:scale-95"
                    >Start Talking</button>
                  </>
                ) : (
                  <div className="w-full flex flex-col items-center">
                    <div className="flex gap-4 mb-16 h-24 items-center justify-center">
                      {[...Array(6)].map((_, i) => (
                        <div key={i} className="w-4 bg-emerald-400 rounded-full animate-pulse" style={{ height: `${Math.random()*100 + 20}%`, animationDelay: `${i * 0.15}s` }}></div>
                      ))}
                    </div>
                    <h2 className="text-3xl font-black text-emerald-900 mb-4 animate-pulse">Gemini is Listening...</h2>
                    <p className="text-slate-400 font-bold mb-16 italic text-lg">"Describe your current surroundings or your day."</p>
                    <button onClick={() => setIsSpeaking(false)} className="px-10 py-5 bg-red-50 text-red-500 rounded-[2rem] font-black hover:bg-red-100 transition-all flex items-center gap-3 border-2 border-red-100"><Square size={22}/> End Practice</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === AppMode.LISTENING && (
            <div className="h-full flex flex-col p-10 max-w-6xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-[4rem] p-16 shadow-2xl flex-1 flex flex-col overflow-hidden relative border-4 border-purple-50">
                <div className="flex justify-between items-start mb-10">
                  <div className="flex-1 pr-16">
                    <div className="flex items-center gap-4 mb-6">
                       <span className="bg-purple-100 text-purple-600 px-6 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.2em]">{dailyContent?.source || '...'}</span>
                       {dailyContent?.url && (
                         <a href={dailyContent.url} target="_blank" className="bg-slate-50 p-3 rounded-xl text-slate-400 hover:text-purple-600 transition-all hover:bg-purple-50">
                           <ExternalLink size={20}/>
                         </a>
                       )}
                    </div>
                    <h2 className="text-5xl font-black text-slate-800 leading-[1.1] tracking-tight">{dailyContent?.title || 'Searching Content...'}</h2>
                  </div>
                  <div className="flex gap-4">
                    <button onClick={() => loadDailyContent('listening')} className="p-5 bg-purple-500 text-white rounded-3xl hover:bg-purple-600 shadow-xl shadow-purple-200 transition-all hover:rotate-180 duration-500"><RefreshCw size={28}/></button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto pr-8 leading-[1.8] text-2xl text-slate-700 no-scrollbar font-medium" onMouseUp={handleTextSelection}>
                  {dailyContent?.content || "Retrieving curated listening material from the web..."}
                </div>
                <div className="mt-12 pt-8 border-t-2 border-slate-50 flex items-center justify-between text-slate-400 italic">
                  <p className="text-sm font-bold">Highlight any text to add to your studio.</p>
                  <div className="flex items-center gap-2"><Sparkles size={16}/> <span className="text-[10px] font-black uppercase tracking-widest">Powered by Google Search</span></div>
                </div>
              </div>
            </div>
          )}

          {mode === AppMode.WRITING && (
            <div className="h-full max-w-7xl mx-auto p-10 flex gap-10 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex-1 flex flex-col">
                <div className="bg-white rounded-[4rem] p-12 shadow-2xl flex-1 flex flex-col border-4 border-pink-50 relative overflow-hidden">
                  <div className="flex justify-between items-center mb-10">
                    <h2 className="text-3xl font-black text-pink-900 tracking-tighter">Writing Lab</h2>
                    <button onClick={async () => { setIsWritingLoading(true); setWritingTopic(await GeminiService.generateWritingTopic(language)); setIsWritingLoading(false); }} className="flex items-center gap-3 text-sm font-black text-pink-500 bg-pink-50 px-8 py-4 rounded-[2rem] hover:bg-pink-100 hover:scale-105 transition-all">
                      <Wand2 size={20}/> {labels.inspire}
                    </button>
                  </div>
                  {writingTopic && (
                    <div className="mb-10 p-8 bg-pink-50 rounded-[2.5rem] text-pink-800 italic border-2 border-pink-100 text-xl font-medium relative animate-in zoom-in-95">
                      <Sparkles className="absolute -top-4 -left-4 text-pink-300" size={32}/>
                      "{writingTopic}"
                    </div>
                  )}
                  <textarea value={writingInput} onChange={e => setWritingInput(e.target.value)} placeholder="Pour your thoughts onto the canvas..." className="flex-1 w-full resize-none outline-none text-2xl text-slate-700 bg-transparent placeholder:text-slate-200 font-medium leading-relaxed"/>
                  <button onClick={handleWritingSubmit} disabled={isWritingLoading || !writingInput.trim()} className="mt-10 w-full py-6 bg-pink-500 text-white rounded-[2.5rem] font-black text-2xl hover:bg-pink-600 disabled:opacity-50 shadow-2xl shadow-pink-100 transition-all flex items-center justify-center gap-4">
                    {isWritingLoading ? <RefreshCw className="animate-spin"/> : <><CheckCircle size={28}/> {labels.check}</>}
                  </button>
                </div>
              </div>
              
              <div className="w-[450px] space-y-8 overflow-y-auto pr-4 no-scrollbar pb-10">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.4em] mb-4">AI Analysis</h3>
                {writingResult ? (
                   <div className="space-y-8 animate-in fade-in slide-in-from-right-8 duration-700">
                      <div className="bg-emerald-50 p-10 rounded-[3rem] border-4 border-emerald-100 shadow-sm relative overflow-hidden">
                        <div className="flex items-center gap-3 mb-4">
                          <CheckCircle className="text-emerald-500" size={24}/>
                          <p className="text-sm font-black text-emerald-700 uppercase tracking-widest">Correction</p>
                        </div>
                        <p className="text-slate-800 text-lg leading-relaxed font-bold">{writingResult.corrected}</p>
                      </div>
                      <div className="bg-indigo-50 p-10 rounded-[3rem] border-4 border-indigo-100 shadow-sm relative overflow-hidden">
                        <div className="flex items-center gap-3 mb-4">
                          <Zap className="text-indigo-500" size={24}/>
                          <p className="text-sm font-black text-indigo-700 uppercase tracking-widest">Upgrade</p>
                        </div>
                        <p className="text-slate-800 text-lg leading-relaxed font-black italic">{writingResult.upgraded}</p>
                      </div>
                      <div className="bg-slate-50 p-10 rounded-[3rem] border-2 border-slate-100 opacity-70">
                        <p className="text-xs font-black text-slate-400 uppercase mb-6 tracking-widest">Model Reference</p>
                        <p className="text-base text-slate-600 leading-loose">{writingResult.modelEssay}</p>
                      </div>
                   </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-16 bg-white/40 rounded-[4rem] border-4 border-dashed border-slate-200 opacity-60">
                    <PenTool size={64} className="text-slate-200 mb-6"/>
                    <p className="text-lg text-slate-400 font-black leading-tight">Your AI feedback and vocabulary upgrades will materialize here.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {mode === AppMode.EXAM_PORTAL && (
            <div className="h-full p-16 max-w-6xl mx-auto overflow-y-auto no-scrollbar animate-in slide-in-from-bottom-4 duration-500">
              <header className="mb-12">
                <h2 className="text-4xl font-black text-slate-800 mb-3 tracking-tight">Examination Portal</h2>
                <p className="text-slate-400 text-lg font-bold">Curated global resources for {language} learners.</p>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {(EXAM_RESOURCES[language] || []).map((res, i) => (
                  <a key={i} href={res.url} target="_blank" className="bg-white p-10 rounded-[3.5rem] shadow-xl hover:shadow-2xl transition-all border-4 border-transparent hover:border-blue-100 flex items-center gap-8 group">
                    <div className={`p-6 bg-${res.color}-50 text-${res.color}-500 rounded-[2rem] group-hover:scale-110 transition-transform`}>
                      <res.icon size={40}/>
                    </div>
                    <div>
                      <h4 className="text-2xl font-black text-slate-800 group-hover:text-blue-600 transition-colors">{res.name}</h4>
                      <p className="text-slate-400 font-bold mt-1">{res.desc}</p>
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {mode === AppMode.READING && (
             <div className="h-full p-10 max-w-6xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
                <div className="bg-white rounded-[4rem] p-16 shadow-2xl h-full flex flex-col overflow-hidden border-4 border-orange-50" onMouseUp={handleTextSelection}>
                  <div className="flex justify-between items-start mb-12">
                    <div>
                      <span className="bg-orange-100 text-orange-600 px-6 py-2 rounded-2xl text-xs font-black uppercase tracking-[0.2em]">{dailyContent?.source || 'Library'}</span>
                      <h2 className="text-5xl font-black text-slate-800 mt-6 leading-tight tracking-tight">{dailyContent?.title || 'Retrieving Literature...'}</h2>
                    </div>
                    <button onClick={() => loadDailyContent('reading')} className="p-5 bg-slate-50 text-slate-300 rounded-3xl hover:bg-orange-50 hover:text-orange-500 transition-all"><RefreshCw size={28}/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto no-scrollbar leading-[2] text-2xl text-slate-700 font-serif whitespace-pre-wrap px-4">
                    {dailyContent?.content}
                  </div>
                </div>
             </div>
          )}
        </div>
      </div>

      {/* Selection Tooltip */}
      {selectionRect && (
        <div 
          style={{ top: selectionRect.top - 80, left: selectionRect.left + (selectionRect.width/2) - 100 }} 
          className="fixed z-[100] bg-slate-900 text-white p-2.5 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center gap-2 animate-in fade-in zoom-in-95 duration-200"
        >
          <button onClick={() => { addToVocab(selectedText); setSelectionRect(null); }} className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-800 rounded-2xl text-xs font-black transition-all border-r border-slate-700">
            <Plus size={16}/> Word
          </button>
          <button onClick={() => { saveSentence(selectedText); setSelectionRect(null); }} className="flex items-center gap-2 px-5 py-2.5 hover:bg-slate-800 rounded-2xl text-xs font-black transition-all">
            <Bookmark size={16}/> Save
          </button>
          <button onClick={() => setSelectionRect(null)} className="p-2 hover:text-red-400 ml-1"><X size={18}/></button>
        </div>
      )}
    </div>
  );
};

export default App;