import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithCustomToken,
  signInAnonymously,
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
  Brain, 
  Trophy, 
  Search, 
  LogOut, 
  ShieldCheck, 
  BarChart3, 
  Loader2, 
  Medal,
  ThumbsUp,
  AlertCircle,
  PlusCircle
} from 'lucide-react';

const firebaseConfig = JSON.parse(__firebase_config);
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

  // 測驗狀態
  const [quizWord, setQuizWord] = useState(null);
  const [options, setOptions] = useState([]);
  const [quizFeedback, setQuizFeedback] = useState(null); 
  const [fillInput, setFillInput] = useState('');
  
  // 防止連擊鎖與定時器參考
  const isTransitioning = useRef(false);
  const nextQuizTimeout = useRef(null);

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
    }, () => {
      setErrorMsg("同步失敗：權限不足。");
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
    const apiKey = ""; 
    try {
      const translatePrompt = `將${langMode === 'EN' ? '英文' : '日文'}單字 "${newWord.term}" 翻譯成繁體中文，給出最簡短的一個意思。`;
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
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

    // 【修改點】將門檻從 4 改為 3。至少需要 3 個單字來生成選項 (1 正確, 2 錯誤)
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
      // 隨機取最多 3 個當作錯誤選項
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
      message: isCorrect ? (shouldArchive ? '完美封存！' : '答對了！') : `正確答案：${quizWord.definition}` 
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
      message: shouldArchive ? '手動覆核：完美封存！' : '手動覆核：已改為正確！'
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

  if (loading) return <div className="flex h-screen items-center justify-center bg-white text-blue-600 font-bold tracking-widest animate-pulse">系統載入中...</div>;

  if (!user) return (
    <div className="flex h-screen items-center justify-center bg-slate-50 p-6">
      <div className="max-w-md w-full bg-white p-10 rounded-[40px] shadow-2xl text-center border">
        <div className="w-20 h-20 bg-blue-50 rounded-3xl flex items-center justify-center mx-auto mb-8">
          <ShieldCheck size={40} className="text-blue-500" />
        </div>
        <h1 className="text-3xl font-black mb-4 text-slate-800">智學單字系統</h1>
        <p className="text-slate-400 mb-10 font-medium">請登入以同步您的個人單字庫</p>
        <button onClick={() => signInWithPopup(auth, provider)} className="w-full bg-slate-900 hover:bg-black text-white py-5 rounded-2xl font-bold transition-all shadow-lg active:scale-95">
          使用 Google 帳號登入
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 pb-32 font-sans relative">
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-30 px-6 h-16 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2 font-bold text-blue-600">
          <Brain size={24} />
          <span className="text-xl tracking-tight font-black">智學單字 4.2</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 p-1 rounded-xl flex border">
            <button onClick={() => setLangMode('EN')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${langMode === 'EN' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>EN</button>
            <button onClick={() => setLangMode('JP')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${langMode === 'JP' ? 'bg-white text-red-600 shadow-sm' : 'text-slate-400'}`}>JP</button>
          </div>
          <button onClick={() => signOut(auth)} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border mb-8 overflow-hidden">
          {['list', 'quiz-mc', 'quiz-fill'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === tab ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>
              {tab === 'list' ? '單字清單' : tab === 'quiz-mc' ? '選擇題' : '填空題'}
            </button>
          ))}
        </div>

        {activeTab === 'list' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white p-6 rounded-3xl shadow-sm border">
              <form onSubmit={addWord} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <input type="text" placeholder="輸入單字..." className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500 outline-none font-bold transition-all" value={newWord.term} onChange={(e) => setNewWord({ ...newWord, term: e.target.value })} />
                    <button type="button" onClick={fetchTranslation} className="absolute right-4 top-4 text-blue-500 hover:scale-110 transition-transform">
                      {isProcessing ? <Loader2 className="animate-spin" /> : <Search />}
                    </button>
                  </div>
                  <input type="text" placeholder="中文翻譯" className="w-full px-5 py-4 bg-slate-50 border-2 border-transparent rounded-2xl focus:bg-white focus:border-blue-500 outline-none font-medium transition-all" value={newWord.definition} onChange={(e) => setNewWord({ ...newWord, definition: e.target.value })} />
                </div>
                <button type="submit" className={`w-full py-4 rounded-2xl font-black text-white transition-all active:scale-[0.98] shadow-lg ${langMode === 'EN' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-500 hover:bg-red-600'}`}>新增單字</button>
              </form>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {words.filter(w => w.lang === langMode).map(word => {
                const isAllArchived = word.stats?.mc?.archived && word.stats?.fill?.archived;
                return (
                  <div key={word.id} className={`bg-white p-5 rounded-3xl border flex justify-between items-center transition-all ${isAllArchived ? 'opacity-30 grayscale bg-slate-50' : 'shadow-sm hover:shadow-md'}`}>
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black truncate text-slate-800">{word.term}</span>
                        <button onClick={() => speak(word.term, word.lang)} className="text-slate-300 hover:text-blue-500 transition-colors"><Volume2 size={16}/></button>
                      </div>
                      <p className="text-slate-500 font-medium">{word.definition}</p>
                      <div className="flex gap-2 mt-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${word.stats?.mc?.archived ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>選擇 {word.stats?.mc?.correct || 0}/5</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${word.stats?.fill?.archived ? 'bg-green-100 text-green-600' : 'bg-slate-100 text-slate-400'}`}>填空 {word.stats?.fill?.correct || 0}/5</span>
                      </div>
                    </div>
                    <button onClick={() => { if(window.confirm('確定要刪除此單字嗎？')) deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', word.id)) }} className="text-slate-200 hover:text-red-400 transition-colors"><Trash2 size={20}/></button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto bg-white p-10 rounded-[40px] shadow-2xl border text-center min-h-[520px] flex flex-col justify-center relative overflow-hidden">
            
            {quizFeedback && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-8 bg-white/95 backdrop-blur-xl rounded-[40px] animate-in fade-in zoom-in duration-200">
                {quizFeedback.isArchived ? (
                  <div className="text-center">
                    <Medal size={120} className="text-yellow-400 mx-auto mb-6 drop-shadow-md animate-bounce" />
                    <h2 className="text-3xl font-black mb-2 text-slate-800">單字已封存！</h2>
                    <p className="text-blue-600 font-bold text-2xl mb-4">"{quizFeedback.term}"</p>
                    <p className="text-slate-400 font-medium tracking-wide">恭喜！你已完全掌握此單字</p>
                  </div>
                ) : (
                  <div className="text-center w-full px-4">
                    {quizFeedback.status === 'correct' ? (
                      <CheckCircle2 size={140} className="text-green-500 mx-auto mb-6" />
                    ) : (
                      <XCircle size={140} className="text-red-500 mx-auto mb-6 animate-pulse" />
                    )}
                    <h2 className={`text-4xl font-black mb-4 ${quizFeedback.status === 'correct' ? 'text-green-600' : 'text-red-600'}`}>
                      {quizFeedback.status === 'correct' ? '答對了！' : '答錯了！'}
                    </h2>
                    <p className="text-slate-600 text-xl font-bold mb-8 leading-relaxed">{quizFeedback.message}</p>
                    
                    {quizFeedback.status === 'wrong' && quizFeedback.type === 'fill' && (
                      <button 
                        onClick={handleOverrideCorrect}
                        className="flex items-center gap-3 mx-auto px-6 py-3 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 rounded-full font-bold transition-all group border border-slate-200"
                      >
                        <ThumbsUp size={18} className="group-hover:scale-125 transition-transform" />
                        這也算對 (手動核准)
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 【防呆機制】修改門檻為 3 */}
            {activeTab === 'quiz-mc' && currentLangWordsCount < 3 ? (
               <div className="py-8 flex flex-col items-center animate-in zoom-in duration-300">
                 <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mb-6">
                   <AlertCircle size={40} className="text-amber-500" />
                 </div>
                 <h3 className="text-2xl font-black text-slate-800 mb-4">單字量不足</h3>
                 <p className="text-slate-500 leading-relaxed px-4">
                   選擇題需要至少 <span className="text-blue-600 font-bold">3</span> 個單字才能開始測驗。<br/>
                   目前該語言僅有 <span className="font-bold">{currentLangWordsCount}</span> 個單字。
                 </p>
                 <div className="mt-10 flex flex-col gap-3 w-full">
                   <button onClick={() => setActiveTab('list')} className="flex items-center justify-center gap-2 bg-blue-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition-all">
                     <PlusCircle size={20}/> 前往新增單字
                   </button>
                   <button onClick={() => setActiveTab('quiz-fill')} className="text-slate-400 font-bold py-2 hover:text-slate-600 transition-all">
                     先練習填空題 →
                   </button>
                 </div>
               </div>
            ) : !quizWord ? (
              <div className="py-12 flex flex-col items-center">
                <Trophy size={64} className="text-yellow-400 mb-6" />
                <h3 className="text-2xl font-black text-slate-800">目前已無待練習單字</h3>
                <p className="text-slate-400 mt-2">太棒了！所有的單字都已掌握</p>
                <button onClick={() => setActiveTab('list')} className="mt-10 bg-blue-600 text-white px-10 py-4 rounded-2xl font-bold shadow-lg hover:bg-blue-700 transition-all">新增更多單字</button>
              </div>
            ) : (
              <div className="animate-in fade-in duration-300">
                <div className="mb-10">
                   <button onClick={() => speak(quizWord.term, quizWord.lang)} className="p-6 bg-blue-50 text-blue-600 rounded-full hover:scale-110 active:scale-95 transition-all shadow-inner border border-blue-100/50"><Volume2 size={48}/></button>
                </div>
                <h2 className="text-5xl font-black mb-14 text-slate-800 tracking-tight break-words">{quizWord.term}</h2>
                {activeTab === 'quiz-mc' ? (
                  <div className="grid gap-4">
                    {options.map((opt, i) => (
                      <button key={i} onClick={() => handleQuizAnswer('mc', opt)} className="py-5 px-6 bg-slate-50 border-2 border-transparent rounded-2xl font-bold text-slate-700 hover:border-blue-500 hover:bg-white hover:shadow-md transition-all text-lg">{opt}</button>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-6">
                    <input 
                      type="text" 
                      placeholder="請輸入中文翻譯..." 
                      className="w-full py-5 text-center border-b-4 border-slate-100 text-3xl font-black focus:border-blue-500 outline-none bg-transparent transition-all" 
                      value={fillInput} 
                      onChange={e => setFillInput(e.target.value)} 
                      onKeyDown={e => e.key === 'Enter' && handleQuizAnswer('fill', fillInput)} 
                      autoFocus 
                    />
                    <button onClick={() => handleQuizAnswer('fill', fillInput)} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-xl shadow-lg hover:bg-blue-700 active:scale-95 transition-all">送出答案</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-10 left-0 right-0 px-6 z-20 pointer-events-none">
        <div className="max-w-4xl mx-auto bg-white/90 backdrop-blur-md border border-slate-200 p-5 rounded-[30px] shadow-2xl flex items-center justify-between gap-6 pointer-events-auto">
          <div className="flex items-center gap-4">
            <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><BarChart3 size={20} /></div>
            <span className="font-black text-slate-700 hidden sm:inline">掌握進度：{archivedCount} / {totalCount}</span>
            <span className="font-black text-slate-700 sm:hidden">{archivedCount}/{totalCount}</span>
          </div>
          <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner border border-slate-50">
            <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-1000" style={{ width: `${archivePercentage}%` }}></div>
          </div>
          <span className="text-2xl font-black text-blue-600 tabular-nums">{Math.round(archivePercentage)}%</span>
        </div>
      </div>
    </div>
  );
};

export default App;
