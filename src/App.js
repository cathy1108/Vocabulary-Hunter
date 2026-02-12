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
  AlertCircle,
  User as UserIcon,
  XCircle,
  Layers
} from 'lucide-react';

// ========================================================
// 🔥 Firebase & 全域配置
// ========================================================
// ========================================================
// 🛠️ Firebase 配置與安全性處理
// ========================================================
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      // 這是當環境變數不存在時的備援。
      // 請確保在正式環境中使用 __firebase_config 注入。
      apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
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
const googleProvider = new GoogleAuthProvider();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'multilang-vocab-master';

const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
const apiCache = new Map();

// ========================================================
// 🛡️ API 輔助函式 (Gemini 2.5 Flash)
// ========================================================
const fetchGemini = async (prompt, isJson = false) => {
  const cacheKey = `${isJson ? 'json:' : 'text:'}${prompt}`;
  if (apiCache.has(cacheKey)) return apiCache.get(cacheKey);

  const geminiApiKey = isCanvas ? "" : (process.env.REACT_APP_GEMINI_KEY || "");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }]
  };

  if (isJson) {
    payload.generationConfig = { responseMimeType: "application/json" };
  }

  let delay = 1000;
  for (let i = 0; i < 5; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.status === 429) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }

      const data = await response.json();
      const result = data.candidates?.[0]?.content?.parts?.[0]?.text;
      apiCache.set(cacheKey, result);
      return result;
    } catch (e) {
      if (i === 4) throw e;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
};

