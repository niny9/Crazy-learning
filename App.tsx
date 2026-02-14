
import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, Camera, Mic, PenTool, Volume2, ArrowRight, ChevronLeft, 
  Plus, Trash2, Save, ExternalLink, Headphones, MonitorPlay, Upload, 
  FileText, CheckCircle, Sparkles, Play, Square, Video, History, RefreshCw, X,
  MessageSquare, Send, StopCircle, BarChart2, Image as ImageIcon, Wand2, Zap, Brain, GraduationCap,
  Phone, PhoneOff, Radio, Heart, Star, ShoppingBag, Globe, Link as LinkIcon
} from 'lucide-react';
import { AppMode, VocabItem, ChatMessage, SavedSentence, DailyContent, WritingFeedback, WritingEntry, VideoContent, SpeakingReport, CustomExamLink } from './types';
import * as GeminiService from './services/geminiService';
import { blobToBase64, base64ToUint8Array, decodeAudioData, playAudioBuffer } from './services/audioUtils';

// --- Configuration Data ---

const SUPPORTED_LANGUAGES = [
  { code: 'English', flag: '🇺🇸', label: 'English' },
  { code: 'French', flag: '🇫🇷', label: 'Français' },
  { code: 'Japanese', flag: '🇯🇵', label: '日本語' },
  { code: 'German', flag: '🇩🇪', label: 'Deutsch' },
  { code: 'Spanish', flag: '🇪🇸', label: 'Español' },
  { code: 'Korean', flag: '🇰🇷', label: '한국어' },
];

// Extensible Exam Resource Configuration
const EXAM_RESOURCES: Record<string, { name: string, desc: string, url: string, icon: any, color: string }[]> = {
  'English': [
    { name: 'KMF', desc: 'IELTS / TOEFL Prep', url: 'https://www.kmf.com/', icon: FileText, color: 'slate' },
    { name: 'Burning Vocab', desc: 'CET-6 Real Questions', url: 'https://zhenti.burningvocabulary.cn/cet6', icon: Zap, color: 'red' }
  ],
  'French': [
    { name: 'TV5MONDE', desc: 'DELF / DALF Prep', url: 'https://apprendre.tv5monde.com/', icon: Globe, color: 'blue' },
    { name: 'Le Point du FLE', desc: 'Grammar & Exercises', url: 'https://www.lepointdufle.net/', icon: BookOpen, color: 'indigo' }
  ],
  'Japanese': [
    { name: 'JLPT Sensei', desc: 'JLPT N5-N1 Grammar', url: 'https://jlptsensei.com/', icon: Star, color: 'pink' },
    { name: 'NHK Web Easy', desc: 'Easy News Reading', url: 'https://www3.nhk.or.jp/news/easy/', icon: Headphones, color: 'orange' }
  ],
  'German': [
    { name: 'Goethe Institut', desc: 'Exam Practice', url: 'https://www.goethe.de/en/spr/kup/prf/prf.html', icon: FileText, color: 'emerald' },
    { name: 'Deutsche Welle', desc: 'Learn German', url: 'https://learngerman.dw.com/', icon: Radio, color: 'blue' }
  ],
};

// --- Utils ---

const getVoiceForLanguage = (langCode: string): SpeechSynthesisVoice | null => {
  const voices = window.speechSynthesis.getVoices();
  let targetLang = 'en'; // default
  
  if (langCode === 'Japanese') targetLang = 'ja';
  else if (langCode === 'French') targetLang = 'fr';
  else if (langCode === 'German') targetLang = 'de';
  else if (langCode === 'Spanish') targetLang = 'es';
  else if (langCode === 'Korean') targetLang = 'ko';

  return voices.find(v => v.lang.startsWith(targetLang)) || voices[0];
};

const speakText = (text: string, language: string) => {
  const synth = window.speechSynthesis;
  if (!synth) return;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voice = getVoiceForLanguage(language);
  if (voice) utterance.voice = voice;
  utterance.rate = 0.9; // Slightly slower for learning
  synth.speak(utterance);
};

const playHighQualityTTS = async (text: string, language: string) => {
    try {
        const base64 = await GeminiService.generateSpeech(text, language);
        const bytes = base64ToUint8Array(base64);
        const buffer = await decodeAudioData(bytes);
        await playAudioBuffer(buffer);
    } catch (e) {
        // Fallback if API fails
        console.warn("HQ TTS failed, falling back to browser", e);
        speakText(text, language);
    }
};

// --- Components ---

