import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithCustomToken, 
  signInAnonymously, 
  onAuthStateChanged, 
  signOut,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  updateDoc, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  query
} from 'firebase/firestore';
import { 
  Volume2, 
  Trash2, 
  Compass, 
  Trophy, 
  Search, 
  LogOut, 
  Loader2, 
  BookOpen, 
  Sparkles,
  X,
  Plus,
  Target,
  Layers,
  PlayCircle,
  AlertCircle,
  UserCircle,
  Award,
  Flame
} from 'lucide-react';

// ========================================================
// 🛠️ 基礎配置與環境變數 (完全對齊用戶要求)
// ========================================================
const appId = 'multilang-vocab-master'; 

const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY || "", 
      authDomain: "vocabularyh-4c909.firebaseapp.com",
      projectId: "vocabularyh-4c909",
      storageBucket: "vocabularyh-4c909.firebasestorage.app",
      messagingSenderId: "924954723346",
      appId: "1:924954723346:web:cc792c2fdd317fb96684cb",
      measurementId: "G-C7KZ6SPTVC"
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const isCanvas = typeof __app_id !== 'undefined';
const geminiApiKey = isCanvas ? "" : (process.env.REACT_APP_GEMINI_KEY || "");
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";

const App = () => {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [words, setWords] = useState([]);
  const [activeTab, setActiveTab] = useState('list');
  const [langMode, setLangMode] = useState('EN'); 
  const [newWord, setNewWord] = useState({ term: '', definition: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [duplicateAlert, setDuplicateAlert] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [spellCheck, setSpellCheck] = useState(null);
  const [quizFeedback, setQuizFeedback] = useState(null);
  const [quizWord, setQuizWord] = useState(null);
  const [options, setOptions] = useState([]);

  const typingTimer = useRef(null);
  const isTransitioning = useRef(false);

  // ========================================================
  // 🔐 認證邏輯 (遵循 Rule 3: Auth Before Queries)
  // ========================================================
  useEffect(() => {
    const initAuth = async () => {
      setAuthLoading(true);
      try {
        // 優先順序：1. Custom Token (環境提供) -> 2. 匿名登入 (保底)
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else if (!auth.currentUser) {
          // 如果沒有 currentUser 且沒有 token，嘗試匿名登入以確保 Firestore 可用
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Authentication failed:", err);
      } finally {
        setAuthLoading(false);
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      // 在 iframe/canvas 內，signInWithPopup 可能會被阻擋
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Popup failed, fallback to Anonymous:", err);
      await signInAnonymously(auth);
    }
  };

  // ========================================================
  // 📊 資料同步 (遵循 Rule 1 & 2)
  // ========================================================
  useEffect(() => {
    if (!user) return;

    // 路徑嚴格遵循 Rule 1
    const collectionPath = `artifacts/${appId}/users/${user.uid}/vocab`;
    const wordsRef = collection(db, collectionPath);
    
    const unsubscribe = onSnapshot(wordsRef, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // 在前端進行排序 (Rule 2: No Complex Queries)
        setWords(data.sort((a,b) => (b.createdAt || 0) - (a.createdAt || 0)));
      }, 
      (error) => {
        console.error("Firestore Error:", error);
      }
    );
    return () => unsubscribe();
  }, [user]);

  // ========================================================
  // 🧠 單字處理邏輯
  // ========================================================
  const checkAndTranslate = async (term) => {
    if (!term || term.trim().length < 1 || isProcessing) return;
    setIsProcessing(true);
    try {
      const sourceLang = langMode === 'JP' ? 'ja' : 'en';
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sourceLang}&tl=zh-TW&dt=t&q=${encodeURIComponent(term)}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data?.[0]?.[0]) {
        setNewWord(prev => ({ ...prev, definition: String(data[0][0][0]) }));
      }
    } catch (e) {
      console.error("Translation error:", e);
    } finally {
      setIsProcessing(false);
    }
  };

  const addWord = async (e) => {
    if (e) e.preventDefault();
    if (!newWord.term || !newWord.definition || !user) return;
    
    const term = newWord.term.trim();
    if (words.some(w => w.lang === langMode && w.term.toLowerCase() === term.toLowerCase())) {
      setDuplicateAlert(true);
      setTimeout(() => setDuplicateAlert(false), 1500);
      return;
    }

    try {
      const collectionPath = `artifacts/${appId}/users/${user.uid}/vocab`;
      await addDoc(collection(db, collectionPath), {
        term,
        definition: newWord.definition.trim(),
        lang: langMode,
        createdAt: Date.now(),
        stats: { mc: { correct: 0, total: 0, archived: false } }
      });
      setNewWord({ term: '', definition: '' });
      setSearchTerm('');
    } catch (e) {
      console.error("Add word error:", e);
    }
  };

  // ========================================================
  // 🤖 AI 分析 (使用用戶要求的 JSON 結構)
  // ========================================================
  const fetchExplanation = async (word) => {
    if (isExplaining) return;
    setSelectedWord(word);
    setExplanation(null);
    setIsExplaining(true);
    
    try {
      const prompt = `你是一個語言專家。分析單字 "${word.term}" (${word.lang === 'JP' ? '日文' : '英文'})。
      回傳格式必須為 JSON 物件，內容須為繁體中文：
      {
        "phonetic": "讀法(日文給平假名, 英文給音標)",
        "pos": "詞性(繁體中文)",
        "example_original": "單句例句(原文)",
        "example_zh": "例句翻譯(繁體中文)",
        "synonyms": ["該語言單字1 (解釋1)", "該語言單字2 (解釋2)"],
        "tips": "記憶技巧"
      }`;

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiApiKey}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
        })
      });
      const result = await res.json();
      const parsed = JSON.parse(result.candidates?.[0]?.content?.parts?.[0]?.text);
      setExplanation(parsed);
    } catch (e) {
      console.error("AI Error:", e);
    } finally {
      setIsExplaining(false);
    }
  };

  // ========================================================
  // 🔊 語音功能
  // ========================================================
  const speak = (text, lang) => {
    if (!text) return;
    window.speechSynthesis.cancel();
    const ut = new SpeechSynthesisUtterance(text);
    ut.lang = lang === 'JP' ? 'ja-JP' : 'en-US';
    window.speechSynthesis.speak(ut);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex flex-col items-center justify-center">
        <Loader2 className="animate-spin text-[#2D4F1E] w-12 h-12 mb-4" />
        <p className="font-black text-[#2D4F1E] tracking-widest text-xs">驗證身分中...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-stone-800 font-sans pb-20">
      {/* 導覽列 */}
      <header className="bg-white/80 backdrop-blur-md border-b border-stone-100 sticky top-0 z-40 px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Compass className="text-[#2D4F1E]" size={24} />
          <span className="font-black text-lg">VocabHunter</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-stone-100 p-1 rounded-xl flex">
            {['EN', 'JP'].map(l => (
              <button 
                key={l}
                onClick={() => setLangMode(l)}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${langMode === l ? 'bg-[#2D4F1E] text-white shadow-sm' : 'text-stone-400'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <button onClick={() => signOut(auth)} className="text-stone-300 hover:text-red-500 transition-colors">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto p-4 md:p-8 space-y-6">
        {/* 輸入區域 */}
        <section className={`bg-white p-6 rounded-[2rem] shadow-sm border border-stone-100 space-y-4 ${duplicateAlert ? 'animate-bounce' : ''}`}>
          <div className="relative">
            <input 
              type="text"
              placeholder={langMode === 'JP' ? "輸入日文..." : "輸入英文..."}
              className="w-full px-6 py-4 bg-stone-50 border-2 border-transparent rounded-2xl focus:border-[#2D4F1E]/10 focus:bg-white outline-none font-black text-xl"
              value={newWord.term}
              onChange={(e) => {
                setNewWord({...newWord, term: e.target.value});
                if (typingTimer.current) clearTimeout(typingTimer.current);
                typingTimer.current = setTimeout(() => checkAndTranslate(e.target.value), 800);
              }}
            />
            {isProcessing && <Loader2 className="absolute right-4 top-4 animate-spin text-stone-300" />}
          </div>
          {newWord.term && (
            <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
              <input 
                type="text"
                placeholder="翻譯結果"
                className="w-full px-6 py-4 bg-stone-50 rounded-2xl font-bold text-stone-600 outline-none"
                value={newWord.definition}
                onChange={(e) => setNewWord({...newWord, definition: e.target.value})}
              />
              <button 
                onClick={addWord}
                className="w-full py-4 bg-[#2D4F1E] text-white rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95 transition-all shadow-lg shadow-[#2D4F1E]/10"
              >
                <Plus size={20}/> 收錄至獵場
              </button>
            </div>
          )}
        </section>

        {/* 列表區域 */}
        <section className="space-y-3">
          <div className="flex items-center justify-between px-2 mb-2">
            <h3 className="font-black text-stone-400 text-xs tracking-widest uppercase">我的獵場 ({words.filter(w => w.lang === langMode).length})</h3>
          </div>
          {words.filter(w => w.lang === langMode).map(word => (
            <div 
              key={word.id}
              onClick={() => fetchExplanation(word)}
              className="bg-white p-5 rounded-3xl border border-stone-50 shadow-sm flex items-center justify-between group hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-black text-xl text-stone-800">{word.term}</span>
                  {word.stats?.mc?.archived && <Award size={16} className="text-orange-500" />}
                </div>
                <p className="text-stone-400 font-bold text-sm">{word.definition}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={(e) => { e.stopPropagation(); speak(word.term, word.lang); }} className="p-2 text-stone-300 hover:text-[#2D4F1E]">
                  <Volume2 size={18} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, `artifacts/${appId}/users/${user.uid}/vocab`, word.id)); }} className="p-2 text-stone-200 hover:text-red-400">
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </section>
      </main>

      {/* AI 詳解彈窗 */}
      {selectedWord && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6">
          <div className="absolute inset-0 bg-stone-900/40 backdrop-blur-sm" onClick={() => setSelectedWord(null)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[3rem] md:rounded-[3rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-10">
            <div className={`p-8 ${selectedWord.lang === 'JP' ? 'bg-orange-600' : 'bg-[#2D4F1E]'} text-white flex justify-between items-start`}>
              <div>
                <h2 className="text-3xl font-black">{selectedWord.term}</h2>
                <p className="text-white/80 font-bold text-lg">{selectedWord.definition}</p>
              </div>
              <button onClick={() => setSelectedWord(null)} className="p-2 bg-black/10 rounded-full"><X size={20}/></button>
            </div>
            
            <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
              {isExplaining ? (
                <div className="py-12 text-center space-y-4">
                  <Loader2 className="animate-spin mx-auto text-stone-200" size={40} />
                  <p className="text-stone-300 font-black text-xs tracking-widest">AI 分析單字中...</p>
                </div>
              ) : explanation && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                      <p className="text-[10px] font-black text-stone-300 uppercase mb-1">詞性</p>
                      <p className="font-black text-stone-700">{explanation.pos}</p>
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl border border-stone-100">
                      <p className="text-[10px] font-black text-stone-300 uppercase mb-1">讀法</p>
                      <p className="font-black text-[#2D4F1E] font-mono">{explanation.phonetic}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-stone-300 uppercase flex items-center gap-1"><PlayCircle size={12}/> 實戰例句</p>
                    <div className="bg-stone-50 p-5 rounded-2xl border-l-4 border-[#2D4F1E]">
                      <p className="font-black text-stone-800 italic mb-2">"{explanation.example_original}"</p>
                      <p className="text-stone-500 font-bold text-sm">{explanation.example_zh}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-stone-300 uppercase flex items-center gap-1"><Layers size={12}/> 同義詞</p>
                    <div className="flex flex-wrap gap-2">
                      {explanation.synonyms?.map((s, i) => (
                        <span key={i} className="px-3 py-1.5 bg-white border border-stone-100 rounded-xl text-xs font-black text-stone-600 shadow-sm">{s}</span>
                      ))}
                    </div>
                  </div>

                  <div className="bg-orange-50 p-5 rounded-2xl border border-orange-100">
                    <p className="text-[10px] font-black text-orange-400 uppercase flex items-center gap-1 mb-2"><Sparkles size={12}/> 記憶技巧</p>
                    <p className="text-orange-900 font-bold text-sm leading-relaxed">{explanation.tips}</p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