const App = () => {
  const [user, setUser] = useState(null);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list');
  const [langMode, setLangMode] = useState('EN'); 
  const [newWord, setNewWord] = useState({ term: '', definition: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [duplicateAlert, setDuplicateAlert] = useState(false);
  const [selectedWord, setSelectedWord] = useState(null);
  const [explanation, setExplanation] = useState(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [quizWord, setQuizWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [quizFeedback, setQuizFeedback] = useState(null); 
  const isTransitioning = useRef(false);

  const currentLangWords = words.filter(w => w.lang === langMode);

  // (1) 初始化 Auth (Rule 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else if (!auth.currentUser) {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        setErrorMsg("身份驗證失敗");
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // (2) 監聽資料庫 (Rule 1: Strict Paths)
  useEffect(() => {
    if (!user) return;
    
    const wordsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
    // 使用簡單查詢 (Rule 2)
    const unsubscribe = onSnapshot(wordsRef, 
      (snapshot) => {
        const wordList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // 在記憶體中排序 (Rule 2)
        setWords(wordList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
      },
      (err) => {
        console.error("Firestore Error:", err);
        setErrorMsg("讀取單字庫失敗，請檢查權限設定");
      }
    );
    return () => unsubscribe();
  }, [user]);

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setErrorMsg("Google 登入失敗");
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setWords([]);
      apiCache.clear();
    } catch (err) {
      setErrorMsg("登出失敗");
    }
  };

  const speak = (text, lang) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'JP' ? 'ja-JP' : 'en-US';
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  };

  const fetchTranslation = async () => {
    if (!newWord.term || isProcessing) return;
    setIsProcessing(true);
    try {
      const prompt = `Translate this ${langMode === 'EN' ? 'English' : 'Japanese'} word to Traditional Chinese: "${newWord.term}". Just provide the most common one-word meaning. No extra text.`;
      const result = await fetchGemini(prompt);
      setNewWord(prev => ({ ...prev, definition: result?.trim() || "" }));
    } catch (err) {
      setErrorMsg("翻譯失敗");
    } finally {
      setIsProcessing(false);
    }
  };

  const fetchExplanation = async (word) => {
    if (isExplaining) return;
    setSelectedWord(word);
    setExplanation(null);
    setIsExplaining(true);
    try {
      const prompt = `Analyze: "${word.term}" (${word.lang}). Respond in Traditional Chinese JSON:
      {
        "phonetic": "pronunciation",
        "pos": "part of speech",
        "example_original": "example sentence",
        "example_zh": "chinese translation",
        "synonyms": ["Word1 (中文1)", "Word2 (中文2)"],
        "tips": "memory tip"
      }`;
      const result = await fetchGemini(prompt, true);
      setExplanation(JSON.parse(result));
    } catch (err) {
      setErrorMsg("AI 解析失敗");
    } finally {
      setIsExplaining(false);
    }
  };

  const addWord = async (e) => {
    e.preventDefault();
    if (!newWord.term || !newWord.definition || !user) return;

    if (currentLangWords.some(w => w.term.toLowerCase() === newWord.term.toLowerCase())) {
      setDuplicateAlert(true);
      setTimeout(() => setDuplicateAlert(false), 2000);
      return;
    }

    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'vocab'), {
        term: newWord.term.trim(),
        definition: newWord.definition.trim(),
        lang: langMode,
        createdAt: Date.now(),
        stats: { mc: { correct: 0, total: 0, archived: false } }
      });
      setNewWord({ term: '', definition: '' });
    } catch (err) {
      setErrorMsg("新增單字失敗");
    }
  };

  const handleQuizAnswer = async (answer) => {
    if (quizFeedback || !quizWord || !user || isTransitioning.current) return;
    
    isTransitioning.current = true;
    const isCorrect = answer === quizWord.definition;
    const stats = quizWord.stats?.mc || { correct: 0, total: 0, archived: false };
    const newTotal = stats.total + 1;
    const newCorrect = isCorrect ? stats.correct + 1 : stats.correct;
    const shouldArchive = newCorrect >= 3 && (newCorrect / newTotal) >= 0.7;

    setQuizFeedback({ 
      status: isCorrect ? 'correct' : 'wrong', 
      isArchived: shouldArchive,
      term: quizWord.term,
      message: isCorrect ? (shouldArchive ? '🎯 完美擊殺！已收錄' : '✨ 命中！') : `❌ 遺漏了！正確是：${quizWord.definition}` 
    });

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id), { 
        "stats.mc": { total: newTotal, correct: newCorrect, archived: shouldArchive } 
      });
    } catch (e) {}
    
    setTimeout(() => {
        setQuizFeedback(null);
        if (activeTab === 'quiz') generateQuiz();
    }, 1500);
  };

  const generateQuiz = () => {
    const eligibleWords = currentLangWords.filter(w => !w.stats?.mc?.archived);
    if (currentLangWords.length < 3 || eligibleWords.length === 0) {
      setQuizWord(null);
      return;
    }

    const randomWord = eligibleWords[Math.floor(Math.random() * eligibleWords.length)];
    const otherOptions = currentLangWords
      .filter(w => w.id !== randomWord.id)
      .sort(() => 0.5 - Math.random())
      .slice(0, 3)
      .map(w => w.definition);
    
    setQuizWord(randomWord);
    setOptions([...otherOptions, randomWord.definition].sort(() => 0.5 - Math.random()));
    isTransitioning.current = false;
  };

  useEffect(() => { 
    if (activeTab === 'quiz' && !quizFeedback) generateQuiz(); 
  }, [activeTab, langMode, words.length]);

  const archivedCount = currentLangWords.filter(w => w.stats?.mc?.archived).length;
  const progress = currentLangWords.length > 0 ? (archivedCount / currentLangWords.length) * 100 : 0;

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-[#FDFCF8]">
      <div className="text-center">
        <Loader2 className="animate-spin text-[#2D4F1E] w-10 h-10 mx-auto mb-4" />
        <p className="font-black text-[#2D4F1E]">進入獵場中...</p>
      </div>
    </div>
  );

  if (!user) return (
    <div className="flex h-screen items-center justify-center bg-[#FDFCF8] p-6 text-stone-800">
      <div className="max-w-sm w-full bg-white p-8 rounded-[2.5rem] shadow-xl text-center border border-stone-100">
        <div className="w-16 h-16 bg-[#2D4F1E] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg">
          <Compass className="text-white w-8 h-8" />
        </div>
        <h1 className="text-2xl font-black mb-2">VocabHunter</h1>
        <p className="text-stone-400 text-sm mb-8">同步你的單字獵場</p>
        <div className="space-y-3">
          <button onClick={handleGoogleLogin} className="w-full py-4 bg-white border border-stone-200 text-stone-700 rounded-2xl font-black flex items-center justify-center gap-3 active:scale-95 transition-all">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            Google 登入
          </button>
          <button onClick={() => signInAnonymously(auth)} className="w-full py-4 bg-stone-50 text-stone-500 rounded-2xl font-bold text-sm active:scale-95 transition-all">
            訪客模式
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-stone-800 pb-28 font-sans">
      <header className="bg-white/80 backdrop-blur-lg border-b sticky top-0 z-40 px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center bg-[#2D4F1E] rounded-lg">
            <Compass className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-black text-[#2D4F1E]">VocabHunter</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-stone-100 p-1 rounded-lg flex border text-[10px] font-black">
            <button onClick={() => setLangMode('EN')} className={`px-3 py-1 rounded-md ${langMode === 'EN' ? 'bg-[#2D4F1E] text-white' : 'text-stone-400'}`}>EN</button>
            <button onClick={() => setLangMode('JP')} className={`px-3 py-1 rounded-md ${langMode === 'JP' ? 'bg-[#C2410C] text-white' : 'text-stone-400'}`}>JP</button>
          </div>
          <button onClick={handleSignOut} className="p-2 text-stone-400 hover:text-red-500 transition-all">
            <LogOut size={18}/>
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-6">
        <div className="flex bg-stone-200/50 p-1 rounded-xl mb-6 shadow-inner">
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-2.5 rounded-lg font-black text-xs transition-all flex items-center justify-center gap-2 ${activeTab === 'list' ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500'}`}>
            <BookOpen size={16} /> 單字庫
          </button>
          <button onClick={() => setActiveTab('quiz')} className={`flex-1 py-2.5 rounded-lg font-black text-xs transition-all flex items-center justify-center gap-2 ${activeTab === 'quiz' ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500'}`}>
            <Trophy size={16} /> 挑戰
          </button>
        </div>

        {activeTab === 'list' ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-5 rounded-2xl shadow-sm border border-stone-100 h-fit">
              <form onSubmit={addWord} className="space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text" 
                      placeholder="單字..." 
                      className={`w-full px-4 py-3 bg-stone-50 border-2 rounded-xl focus:bg-white focus:border-[#2D4F1E] outline-none font-bold text-sm transition-all ${duplicateAlert ? 'border-red-500' : 'border-transparent'}`} 
                      value={newWord.term} 
                      onChange={(e) => setNewWord({ ...newWord, term: e.target.value })} 
                    />
                    <button type="button" onClick={fetchTranslation} className="absolute right-3 top-3 text-[#2D4F1E]">
                      {isProcessing ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                    </button>
                  </div>
                  <input 
                    type="text" 
                    placeholder="翻譯..." 
                    className="w-full flex-1 px-4 py-3 bg-stone-50 border-2 border-transparent rounded-xl focus:bg-white focus:border-[#2D4F1E] outline-none font-bold text-sm transition-all" 
                    value={newWord.definition} 
                    onChange={(e) => setNewWord({ ...newWord, definition: e.target.value })} 
                  />
                </div>
                <button type="submit" disabled={!newWord.term || !newWord.definition} className="w-full py-3 rounded-xl font-black text-white bg-[#2D4F1E] flex items-center justify-center gap-2 shadow-md active:scale-95 disabled:opacity-30">
                  <Plus size={18} /> 收錄單字
                </button>
              </form>
            </div>

            <div className="space-y-3">
              {currentLangWords.length === 0 ? (
                <div className="text-center py-10 text-stone-300">
                  <BookOpen size={48} className="mx-auto mb-2 opacity-20" />
                  <p className="font-bold">尚無收錄單字</p>
                </div>
              ) : (
                currentLangWords.map(word => (
                  <div 
                    key={word.id} 
                    onClick={() => fetchExplanation(word)}
                    className={`bg-white p-4 rounded-xl border-2 transition-all active:scale-[0.98] cursor-pointer flex justify-between items-center ${selectedWord?.id === word.id ? 'border-[#2D4F1E] bg-[#2D4F1E]/5' : 'border-stone-100'}`}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black">{word.term}</span>
                        {word.stats?.mc?.archived && <Sparkles size={12} className="text-orange-500" />}
                      </div>
                      <p className="text-stone-400 text-sm font-medium">{word.definition}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); speak(word.term, word.lang); }} className="p-3 text-stone-300 hover:text-[#2D4F1E]"><Volume2 size={20}/></button>
                      <button onClick={(e) => { e.stopPropagation(); deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', word.id)); }} className="p-3 text-stone-200 hover:text-red-500"><Trash2 size={20}/></button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto py-4">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-xl border border-stone-100 text-center min-h-[440px] flex flex-col justify-center relative overflow-hidden">
              {quizFeedback && (
                <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-6 bg-white/95 backdrop-blur-md animate-in fade-in duration-300">
                  <div className={`p-6 rounded-full mb-6 ${quizFeedback.status === 'correct' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-700'}`}>
                    {quizFeedback.status === 'correct' ? <Target size={80} className="animate-bounce" /> : <XCircle size={80} />}
                  </div>
                  <h2 className={`text-3xl font-black mb-3 ${quizFeedback.status === 'correct' ? 'text-green-600' : 'text-red-700'}`}>{quizFeedback.status === 'correct' ? 'Bingo!' : 'Oops!'}</h2>
                  <p className={`text-base font-black px-6 py-3 rounded-2xl ${quizFeedback.status === 'correct' ? 'bg-green-500 text-white' : 'bg-stone-100 text-stone-600'}`}>{quizFeedback.message}</p>
                </div>
              )}
              {!quizWord ? (
                <div className="text-stone-300 font-black">
                   <Trophy size={48} className="mx-auto mb-4 opacity-20" />
                   獵物不足，請先收錄至少 3 個單字！
                </div>
              ) : (
                <>
                  <div className="flex justify-between items-start mb-6">
                    <span className="bg-stone-100 px-3 py-1 rounded-full text-[10px] font-black text-stone-400 uppercase tracking-widest">QUIZ</span>
                    <button onClick={() => speak(quizWord.term, quizWord.lang)} className="p-3 bg-stone-50 rounded-full border border-stone-100"><Volume2 size={24} className="text-[#2D4F1E]"/></button>
                  </div>
                  <h2 className="text-4xl font-black mb-10 text-stone-800 break-words">{quizWord.term}</h2>
                  <div className="grid gap-3">
                    {options.map((opt, i) => (
                      <button key={i} onClick={() => handleQuizAnswer(opt)} disabled={!!quizFeedback} className="py-4 px-6 bg-stone-50 border-2 border-stone-100 rounded-2xl font-bold text-sm text-stone-700 hover:border-[#2D4F1E]/30 transition-all">
                        {opt}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 解析 Modal */}
      {selectedWord && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-4">
          <div className="absolute inset-0 bg-stone-900/60 backdrop-blur-sm" onClick={() => setSelectedWord(null)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl overflow-hidden animate-in slide-in-from-bottom-full duration-300">
            <div className="bg-[#2D4F1E] p-8 text-white relative">
              <button onClick={() => setSelectedWord(null)} className="absolute right-6 top-6 p-2 bg-white/10 rounded-full"><X size={20}/></button>
              <div className="flex items-center gap-4 mb-2">
                <h2 className="text-3xl font-black">{selectedWord.term}</h2>
                <button onClick={() => speak(selectedWord.term, selectedWord.lang)} className="p-2 bg-white/20 rounded-lg"><Volume2 size={18}/></button>
              </div>
              <p className="text-white/80 font-bold text-lg">{selectedWord.definition}</p>
            </div>
            
            <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto">
              {isExplaining ? (
                <div className="flex flex-col items-center justify-center py-10 gap-4 text-stone-400 font-bold">
                  <Loader2 size={32} className="animate-spin text-[#2D4F1E]" /> 
                  <p>AI 獵人正在解析獵物...</p>
                </div>
              ) : explanation ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                      <p className="text-[10px] font-black text-stone-300 uppercase mb-1">詞性</p>
                      <p className="font-bold text-stone-600">{explanation.pos || 'N/A'}</p>
                    </div>
                    <div className="bg-stone-50 p-3 rounded-xl border border-stone-100">
                      <p className="text-[10px] font-black text-stone-300 uppercase mb-1">讀音</p>
                      <p className="font-bold text-stone-600">{explanation.phonetic || 'N/A'}</p>
                    </div>
                  </div>

                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen size={16} className="text-[#2D4F1E]" />
                      <h4 className="text-xs font-black text-stone-800 uppercase tracking-wider">實戰例句</h4>
                    </div>
                    <div className="bg-stone-50 p-5 rounded-2xl border-l-4 border-[#2D4F1E]">
                      <p className="font-bold text-stone-800 mb-2 italic">"{explanation.example_original}"</p>
                      <p className="text-stone-500 text-sm font-medium">{explanation.example_zh}</p>
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <Layers size={16} className="text-[#C2410C]" />
                      <h4 className="text-xs font-black text-stone-800 uppercase tracking-wider">近義字</h4>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {explanation.synonyms?.map((s, i) => (
                        <span key={i} className="px-3 py-1.5 bg-orange-50 text-[#C2410C] rounded-lg border border-orange-100 text-xs font-black">
                          {s}
                        </span>
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={16} className="text-amber-500" />
                      <h4 className="text-xs font-black text-stone-800 uppercase tracking-wider">狩獵筆記</h4>
                    </div>
                    <p className="text-sm font-bold text-amber-900 leading-relaxed bg-amber-50 p-4 rounded-2xl border border-amber-100">
                      {explanation.tips}
                    </p>
                  </section>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* 底部進度條 */}
      <div className="fixed bottom-0 left-0 right-0 p-4 z-40 bg-gradient-to-t from-[#FDFCF8] to-transparent">
        <div className="max-w-2xl mx-auto bg-white/90 backdrop-blur-xl border border-stone-100 p-3 rounded-2xl shadow-xl flex items-center gap-4">
          <div className="flex flex-col items-center min-w-[50px]">
            <span className="text-[8px] font-black text-stone-300">PROGRESS</span>
            <span className="text-sm font-black text-[#2D4F1E]">{archivedCount}/{currentLangWords.length}</span>
          </div>
          <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full bg-[#2D4F1E] transition-all duration-700" style={{ width: `${progress}%` }}></div>
          </div>
          <span className="text-lg font-black text-[#2D4F1E]">{Math.round(progress)}%</span>
        </div>
      </div>

      {errorMsg && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-stone-800 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3">
          <AlertCircle size={20} className="text-orange-400" />
          <span className="font-black text-sm">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="ml-2"><X size={14}/></button>
        </div>
      )}
    </div>
  );
};

export default App;