const AddLinkModal = ({ isOpen, onClose, onAdd, language }: { isOpen: boolean, onClose: () => void, onAdd: (link: CustomExamLink) => void, language: string }) => {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");

  if (!isOpen) return null;

  const handleSubmit = () => {
    if (name && url) {
      onAdd({
        id: Date.now().toString(),
        language,
        name,
        url: url.startsWith('http') ? url : `https://${url}`,
        description: desc || 'Custom Resource'
      });
      setName("");
      setUrl("");
      setDesc("");
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] w-full max-w-md p-6 shadow-2xl border-4 border-kitty-100 animate-in fade-in zoom-in-95">
         <h3 className="text-xl font-bold text-kitty-700 mb-4 flex items-center gap-2"><LinkIcon className="w-5 h-5"/> Add {language} Website</h3>
         
         <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-kitty-400 mb-1">Website Name</label>
              <input value={name} onChange={e => setName(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 border-kitty-100 focus:border-kitty-400 focus:outline-none text-sm" placeholder="e.g. My Prep Site"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-kitty-400 mb-1">URL</label>
              <input value={url} onChange={e => setUrl(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 border-kitty-100 focus:border-kitty-400 focus:outline-none text-sm" placeholder="e.g. www.example.com"/>
            </div>
            <div>
              <label className="block text-xs font-bold text-kitty-400 mb-1">Description (Optional)</label>
              <input value={desc} onChange={e => setDesc(e.target.value)} className="w-full px-4 py-3 rounded-xl border-2 border-kitty-100 focus:border-kitty-400 focus:outline-none text-sm" placeholder="e.g. Great for grammar"/>
            </div>
         </div>

         <div className="flex gap-3 mt-6">
           <button onClick={onClose} className="flex-1 py-3 text-kitty-400 font-bold hover:bg-kitty-50 rounded-xl">Cancel</button>
           <button onClick={handleSubmit} disabled={!name || !url} className="flex-1 py-3 bg-kitty-500 text-white font-bold rounded-xl hover:bg-kitty-600 disabled:opacity-50 shadow-lg shadow-kitty-200">Add Link</button>
         </div>
      </div>
    </div>
  );
};

const VocabChatModal = ({ word, onClose, language }: { word: string, onClose: () => void, language: string }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput("");
    setMessages(p => [...p, { role: 'user', text: userMsg }]);
    setLoading(true);
    
    try {
      const reply = await GeminiService.chatAboutWord(word, messages, userMsg, language);
      setMessages(p => [...p, { role: 'model', text: reply }]);
      speakText(reply, language);
    } catch (e) {
      setMessages(p => [...p, { role: 'model', text: "Oopsie! Can't connect right now. 🌸" }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-kitty-900/20 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] w-full max-w-md h-[500px] flex flex-col shadow-2xl border-4 border-kitty-200 overflow-hidden animate-in fade-in zoom-in-95">
        <div className="p-4 border-b border-kitty-100 flex justify-between items-center bg-kitty-50">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎀</span>
            <div>
              <h3 className="font-bold text-kitty-600">Kitty Coach</h3>
              <p className="text-xs text-kitty-400">Chatting about "{word}"</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-kitty-200 rounded-full text-kitty-400 hover:text-kitty-600 transition-colors"><X size={24}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
           {messages.length === 0 && (
             <div className="text-center text-kitty-300 text-sm mt-10">
               <Sparkles className="w-10 h-10 mx-auto mb-3 text-kitty-300 animate-pulse"/>
               <p>Ask me anything about this word in {language}! ✨</p>
             </div>
           )}
           {messages.map((m, i) => (
             <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
               <div className={`max-w-[80%] p-4 rounded-2xl text-sm shadow-sm ${m.role === 'user' ? 'bg-kitty-400 text-white rounded-br-sm' : 'bg-kitty-50 text-kitty-800 border border-kitty-100 rounded-bl-sm'}`}>
                 {m.text}
               </div>
             </div>
           ))}
           {loading && <div className="text-xs text-kitty-300 ml-4 animate-bounce">Thinking... 💭</div>}
        </div>
        <div className="p-3 border-t border-kitty-100 bg-kitty-50 flex gap-2">
           <input 
             value={input}
             onChange={e => setInput(e.target.value)}
             onKeyDown={e => e.key === 'Enter' && handleSend()}
             placeholder="Type here..."
             className="flex-1 px-4 py-3 rounded-full border-2 border-kitty-200 text-sm focus:outline-none focus:border-kitty-400 focus:ring-2 focus:ring-kitty-100 transition-all text-kitty-700 placeholder-kitty-300"
           />
           <button onClick={handleSend} disabled={loading} className="p-3 bg-kitty-500 text-white rounded-full hover:bg-kitty-600 disabled:opacity-50 hover:scale-110 transition-transform shadow-lg shadow-kitty-300"><Send size={20}/></button>
        </div>
      </div>
    </div>
  );
};

const SpinYarnModal = ({ vocabList, onClose, language }: { vocabList: VocabItem[], onClose: () => void, language: string }) => {
  const [story, setStory] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const generate = async () => {
      setLoading(true);
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
      const recentWords = vocabList.filter(v => new Date(v.dateAdded) > oneWeekAgo).map(v => v.word);
      const targetWords = recentWords.length < 3 ? vocabList.slice(0, 10).map(v => v.word) : recentWords;
      
      if (targetWords.length === 0) {
        setStory("No words yet! Go catch some words first! 🌸");
        setLoading(false);
        return;
      }

      try {
        const result = await GeminiService.generateVocabStory(targetWords, language);
        setStory(result);
        speakText(result, language);
      } catch (e) {
        setStory("Oops! Couldn't spin a story right now.");
      } finally {
        setLoading(false);
      }
    };
    generate();
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-kitty-900/30 backdrop-blur-sm p-4">
      <div className="bg-white rounded-[2rem] w-full max-w-lg max-h-[80vh] flex flex-col shadow-2xl border-4 border-kitty-100 overflow-hidden animate-in fade-in slide-in-from-bottom-10">
        <div className="p-6 border-b border-kitty-100 bg-kitty-50 flex justify-between items-center">
           <div>
             <h3 className="font-bold text-kitty-600 text-xl flex items-center"><Wand2 className="w-5 h-5 mr-2 text-kitty-400"/> Magic Story</h3>
             <p className="text-xs text-kitty-400">A special tale in {language}!</p>
           </div>
           <button onClick={onClose} className="text-kitty-400 hover:bg-kitty-200 p-2 rounded-full transition-colors"><X/></button>
        </div>
        <div className="p-8 overflow-y-auto text-lg font-medium leading-relaxed text-kitty-800 bg-white">
           {loading ? (
             <div className="flex flex-col items-center justify-center h-40 space-y-4">
               <Star className="w-10 h-10 text-kitty-300 animate-spin"/>
               <p className="text-kitty-400 animate-pulse">Weaving magic... ✨</p>
             </div>
           ) : (
             story.split('*').map((part, i) => 
               i % 2 === 1 ? <span key={i} className="font-bold text-kitty-600 bg-kitty-100 px-2 py-0.5 rounded-lg mx-1 shadow-sm">{part}</span> : part
             )
           )}
        </div>
        <div className="p-4 border-t border-kitty-100 bg-kitty-50 flex justify-end">
           <button onClick={() => speakText(story, language)} className="flex items-center gap-2 text-kitty-500 hover:text-kitty-700 px-4 py-2 rounded-xl hover:bg-kitty-100 transition font-bold">
             <Volume2 size={20}/> Read to me
           </button>
        </div>
      </div>
    </div>
  );
};

const Sidebar = ({ 
  vocabList, 
  sentenceList,
  onRemoveVocab,
  onRemoveSentence,
  activeTab,
  setActiveTab,
  onClose,
  onAddManualVocab,
  onAddManualSentence,
  onUpdateVocabImage,
  onUpdateSentence,
  language
}: { 
  vocabList: VocabItem[], 
  sentenceList: SavedSentence[],
  onRemoveVocab: (id: string) => void,
  onRemoveSentence: (id: string) => void,
  activeTab: 'vocab' | 'sentences',
  setActiveTab: (t: 'vocab' | 'sentences') => void,
  onClose: () => void,
  onAddManualVocab: (w: string) => void,
  onAddManualSentence: (s: string) => void,
  onUpdateVocabImage: (id: string, url: string) => void,
  onUpdateSentence: (id: string, updates: Partial<SavedSentence>) => void,
  language: string
}) => {
  const [reviewMode, setReviewMode] = useState(false);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [chatWord, setChatWord] = useState<string | null>(null);
  const [spinningYarn, setSpinningYarn] = useState(false);
  const [imageLoadingId, setImageLoadingId] = useState<string | null>(null);
  
  // Sentence Analysis State
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [practiceId, setPracticeId] = useState<string | null>(null);
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Filter lists by language (display English if language undefined for backward compatibility)
  const filteredVocab = vocabList.filter(v => v.language === language || (!v.language && language === 'English'));
  const filteredSentences = sentenceList.filter(s => s.language === language || (!s.language && language === 'English'));

  const startReview = () => {
    if (filteredVocab.length > 0) {
      setReviewMode(true);
      setCurrentCardIndex(0);
      setShowBack(false);
    }
  };

  const handleManualAdd = () => {
    if (!inputValue.trim()) return;
    if (activeTab === 'vocab') onAddManualVocab(inputValue.trim());
    else onAddManualSentence(inputValue.trim());
    setInputValue("");
    setShowInput(false);
  };

  const handleRegenerateImage = async (item: VocabItem) => {
    setImageLoadingId(item.id);
    const newUrl = await GeminiService.generateVocabImage(item.word);
    if (newUrl) onUpdateVocabImage(item.id, newUrl);
    setImageLoadingId(null);
  };

  const handleAnalyzeSentence = async (item: SavedSentence) => {
      setAnalyzingId(item.id);
      try {
          const data = await GeminiService.analyzeSentenceDeepDive(item.text, language);
          onUpdateSentence(item.id, { scenario: data.scenario, advancedVersion: data.advancedVersion });
      } catch(e) { alert("Analysis failed"); }
      setAnalyzingId(null);
  };

  const startPractice = async (id: string) => {
     setPracticeId(id);
     setPracticeFeedback(null);
     try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorderRef.current = new MediaRecorder(stream);
        chunksRef.current = [];
        mediaRecorderRef.current.ondataavailable = e => chunksRef.current.push(e.data);
        mediaRecorderRef.current.onstop = async () => {
            const blob = new Blob(chunksRef.current, { type: 'audio/wav' });
            const base64 = await blobToBase64(blob);
            setPracticeFeedback("Listening...");
            const target = sentenceList.find(s => s.id === id)?.text || "";
            const fb = await GeminiService.assessSentenceRecitation(target, base64, language);
            setPracticeFeedback(fb);
        };
        mediaRecorderRef.current.start();
        setIsRecording(true);
     } catch(e) { alert("Mic error"); }
  };

  const stopPractice = () => {
      if (mediaRecorderRef.current && isRecording) {
          mediaRecorderRef.current.stop();
          setIsRecording(false);
      }
  };

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden shadow-2xl z-30 rounded-l-[3rem] border-l-4 border-kitty-100">
      {chatWord && <VocabChatModal word={chatWord} onClose={() => setChatWord(null)} language={language} />}
      {spinningYarn && <SpinYarnModal vocabList={filteredVocab} onClose={() => setSpinningYarn(false)} language={language} />}

      {reviewMode && filteredVocab.length > 0 ? (
        <div className="flex-1 flex flex-col p-6 bg-kitty-900 text-white relative rounded-l-[3rem]">
          <button onClick={() => setReviewMode(false)} className="absolute top-6 right-6 text-kitty-300 hover:text-white"><X/></button>
          <div className="absolute top-6 left-6 flex items-center text-kitty-300 font-bold text-sm uppercase tracking-widest"><Zap className="w-4 h-4 mr-1"/> Flashcard</div>
          
          <div 
            className="flex-1 flex flex-col items-center justify-center cursor-pointer"
            onClick={() => setShowBack(!showBack)}
          >
            <div className="text-4xl font-bold text-center mb-6 drop-shadow-md">{filteredVocab[currentCardIndex].word}</div>
            {!showBack && (
               <button 
                 onClick={(e) => { e.stopPropagation(); speakText(filteredVocab[currentCardIndex].word, language); }}
                 className="p-4 bg-white/10 rounded-full hover:bg-white/20 text-kitty-300 mb-8 transition-transform hover:scale-110"
               >
                 <Volume2 className="w-8 h-8"/>
               </button>
            )}

            {showBack ? (
               <div className="text-center animate-in fade-in slide-in-from-bottom-4 w-full space-y-4">
                 <div className="bg-white/10 p-6 rounded-3xl border border-white/10 backdrop-blur-sm">
                     <p className="text-kitty-200 font-bold mb-2 text-xl">{filteredVocab[currentCardIndex].chineseDefinition}</p>
                     <p className="text-kitty-100 text-sm">{filteredVocab[currentCardIndex].definition}</p>
                 </div>
                 
                 <div className="bg-black/20 p-6 rounded-3xl border border-white/5">
                    <p className="text-kitty-100 italic text-sm mb-3">"{filteredVocab[currentCardIndex].contextSentence}"</p>
                    <button 
                       onClick={(e) => { e.stopPropagation(); speakText(filteredVocab[currentCardIndex].contextSentence, language); }}
                       className="text-kitty-400 hover:text-white transition-colors"
                    >
                       <Volume2 className="w-5 h-5 mx-auto"/>
                    </button>
                 </div>
                 {filteredVocab[currentCardIndex].imageUrl && (
                    <img src={filteredVocab[currentCardIndex].imageUrl} alt="vocab" className="w-32 h-32 object-cover rounded-2xl mx-auto border-4 border-white/20 shadow-lg"/>
                 )}
               </div>
            ) : (
              <p className="text-kitty-400 text-sm animate-pulse mt-10 flex items-center gap-2"><Sparkles size={14}/> Tap to Flip <Sparkles size={14}/></p>
            )}
          </div>
          
          <div className="flex flex-col gap-4 w-full mt-auto">
             {showBack && (
                <div className="flex gap-4">
                    <button 
                        onClick={(e) => { e.stopPropagation(); setCurrentCardIndex(c => Math.min(c + 1, filteredVocab.length - 1)); setShowBack(false); }} 
                        className="flex-1 bg-red-400 text-white py-3 rounded-2xl hover:bg-red-500 font-bold shadow-lg shadow-red-900/20"
                    >
                        Forgot 😓
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); setCurrentCardIndex(c => Math.min(c + 1, filteredVocab.length - 1)); setShowBack(false); }} 
                        className="flex-1 bg-emerald-400 text-white py-3 rounded-2xl hover:bg-emerald-500 font-bold shadow-lg shadow-emerald-900/20"
                    >
                        Got it! 💖
                    </button>
                </div>
             )}
             <div className="flex justify-between items-center mt-2">
                <button disabled={currentCardIndex===0} onClick={() => {setCurrentCardIndex(c=>c-1); setShowBack(false)}} className="p-3 hover:bg-white/10 rounded-full disabled:opacity-30"><ChevronLeft/></button>
                <span className="text-xs text-kitty-400 font-medium tracking-wider">{currentCardIndex+1} / {filteredVocab.length}</span>
                <button disabled={currentCardIndex===filteredVocab.length-1} onClick={() => {setCurrentCardIndex(c=>c+1); setShowBack(false)}} className="p-3 hover:bg-white/10 rounded-full disabled:opacity-30"><ArrowRight/></button>
             </div>
          </div>
        </div>
      ) : (
        <>
          <div className="p-6 border-b border-kitty-100 flex justify-between items-center bg-kitty-50 rounded-tl-[3rem]">
            <div className="flex items-center gap-2">
               <span className="text-2xl">👜</span>
               <h2 className="font-bold text-kitty-700">My Collection</h2>
            </div>
            <button onClick={onClose} className="text-kitty-400 hover:text-kitty-600 hover:bg-kitty-100 p-2 rounded-full"><ArrowRight/></button>
          </div>

          <div className="flex p-2 bg-kitty-50 m-4 rounded-xl">
             <button onClick={() => setActiveTab('vocab')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeTab==='vocab' ? 'bg-white shadow-sm text-kitty-600' : 'text-kitty-400'}`}>Words</button>
             <button onClick={() => setActiveTab('sentences')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeTab==='sentences' ? 'bg-white shadow-sm text-kitty-600' : 'text-kitty-400'}`}>Sentences</button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-20 space-y-4">
            {activeTab === 'vocab' ? (
               <>
                  <div className="flex gap-2 mb-2">
                    <button onClick={startReview} className="flex-1 bg-gradient-to-r from-kitty-400 to-kitty-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-kitty-200 hover:opacity-90 transition-opacity flex justify-center items-center gap-2">
                        <Zap size={16}/> Review {filteredVocab.length} Words
                    </button>
                    <button onClick={() => setSpinningYarn(true)} className="px-4 bg-indigo-100 text-indigo-500 rounded-xl font-bold hover:bg-indigo-200 transition-colors">
                        <Wand2 size={20}/>
                    </button>
                  </div>

                  {filteredVocab.map(item => (
                    <div key={item.id} className="group bg-white border-2 border-kitty-50 rounded-2xl p-4 hover:border-kitty-200 transition-all hover:shadow-lg">
                       <div className="flex justify-between items-start mb-2">
                          <div>
                             <h3 className="font-bold text-lg text-kitty-800">{item.word}</h3>
                             <p className="text-xs text-kitty-400">{item.chineseDefinition}</p>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => speakText(item.word, language)} className="p-2 hover:bg-kitty-50 rounded-full text-kitty-400 hover:text-kitty-600"><Volume2 size={16}/></button>
                            <button onClick={() => onRemoveVocab(item.id)} className="p-2 hover:bg-red-50 rounded-full text-kitty-300 hover:text-red-400"><Trash2 size={16}/></button>
                          </div>
                       </div>
                       <p className="text-sm text-slate-600 italic border-l-2 border-kitty-200 pl-3 mb-3">{item.contextSentence}</p>
                       
                       <div className="flex gap-2 justify-end">
                          <button onClick={() => setChatWord(item.word)} className="text-xs bg-kitty-50 text-kitty-500 px-3 py-1.5 rounded-full font-bold hover:bg-kitty-100 flex items-center gap-1">
                            <MessageSquare size={12}/> Ask Kitty
                          </button>
                          <button onClick={() => handleRegenerateImage(item)} className="text-xs bg-slate-50 text-slate-500 px-3 py-1.5 rounded-full font-bold hover:bg-slate-100 flex items-center gap-1">
                             {imageLoadingId === item.id ? <RefreshCw size={12} className="animate-spin"/> : <ImageIcon size={12}/>}
                             {item.imageUrl ? 'Regen Art' : 'Add Art'}
                          </button>
                       </div>
                       
                       {item.imageUrl && (
                           <div className="mt-3 rounded-xl overflow-hidden h-32 relative">
                              <img src={item.imageUrl} className="w-full h-full object-cover"/>
                           </div>
                       )}
                    </div>
                  ))}
               </>
            ) : (
               filteredSentences.map(item => (
                 <div key={item.id} className="bg-white border-2 border-kitty-50 rounded-2xl p-4 hover:border-kitty-200 transition-all hover:shadow-lg">
                    <div className="flex justify-between mb-2">
                        <span className="text-xs font-bold bg-kitty-100 text-kitty-600 px-2 py-1 rounded-lg">{item.source}</span>
                        <div className="flex gap-1">
                            <button onClick={() => onRemoveSentence(item.id)} className="p-1.5 hover:bg-red-50 rounded-full text-kitty-300 hover:text-red-400"><Trash2 size={14}/></button>
                        </div>
                    </div>
                    <p className="font-medium text-slate-800 mb-3 text-lg leading-relaxed">"{item.text}"</p>
                    
                    {item.advancedVersion && (
                        <div className="bg-indigo-50 p-3 rounded-xl mb-3 border border-indigo-100">
                            <p className="text-xs font-bold text-indigo-400 mb-1 flex items-center gap-1"><Sparkles size={10}/> Pro Version</p>
                            <p className="text-indigo-800 text-sm">{item.advancedVersion}</p>
                            <p className="text-xs text-indigo-400 mt-1 border-t border-indigo-100 pt-1">{item.scenario}</p>
                        </div>
                    )}

                    <div className="flex gap-2 border-t border-kitty-50 pt-3">
                       <button onClick={() => speakText(item.text, language)} className="flex-1 py-2 text-kitty-500 bg-kitty-50 rounded-xl text-sm font-bold hover:bg-kitty-100">Listen</button>
                       <button onClick={() => handleAnalyzeSentence(item)} className="flex-1 py-2 text-indigo-500 bg-indigo-50 rounded-xl text-sm font-bold hover:bg-indigo-100 flex items-center justify-center gap-1">
                          {analyzingId === item.id ? <RefreshCw className="animate-spin" size={14}/> : <Brain size={14}/>} Deep Dive
                       </button>
                    </div>
                    
                    <div className="mt-2">
                        {practiceId === item.id ? (
                            <div className="bg-slate-900 p-3 rounded-xl text-white">
                                {practiceFeedback ? (
                                    <div className="text-sm">
                                        <p className="mb-2">{practiceFeedback}</p>
                                        <button onClick={() => setPracticeId(null)} className="w-full py-2 bg-white/20 rounded-lg text-xs">Done</button>
                                    </div>
                                ) : (
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs animate-pulse text-red-400 flex items-center gap-1"><Mic size={12}/> Recording...</span>
                                        <button onClick={stopPractice} className="p-2 bg-red-500 rounded-full hover:bg-red-600"><Square size={16}/></button>
                                    </div>
                                )}
                            </div>
                        ) : (
                           <button onClick={() => startPractice(item.id)} className="w-full py-2 mt-1 text-slate-400 hover:text-slate-600 text-xs flex items-center justify-center gap-1 hover:bg-slate-50 rounded-lg"><Mic size={12}/> Practice Speaking</button>
                        )}
                    </div>
                 </div>
               ))
            )}
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-kitty-100">
             {showInput ? (
                <div className="flex gap-2">
                   <input 
                     autoFocus
                     value={inputValue}
                     onChange={e => setInputValue(e.target.value)}
                     onKeyDown={e => e.key === 'Enter' && handleManualAdd()}
                     placeholder={activeTab === 'vocab' ? "Add a word..." : "Add a sentence..."}
                     className="flex-1 px-4 py-3 rounded-xl border-2 border-kitty-200 focus:outline-none focus:border-kitty-400 text-sm"
                   />
                   <button onClick={handleManualAdd} className="p-3 bg-kitty-500 text-white rounded-xl shadow-lg"><Plus/></button>
                </div>
             ) : (
                <button onClick={() => setShowInput(true)} className="w-full py-4 rounded-2xl border-2 border-dashed border-kitty-300 text-kitty-400 font-bold hover:border-kitty-500 hover:text-kitty-500 transition-all flex items-center justify-center gap-2">
                   <Plus size={20}/> Add Manually
                </button>
             )}
          </div>
        </>
      )}
    </div>
  );
};

