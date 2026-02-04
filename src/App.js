import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithCustomToken,
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  updateDoc, 
  onSnapshot, 
  addDoc,
  deleteDoc
} from 'firebase/firestore';
import { 
  Volume2, 
  Trash2, 
  CheckCircle2, 
  XCircle, 
  Compass, 
  Trophy, 
  Search, 
  LogOut, 
  ShieldCheck, 
  BarChart3, 
  Loader2, 
  Medal,
  ThumbsUp,
  AlertCircle,
  PlusCircle,
  Leaf
} from 'lucide-react';

// ========================================================
// 🛠️ Firebase 配置區塊
// ========================================================
const localFirebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: "vocabularyh-4c909.firebaseapp.com",
  projectId: "vocabularyh-4c909",
  storageBucket: "vocabularyh-4c909.firebasestorage.app",
  messagingSenderId: "924954723346",
  appId: "1:924954723346:web:cc792c2fdd317fb96684cb",
  measurementId: "G-C7KZ6SPTVC"
};

const getFirebaseConfig = () => {
  try {
    if (typeof __firebase_config !== 'undefined') {
      return JSON.parse(__firebase_config);
    }
  } catch (e) {
    console.warn("環境變數解析失敗，切換至本地配置");
  }
  return localFirebaseConfig;
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const appId = typeof __app_id !== 'undefined' ? __app_id : 'multilang-vocab-master';

const App = () => {
  const [user, setUser] = useState(null);
  const [words, setWords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('list');
  const [langMode, setLangMode] = useState('EN'); 
  const [newWord, setNewWord] = useState({ term: '', definition: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  const [quizWord, setQuizWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [quizFeedback, setQuizFeedback] = useState(null); 
  const [fillInput, setFillInput] = useState('');
  
  const isTransitioning = useRef(false);
  const nextQuizTimeout = useRef(null);

  // 專業配色定義 (Tailwind Classes)
  const colors = {
    primary: "bg-[#2D4F1E]", // 深森林綠
    primaryHover: "hover:bg-[#3D662A]",
    accent: "text-[#2D4F1E]",
    bg: "bg-[#FDFCF8]", // 米白大地色
    card: "bg-white",
    border: "border-[#E5E1D8]"
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        }
      } catch (err) {
        console.error("Auth Init Error:", err);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setWords([]);
      return;
    }
    const wordsRef = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
    const unsubscribe = onSnapshot(wordsRef, (snapshot) => {
      const wordList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setWords(wordList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    }, (err) => {
      console.error("Firestore Error:", err);
      setErrorMsg("同步失敗：權限不足或路徑錯誤。");
    });
    return () => unsubscribe();
  }, [user]);

  const totalCount = words.length;
  const archivedCount = words.filter(w => w.stats?.mc?.archived && w.stats?.fill?.archived).length;
  const archivePercentage = totalCount > 0 ? (archivedCount / totalCount) * 100 : 0;

  const speak = (text, lang) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'JP' ? 'ja-JP' : 'en-US';
    utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  };

  const fetchTranslation = async () => {
    if (!newWord.term) return;
    setIsProcessing(true);
    const apiKey = process.env.REACT_APP_GEMINI_KEY;
    try {
      const translatePrompt = `將${langMode === 'EN' ? '英文' : '日文'}單字 "${newWord.term}" 翻譯成繁體中文，給出最簡短的一個意思。`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: translatePrompt }] }] })
      });
      const data = await res.json();
      const definition = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      setNewWord(prev => ({ ...prev, definition }));
    } catch (err) {
      setErrorMsg("翻譯獲取失敗。");
    } finally {
      setIsProcessing(false);
    }
  };

  const addWord = async (e) => {
    e.preventDefault();
    if (!newWord.term || !newWord.definition || !user) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'vocab'), {
        term: newWord.term.trim(),
        definition: newWord.definition.trim(),
        lang: langMode,
        createdAt: Date.now(),
        stats: { 
          mc: { correct: 0, total: 0, archived: false }, 
          fill: { correct: 0, total: 0, archived: false } 
        }
      });
      setNewWord({ term: '', definition: '' });
    } catch (err) { setErrorMsg("儲存失敗。"); }
  };

  const isMatch = (input, target) => {
    if (!input || !target) return false;
    const clean = (s) => s.toLowerCase().replace(/[.,!?;:\s、。，！？；：（）()/\-\[\]]/g, '').trim();
    const cleanInput = clean(input);
    const parts = target.split(/[、/；;]/).map(p => clean(p)).filter(p => p !== '');
    return parts.some(p => p === cleanInput);
  };

  const generateQuiz = (type, currentWords = words) => {
    const quizType = type.split('-')[1];
    const eligibleForCurrentMode = currentWords.filter(w => !w.stats?.[quizType]?.archived && w.lang === langMode);

    if (quizType === 'mc' && currentWords.filter(w => w.lang === langMode).length < 3) {
      setQuizWord(null);
      setQuizFeedback(null);
      return;
    }

    if (eligibleForCurrentMode.length === 0) {
      setQuizWord(null);
      setQuizFeedback(null); 
      return;
    }

    const randomWord = eligibleForCurrentMode[Math.floor(Math.random() * eligibleForCurrentMode.length)];
    setQuizWord(randomWord);
    setQuizFeedback(null);
    setFillInput('');

    if (quizType === 'mc') {
      const otherWords = currentWords.filter(w => w.id !== randomWord.id && w.lang === langMode);
      const shuffledOthers = otherWords.sort(() => 0.5 - Math.random()).slice(0, 3);
      const optionsSet = [...shuffledOthers.map(w => w.definition), randomWord.definition];
      setOptions(optionsSet.sort(() => 0.5 - Math.random()));
    }
    isTransitioning.current = false;
  };

  const handleQuizAnswer = async (type, answer) => {
    if (quizFeedback || !quizWord || !user || isTransitioning.current) return;
    
    isTransitioning.current = true;
    const isCorrect = isMatch(answer, quizWord.definition);
    const currentStats = quizWord.stats[type];
    
    const newCountTotal = (currentStats?.total || 0) + 1;
    const newCountCorrect = isCorrect ? (currentStats?.correct || 0) + 1 : (currentStats?.correct || 0);
    const accuracy = newCountCorrect / newCountTotal;
    const shouldArchive = newCountCorrect >= 5 && accuracy > 0.7;

    const updatedStats = { ...quizWord.stats };
    updatedStats[type] = { 
      total: newCountTotal, 
      correct: newCountCorrect, 
      archived: shouldArchive 
    };

    setQuizFeedback({ 
      status: isCorrect ? 'correct' : 'wrong', 
      isArchived: shouldArchive,
      term: quizWord.term,
      type: type, 
      message: isCorrect ? (shouldArchive ? '探險成功！單字已收錄' : '答對了！') : `正確答案：${quizWord.definition}` 
    });

    const wordRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id);
    updateDoc(wordRef, { stats: updatedStats }).catch(err => console.error("Firebase Update Error", err));

    const updatedWords = words.map(w => w.id === quizWord.id ? { ...w, stats: updatedStats } : w);
    setWords(updatedWords);

    if (nextQuizTimeout.current) clearTimeout(nextQuizTimeout.current);
    nextQuizTimeout.current = setTimeout(() => {
      generateQuiz(`quiz-${type}`, updatedWords);
    }, shouldArchive ? 2000 : 1000);
  };

  const handleOverrideCorrect = async () => {
    if (!quizFeedback || quizFeedback.status !== 'wrong' || !quizWord || !user) return;
    if (nextQuizTimeout.current) clearTimeout(nextQuizTimeout.current);
    
    const type = quizFeedback.type;
    const currentStats = quizWord.stats[type];
    const correctedCountCorrect = currentStats.correct + 1;
    const accuracy = correctedCountCorrect / currentStats.total;
    const shouldArchive = correctedCountCorrect >= 5 && accuracy > 0.7;

    const updatedStats = { ...quizWord.stats };
    updatedStats[type] = { 
      total: currentStats.total, 
      correct: correctedCountCorrect, 
      archived: shouldArchive 
    };

    setQuizFeedback({
      ...quizFeedback,
      status: 'correct',
      isArchived: shouldArchive,
      message: shouldArchive ? '手動覆核：完美收錄！' : '手動覆核：已改為正確！'
    });

    const wordRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id);
    await updateDoc(wordRef, { stats: updatedStats });

    const updatedWords = words.map(w => w.id === quizWord.id ? { ...w, stats: updatedStats } : w);
    setWords(updatedWords);

    nextQuizTimeout.current = setTimeout(() => {
      generateQuiz(`quiz-${type}`, updatedWords);
    }, shouldArchive ? 2000 : 1000);
  };

  useEffect(() => {
    if (activeTab.includes('quiz')) {
      generateQuiz(activeTab);
    }
  }, [activeTab, langMode]);

  const currentLangWordsCount = words.filter(w => w.lang === langMode).length;

  // --- Logo 元件 ---
  const Logo = () => (
    <div className="flex items-center gap-3">
      <div className="relative w-10 h-10 flex items-center justify-center bg-[#2D4F1E] rounded-xl shadow-lg rotate-3">
        <Compass className="text-white w-6 h-6" />
        <Leaf className="absolute -top-1 -right-1 text-lime-400 w-4 h-4" />
      </div>
      <span className="text-2xl tracking-tighter font-black text-[#2D4F1E]">VocabularyHunter</span>
    </div>
  );

  if (loading) return <div className={`flex h-screen items-center justify-center ${colors.bg} ${colors.accent} font-bold tracking-widest animate-pulse`}>系統啟動中...</div>;

  if (!user) return (
    <div className={`flex h-screen items-center justify-center ${colors.bg} p-6`}>
      <div className="max-w-md w-full bg-white p-10 rounded-[40px] shadow-2xl text-center border">
        <div className="mb-10 flex justify-center scale-110">
          <Logo />
        </div>
        <h1 className="text-xl font-bold mb-4 text-[#2D4F1E]">智慧單字探險家</h1>
        <p className="text-stone-400 mb-10 font-medium italic">尋找知識的足跡</p>
        <button onClick={() => signInWithPopup(auth, provider)} className={`w-full ${colors.primary} ${colors.primaryHover} text-white py-5 rounded-2xl font-bold transition-all shadow-lg active:scale-95`}>
          開始探險之旅 (Google 登入)
        </button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${colors.bg} text-stone-800 pb-32 font-sans relative`}>
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-30 px-6 h-20 flex items-center justify-between shadow-sm">
        <Logo />
        <div className="flex items-center gap-4">
          <div className="bg-stone-100 p-1 rounded-xl flex border">
            <button onClick={() => setLangMode('EN')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${langMode === 'EN' ? 'bg-[#2D4F1E] text-white shadow-sm' : 'text-stone-400'}`}>EN</button>
            <button onClick={() => setLangMode('JP')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${langMode === 'JP' ? 'bg-orange-800 text-white shadow-sm' : 'text-stone-400'}`}>JP</button>
          </div>
          <button onClick={() => signOut(auth)} className="p-2 text-stone-300 hover:text-red-700 transition-colors"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex bg-[#E5E1D8] p-1 rounded-2xl shadow-inner border mb-8 overflow-hidden">
          {['list', 'quiz-mc', 'quiz-fill'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === tab ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
              {tab === 'list' ? '獵場單字庫' : tab === 'quiz-mc' ? '選擇挑戰' : '填空挑戰'}
            </button>
          ))}
        </div>

        {activeTab === 'list' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-stone-100">
              <form onSubmit={addWord} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <input type="text" placeholder="輸入新的獵物 (單字)..." className="w-full px-5 py-4 bg-stone-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-[#2D4F1E] outline-none font-bold transition-all placeholder:text-stone-300" value={newWord.term} onChange={(e) => setNewWord({ ...newWord, term: e.target.value })} />
                    <button type="button" onClick={fetchTranslation} className="absolute right-4 top-4 text-[#2D4F1E] hover:scale-110 transition-transform">
                      {isProcessing ? <Loader2 className="animate-spin" /> : <Search />}
                    </button>
                  </div>
                  <input type="text" placeholder="翻譯結果" className="w-full px-5 py-4 bg-stone-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-[#2D4F1E] outline-none font-medium transition-all" value={newWord.definition} onChange={(e) => setNewWord({ ...newWord, definition: e.target.value })} />
                </div>
                <button type="submit" className={`w-full py-4 rounded-2xl font-black text-white transition-all active:scale-[0.98] shadow-lg ${colors.primary} ${colors.primaryHover}`}>收錄到皮箱</button>
              </form>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {words.filter(w => w.lang === langMode).map(word => {
                const isAllArchived = word.stats?.mc?.archived && word.stats?.fill?.archived;
                return (
                  <div key={word.id} className={`bg-white p-5 rounded-3xl border-b-4 border-stone-200 flex justify-between items-center transition-all ${isAllArchived ? 'opacity-40 grayscale bg-stone-50 border-transparent' : 'shadow-sm hover:translate-y-[-2px] hover:shadow-md'}`}>
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black truncate text-stone-800">{word.term}</span>
                        <button onClick={() => speak(word.term, word.lang)} className="text-stone-300 hover:text-[#2D4F1E] transition-colors"><Volume2 size={16}/></button>
                      </div>
                      <p className="text-stone-500 font-medium">{word.definition}</p>
                      
                      {/* 修改點 1：隱藏數字，改為狀態標籤 */}
                      <div className="flex gap-2 mt-2">
                        {word.stats?.mc?.archived && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700 flex items-center gap-1">
                            <CheckCircle2 size={10} /> 選擇挑戰已通過
                          </span>
                        )}
                        {word.stats?.fill?.archived && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-100 text-amber-700 flex items-center gap-1">
                            <CheckCircle2 size={10} /> 填空挑戰已通過
                          </span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => { if(window.confirm('確定要放走此單字嗎？')) deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', word.id)) }} className="text-stone-200 hover:text-red-800 transition-colors"><Trash2 size={20}/></button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto bg-white p-10 rounded-[40px] shadow-2xl border-2 border-stone-100 text-center min-h-[520px] flex flex-col justify-center relative overflow-hidden">
            
            {quizFeedback && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-8 bg-white/95 backdrop-blur-xl rounded-[40px] animate-in fade-in zoom-in duration-200">
                {quizFeedback.isArchived ? (
                  <div className="text-center">
                    <Medal size={120} className="text-[#2D4F1E] mx-auto mb-6 drop-shadow-md animate-bounce" />
                    <h2 className="text-3xl font-black mb-2 text-stone-800">狩獵成功！</h2>
                    <p className="text-[#2D4F1E] font-bold text-2xl mb-4">"{quizFeedback.term}"</p>
                    <p className="text-stone-400 font-medium tracking-wide">此單字已完全進入你的獵人皮箱</p>
                  </div>
                ) : (
                  <div className="text-center w-full px-4">
                    {quizFeedback.status === 'correct' ? (
                      <CheckCircle2 size={140} className="text-green-600 mx-auto mb-6" />
                    ) : (
                      <XCircle size={140} className="text-red-900 mx-auto mb-6 opacity-80" />
                    )}
                    <h2 className={`text-4xl font-black mb-4 ${quizFeedback.status === 'correct' ? 'text-green-700' : 'text-red-900'}`}>
                      {quizFeedback.status === 'correct' ? '命中目標！' : '擦肩而過...'}
                    </h2>
                    <p className="text-stone-600 text-xl font-bold mb-8 leading-relaxed">{quizFeedback.message}</p>
                    
                    {quizFeedback.status === 'wrong' && quizFeedback.type === 'fill' && (
                      <button 
                        onClick={handleOverrideCorrect}
                        className="flex items-center gap-3 mx-auto px-6 py-3 bg-stone-100 hover:bg-[#2D4F1E] hover:text-white text-stone-600 rounded-full font-bold transition-all group border border-stone-200"
                      >
                        <ThumbsUp size={18} className="group-hover:scale-125 transition-transform" />
                        這也是正確路徑 (覆核)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'quiz-mc' && currentLangWordsCount < 3 ? (
               <div className="py-8 flex flex-col items-center animate-in zoom-in duration-300">
                 <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mb-6 border">
                   <AlertCircle size={40} className="text-stone-300" />
                 </div>
                 <h3 className="text-2xl font-black text-stone-800 mb-4">獵物不足</h3>
                 <p className="text-stone-500 leading-relaxed px-4">
                   你需要至少 <span className="text-[#2D4F1E] font-bold">3</span> 個單字才能開始挑戰。<br/>
                   目前這片領地只有 <span className="font-bold">{currentLangWordsCount}</span> 個。
                 </p>
                 <div className="mt-10 flex flex-col gap-3 w-full">
                   <button onClick={() => setActiveTab('list')} className={`flex items-center justify-center gap-2 ${colors.primary} text-white py-4 rounded-2xl font-bold shadow-lg ${colors.primaryHover} transition-all`}>
                     <PlusCircle size={20}/> 去尋找更多獵物
                   </button>
                 </div>
               </div>
            ) : !quizWord ? (
              <div className="py-12 flex flex-col items-center">
                <Trophy size={64} className="text-[#2D4F1E] mb-6" />
                <h3 className="text-2xl font-black text-stone-800">這片領地已被征服</h3>
                <p className="text-stone-400 mt-2 italic">所有的單字都已完成訓練</p>
                <button onClick={() => setActiveTab('list')} className={`mt-10 ${colors.primary} text-white px-10 py-4 rounded-2xl font-bold shadow-lg ${colors.primaryHover} transition-all`}>前往新領地 (新增單字)</button>
              </div>
            ) : (
              <div className="animate-in fade-in duration-300">
                <div className="mb-10">
                   <button onClick={() => speak(quizWord.term, quizWord.lang)} className="p-6 bg-stone-50 text-[#2D4F1E] rounded-full hover:scale-110 active:scale-95 transition-all shadow-inner border border-stone-200"><Volume2 size={48}/></button>
                </div>
                <h2 className="text-5xl font-black mb-14 text-stone-800 tracking-tight break-words">{quizWord.term}</h2>
                {activeTab === 'quiz-mc' ? (
                  <div className="grid gap-4">
                    {options.map((opt, i) => (
                      <button key={i} onClick={() => handleQuizAnswer('mc', opt)} className="py-5 px-6 bg-stone-50 border-2 border-stone-200 rounded-2xl font-bold text-stone-700 hover:border-[#2D4F1E] hover:bg-white hover:shadow-md transition-all text-lg">{opt}</button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <input 
                      type="text" 
                      placeholder="輸入答案..." 
                      className="w-full py-5 text-center border-b-4 border-stone-200 text-3xl font-black focus:border-[#2D4F1E] outline-none bg-transparent transition-all placeholder:text-stone-200" 
                      value={fillInput} 
                      onChange={e => setFillInput(e.target.value)} 
                      onKeyDown={e => e.key === 'Enter' && handleQuizAnswer('fill', fillInput)} 
                      autoFocus 
                    />
                    <button onClick={() => handleQuizAnswer('fill', fillInput)} className={`w-full py-4 ${colors.primary} text-white rounded-2xl font-black text-xl shadow-lg ${colors.primaryHover} active:scale-95 transition-all`}>確認追蹤</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-10 left-0 right-0 px-6 z-20 pointer-events-none">
        <div className="max-w-4xl mx-auto bg-white/95 backdrop-blur-md border border-stone-200 p-5 rounded-[30px] shadow-2xl flex items-center justify-between gap-6 pointer-events-auto">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-stone-100 rounded-xl text-[#2D4F1E] border"><Compass size={20} /></div>
            <span className="font-black text-stone-700 hidden sm:inline">探險進度：{archivedCount} / {totalCount}</span>
            <span className="font-black text-stone-700 sm:hidden">{archivedCount}/{totalCount}</span>
          </div>
          <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden shadow-inner border border-stone-200">
            <div className="h-full bg-gradient-to-r from-[#2D4F1E] to-[#4A7238] transition-all duration-1000" style={{ width: `${archivePercentage}%` }}></div>
          </div>
          <span className="text-2xl font-black text-[#2D4F1E] tabular-nums">{Math.round(archivePercentage)}%</span>
        </div>
      </div>
    </div>
  );
};

export default App;