const App = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.DASHBOARD);
  const [language, setLanguage] = useState("English");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'vocab' | 'sentences'>('vocab');

  // Data States
  const [vocabList, setVocabList] = useState<VocabItem[]>([]);
  const [sentenceList, setSentenceList] = useState<SavedSentence[]>([]);
  const [dailyContent, setDailyContent] = useState<DailyContent | null>(null);
  const [writingHistory, setWritingHistory] = useState<WritingEntry[]>([]);
  const [customLinks, setCustomLinks] = useState<CustomExamLink[]>([]);

  // Feature Specific States
  const [writingInput, setWritingInput] = useState("");
  const [writingTopic, setWritingTopic] = useState("");
  const [isTopicLoading, setIsTopicLoading] = useState(false);
  const [writingResult, setWritingResult] = useState<WritingFeedback | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [linkModalOpen, setLinkModalOpen] = useState(false);
  
  // Selection Tooltip State
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [selectedText, setSelectedText] = useState("");

  useEffect(() => {
    // Simulate initial data load if needed
    setDailyContent({
      title: "Welcome to LinguaFlow",
      summary: "Start your journey.",
      url: "#",
      content: "Select a language and start reading to see content here.",
      source: "System"
    });
  }, []);

  // --- Handlers ---

  const addToVocab = async (word: string, context: string = "") => {
    const newItem: VocabItem = {
      id: Date.now().toString(),
      word,
      definition: "Loading...",
      chineseDefinition: "Loading...",
      contextSentence: context || `You added: ${word}`,
      dateAdded: new Date().toISOString(),
      language
    };
    setVocabList(prev => [newItem, ...prev]);
    
    try {
        const details = await GeminiService.generateVocabContext(word, language);
        setVocabList(prev => prev.map(item => item.id === newItem.id ? {
            ...item, 
            definition: details.definition, 
            chineseDefinition: details.chineseDefinition, 
            contextSentence: details.sentence || item.contextSentence 
        } : item));
    } catch (e) {
        console.error("Failed to fetch vocab details");
    }
    
    setSidebarOpen(true);
    setActiveTab('vocab');
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) {
      setSelectionRect(null);
      return;
    }
    const text = selection.toString().trim();
    if (text.length > 0 && text.length < 50) { // Reasonable length for a vocab item
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSelectionRect(rect);
      setSelectedText(text);
    } else {
      setSelectionRect(null);
    }
  };

  const deleteWritingEntry = (id: string) => {
    setWritingHistory(prev => prev.filter(entry => entry.id !== id));
  };

  const handleGenerateTopic = async () => {
      setIsTopicLoading(true);
      try {
          const topic = await GeminiService.generateWritingTopic(language);
          setWritingTopic(topic);
          setWritingInput(""); 
      } catch (e) {
          console.error("Failed to generate topic");
      } finally {
          setIsTopicLoading(false);
      }
  };

  const handleWritingSubmit = async () => {
    if (!writingInput) return;
    const feedback = await GeminiService.analyzeWriting(writingInput, language);
    setWritingResult(feedback);
    setWritingHistory(prev => [{
      id: Date.now().toString(),
      date: new Date().toLocaleDateString(),
      topic: writingTopic || "Free Write",
      original: writingInput,
      feedback
    }, ...prev]);
  };

  const loadDailyContent = async (type: 'reading' | 'listening') => {
    setDailyContent(null); // Loading state
    if (type === 'reading') {
      const suggestions = await GeminiService.getReadingSuggestions('Intermediate', language);
      setDailyContent(suggestions[0]);
    } else {
      const content = await GeminiService.getDailyListeningContent(language);
      setDailyContent(content);
    }
  };

  const renderDashboard = () => (
    <div className="p-8 max-w-6xl mx-auto h-full overflow-y-auto no-scrollbar">
      <div className="flex justify-between items-center mb-10">
         <div>
            <h1 className="text-4xl font-bold text-kitty-800 mb-2">Hello, Student! 👋</h1>
            <p className="text-kitty-500 font-medium">Ready to master {language} today?</p>
         </div>
         <div className="flex gap-3">
             {SUPPORTED_LANGUAGES.map(lang => (
                 <button 
                   key={lang.code}
                   onClick={() => setLanguage(lang.code)}
                   className={`px-4 py-3 rounded-2xl font-bold transition-all ${language === lang.code ? 'bg-kitty-500 text-white shadow-lg shadow-kitty-300 scale-105' : 'bg-white text-kitty-300 hover:bg-kitty-50'}`}
                 >
                    <span className="mr-2 text-xl">{lang.flag}</span>
                    {lang.label}
                 </button>
             ))}
         </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
         <div onClick={() => { setMode(AppMode.READING); loadDailyContent('reading'); }} className="bg-gradient-to-br from-orange-100 to-orange-50 p-8 rounded-[2.5rem] cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all group">
            <div className="bg-white w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:rotate-12 transition-transform">
                <BookOpen className="text-orange-400 w-8 h-8"/>
            </div>
            <h3 className="text-2xl font-bold text-orange-900 mb-2">Reading</h3>
            <p className="text-orange-700/60 font-medium">Immersive stories</p>
         </div>
         
         <div onClick={() => { setMode(AppMode.LISTENING); loadDailyContent('listening'); }} className="bg-gradient-to-br from-purple-100 to-purple-50 p-8 rounded-[2.5rem] cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all group">
            <div className="bg-white w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:-rotate-12 transition-transform">
                <Headphones className="text-purple-400 w-8 h-8"/>
            </div>
            <h3 className="text-2xl font-bold text-purple-900 mb-2">Listening</h3>
            <p className="text-purple-700/60 font-medium">TED Talks & More</p>
         </div>

         <div onClick={() => setMode(AppMode.WRITING)} className="bg-gradient-to-br from-pink-100 to-pink-50 p-8 rounded-[2.5rem] cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all group">
             <div className="bg-white w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:rotate-12 transition-transform">
                <PenTool className="text-pink-400 w-8 h-8"/>
            </div>
            <h3 className="text-2xl font-bold text-pink-900 mb-2">Writing</h3>
            <p className="text-pink-700/60 font-medium">Journal with AI</p>
         </div>

         <div onClick={() => setMode(AppMode.SPEAKING)} className="bg-gradient-to-br from-blue-100 to-blue-50 p-8 rounded-[2.5rem] cursor-pointer hover:shadow-xl hover:scale-[1.02] transition-all group">
             <div className="bg-white w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-sm group-hover:-rotate-12 transition-transform">
                <Mic className="text-blue-400 w-8 h-8"/>
            </div>
            <h3 className="text-2xl font-bold text-blue-900 mb-2">Speaking</h3>
            <p className="text-blue-700/60 font-medium">Real-time chat</p>
         </div>
      </div>

      <div className="bg-white rounded-[3rem] p-8 shadow-xl shadow-kitty-100/50 border-2 border-kitty-50">
         <div className="flex justify-between items-center mb-6">
            <h3 className="text-2xl font-bold text-slate-800 flex items-center gap-2"><GraduationCap className="text-kitty-500"/> Exam Portal</h3>
            <button onClick={() => setLinkModalOpen(true)} className="flex items-center gap-2 text-kitty-500 font-bold hover:bg-kitty-50 px-4 py-2 rounded-xl transition-colors">
                <Plus size={18}/> Add Resource
            </button>
         </div>
         
         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(EXAM_RESOURCES[language] || []).map((res, idx) => (
                <a key={idx} href={res.url} target="_blank" rel="noopener noreferrer" className="bg-slate-50 hover:bg-kitty-50 p-6 rounded-3xl transition-all hover:shadow-md border border-slate-100 group">
                   <div className={`w-12 h-12 rounded-2xl bg-${res.color}-100 flex items-center justify-center mb-4 text-${res.color}-500 group-hover:scale-110 transition-transform`}>
                       <res.icon size={24}/>
                   </div>
                   <h4 className="font-bold text-slate-800 mb-1">{res.name}</h4>
                   <p className="text-xs text-slate-400">{res.desc}</p>
                </a>
            ))}
            {customLinks.filter(l => l.language === language).map(link => (
                <a key={link.id} href={link.url} target="_blank" rel="noopener noreferrer" className="bg-slate-50 hover:bg-kitty-50 p-6 rounded-3xl transition-all hover:shadow-md border border-slate-100 group relative">
                    <button 
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setCustomLinks(prev => prev.filter(l => l.id !== link.id));
                      }}
                      className="absolute top-2 right-2 p-1.5 text-slate-300 hover:text-red-400 hover:bg-red-50 rounded-full"
                    >
                      <Trash2 size={14}/>
                    </button>
                   <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center mb-4 text-purple-500">
                       <LinkIcon size={24}/>
                   </div>
                   <h4 className="font-bold text-slate-800 mb-1">{link.name}</h4>
                   <p className="text-xs text-slate-400">{link.description}</p>
                </a>
            ))}
         </div>
      </div>
    </div>
  );

  return (
    <div className="h-screen w-screen bg-kitty-50 flex text-slate-800 font-sans overflow-hidden relative">
      <AddLinkModal isOpen={linkModalOpen} onClose={() => setLinkModalOpen(false)} onAdd={l => setCustomLinks(p => [...p, l])} language={language}/>

      {/* Sidebar Overlay */}
      <div className={`fixed inset-y-0 right-0 w-[450px] transform transition-transform duration-500 ease-out z-50 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <Sidebar 
          vocabList={vocabList}
          sentenceList={sentenceList}
          onRemoveVocab={id => setVocabList(p => p.filter(i => i.id !== id))}
          onRemoveSentence={id => setSentenceList(p => p.filter(i => i.id !== id))}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          onClose={() => setSidebarOpen(false)}
          onAddManualVocab={w => addToVocab(w)}
          onAddManualSentence={s => setSentenceList(p => [{id: Date.now().toString(), text: s, dateAdded: new Date().toISOString(), source: 'Manual', language}, ...p])}
          onUpdateVocabImage={(id, url) => setVocabList(p => p.map(i => i.id === id ? {...i, imageUrl: url} : i))}
          onUpdateSentence={(id, up) => setSentenceList(p => p.map(i => i.id === id ? {...i, ...up} : i))}
          language={language}
        />
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative">
         {/* Top Bar */}
         <div className="h-20 px-8 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3 cursor-pointer hover:opacity-80" onClick={() => setMode(AppMode.DASHBOARD)}>
                <div className="bg-kitty-500 text-white p-2.5 rounded-xl">
                    <Sparkles size={24}/> 
                </div>
                <h1 className="font-bold text-2xl text-kitty-900 tracking-tight">LinguaFlow</h1>
            </div>
            
            <div className="flex items-center gap-4">
               {mode !== AppMode.DASHBOARD && (
                   <div className="px-4 py-2 bg-white rounded-full text-sm font-bold text-kitty-400 shadow-sm border border-kitty-100 flex items-center gap-2">
                      {language} <span className="text-slate-300">|</span> {mode} Mode
                   </div>
               )}
               <button onClick={() => setSidebarOpen(true)} className="relative p-3 bg-white rounded-full shadow-sm hover:shadow-md text-kitty-600 transition-all hover:bg-kitty-50">
                   <ShoppingBag size={24}/>
                   <span className="absolute top-0 right-0 w-4 h-4 bg-red-400 border-2 border-white rounded-full"></span>
               </button>
            </div>
         </div>

         {/* View Content */}
         <div className="flex-1 overflow-hidden relative">
            {mode === AppMode.DASHBOARD && renderDashboard()}
            
            {(mode === AppMode.READING || mode === AppMode.LISTENING) && (
               <div className="h-full flex flex-col max-w-4xl mx-auto p-6 animate-in fade-in slide-in-from-bottom-8">
                  <div className={`bg-white rounded-[3rem] p-10 shadow-2xl ${mode === AppMode.LISTENING ? 'shadow-purple-100 border-purple-50' : 'shadow-orange-100 border-orange-50'} border h-full flex flex-col`}>
                     {dailyContent ? (
                        <>
                           <div className="flex justify-between items-start mb-6">
                              <div>
                                 <span className={`${mode === AppMode.LISTENING ? 'bg-purple-100 text-purple-600' : 'bg-orange-100 text-orange-600'} px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider mb-3 inline-block`}>{dailyContent.source}</span>
                                 <h2 className="text-3xl font-bold text-slate-900 mb-2">{dailyContent.title}</h2>
                                 <p className="text-slate-500">{dailyContent.summary}</p>
                              </div>
                              <div className="flex gap-2">
                                {mode === AppMode.LISTENING && (
                                    <button onClick={() => playHighQualityTTS(dailyContent.content, language)} className="p-3 bg-purple-500 text-white rounded-full hover:bg-purple-600 transition-colors shadow-lg shadow-purple-200 animate-pulse">
                                        <Play size={24} fill="currentColor"/>
                                    </button>
                                )}
                                <button onClick={() => loadDailyContent(mode === AppMode.LISTENING ? 'listening' : 'reading')} className="p-3 hover:bg-slate-50 rounded-full text-slate-300 hover:text-slate-500 transition-colors"><RefreshCw/></button>
                              </div>
                           </div>
                           <div className="flex-1 overflow-y-auto pr-4 leading-loose text-lg text-slate-700 font-medium font-serif" onMouseUp={handleTextSelection}>
                              {dailyContent.content.split('\n').map((para, i) => <p key={i} className="mb-4">{para}</p>)}
                           </div>
                           
                           {/* Selection Tooltip */}
                           {selectionRect && (
                             <div 
                               style={{ top: selectionRect.top - 50, left: selectionRect.left }} 
                               className="fixed z-[60] bg-kitty-900 text-white px-4 py-2 rounded-xl shadow-xl flex items-center gap-3 animate-in fade-in zoom-in-95"
                             >
                               <span className="font-bold max-w-[150px] truncate">"{selectedText}"</span>
                               <button 
                                 onClick={() => { addToVocab(selectedText); setSelectionRect(null); }}
                                 className="bg-kitty-500 hover:bg-kitty-400 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1"
                               >
                                 <Plus size={12}/> Add
                               </button>
                             </div>
                           )}
                        </>
                     ) : (
                        <div className="flex-1 flex items-center justify-center text-slate-300 animate-pulse">Loading content...</div>
                     )}
                  </div>
               </div>
            )}

            {mode === AppMode.WRITING && (
                <div className="h-full max-w-5xl mx-auto p-6 flex gap-6 animate-in fade-in slide-in-from-bottom-8">
                    <div className="flex-1 flex flex-col">
                        <div className="bg-white rounded-[2.5rem] p-8 shadow-xl mb-6 flex-1 flex flex-col">
                            <div className="flex justify-between items-start mb-4">
                                <h2 className="text-2xl font-bold text-pink-900 flex items-center gap-2"><PenTool/> My Journal</h2>
                                <button onClick={handleGenerateTopic} className="flex items-center gap-2 text-xs font-bold text-pink-500 bg-pink-50 px-3 py-2 rounded-xl hover:bg-pink-100 transition-colors">
                                    {isTopicLoading ? <RefreshCw className="animate-spin" size={14}/> : <Wand2 size={14}/>}
                                    {writingTopic ? 'New Topic' : 'Inspire Me'}
                                </button>
                            </div>
                            
                            {writingTopic && (
                                <div className="mb-4 bg-pink-50 border border-pink-100 p-4 rounded-2xl relative">
                                    <p className="text-pink-800 font-medium italic">" {writingTopic} "</p>
                                    <button onClick={() => setWritingTopic("")} className="absolute top-2 right-2 text-pink-300 hover:text-pink-500"><X size={14}/></button>
                                </div>
                            )}

                            <textarea
                                value={writingInput}
                                onChange={e => setWritingInput(e.target.value)}
                                placeholder={`Write something in ${language} today...`}
                                className="flex-1 w-full resize-none outline-none text-lg text-slate-700 placeholder-pink-200 bg-transparent"
                            />
                            <div className="flex justify-end mt-4 pt-4 border-t border-pink-50">
                                <button onClick={handleWritingSubmit} className="px-8 py-3 bg-pink-500 text-white rounded-2xl font-bold hover:bg-pink-600 shadow-lg shadow-pink-200 transition-transform hover:scale-105">
                                    Analyze & Save
                                </button>
                            </div>
                        </div>
                        {writingResult && (
                           <div className="bg-white rounded-[2.5rem] p-8 shadow-xl animate-in slide-in-from-bottom-10 border-l-8 border-pink-400">
                              <div className="grid grid-cols-2 gap-8">
                                  <div>
                                      <h4 className="font-bold text-pink-500 mb-2 flex items-center gap-2"><CheckCircle size={16}/> Corrections</h4>
                                      <p className="text-slate-700 bg-pink-50 p-4 rounded-xl">{writingResult.corrected}</p>
                                  </div>
                                  <div>
                                      <h4 className="font-bold text-indigo-500 mb-2 flex items-center gap-2"><Sparkles size={16}/> Better Version</h4>
                                      <p className="text-slate-700 bg-indigo-50 p-4 rounded-xl">{writingResult.upgraded}</p>
                                  </div>
                              </div>
                           </div>
                        )}
                    </div>
                    
                    <div className="w-80 bg-white/50 backdrop-blur rounded-[2.5rem] p-6 overflow-y-auto">
                        <h3 className="font-bold text-slate-400 uppercase text-xs tracking-widest mb-4">History</h3>
                        {writingHistory.map(entry => (
                            <div key={entry.id} className="bg-white p-4 rounded-2xl shadow-sm mb-3 hover:shadow-md transition-all group cursor-pointer" onClick={() => { setWritingInput(entry.original); setWritingResult(entry.feedback); }}>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-xs font-bold text-pink-400">{entry.date}</span>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); deleteWritingEntry(entry.id); }} 
                                        className="text-slate-300 hover:text-red-500 p-1 rounded-full hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 size={14}/>
                                    </button>
                                </div>
                                <div className="mb-1">
                                   <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md font-bold">{entry.topic}</span>
                                </div>
                                <p className="text-sm text-slate-600 line-clamp-2">"{entry.original}"</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {mode === AppMode.SPEAKING && (
               <div className="h-full flex items-center justify-center p-10 animate-in fade-in zoom-in-95">
                   <div className="text-center space-y-6">
                       <div className="w-40 h-40 bg-blue-100 rounded-full flex items-center justify-center mx-auto animate-bounce-slow">
                           <Mic className="w-16 h-16 text-blue-500"/>
                       </div>
                       <h2 className="text-3xl font-bold text-blue-900">Conversational Partner</h2>
                       <p className="text-blue-600/60 max-w-md mx-auto">To start a scenario, please describe a situation or upload an image for context.</p>
                       <button className="px-8 py-4 bg-blue-500 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-200 hover:scale-105 transition-transform">Start Session</button>
                   </div>
               </div>
            )}
         </div>
      </div>
    </div>
  );
};

export default App;
