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
  Loader2, 
  Medal,
  AlertCircle,
  Leaf
} from 'lucide-react';

// ========================================================
// 🛠️ Firebase 配置區塊
// ========================================================
const getEnv = (key) => {
  try {
    if (typeof window !== 'undefined' && window[key]) return window[key];
    if (typeof process !== 'undefined' && process.env && process.env[key]) return process.env[key];
  } catch (e) {}
  return "";
};

const localFirebaseConfig = {
  apiKey: getEnv('REACT_APP_FIREBASE_API_KEY'),
  authDomain: "vocabularyh-4c909.firebaseapp.com",
  projectId: "vocabularyh-4c909",
  storageBucket: "vocabularyh-4c909.firebasestorage.app",
  messagingSenderId: "924954723346",
  appId: "1:924954723346:web:cc792c2fdd317fb96684cb",
  measurementId: "G-C7KZ6SPTVC"
};

const getFirebaseConfig = () => {
  try {
    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
      return JSON.parse(__firebase_config);
    }
  } catch (e) {}
  return localFirebaseConfig;
};

const firebaseConfig = getFirebaseConfig();
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const appId = typeof __app_id !== 'undefined' ? __app_id : 'vocabularyh-4c909';

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
  
  const isTransitioning = useRef(false);
  const nextQuizTimeout = useRef(null);

  const colors = {
    primary: "bg-[#2D4F1E]", 
    primaryHover: "hover:bg-[#3D662A]",
    accent: "text-[#2D4F1E]",
    bg: "bg-[#FDFCF8]"
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
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => setUser(currentUser));
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
    });
    return () => unsubscribe();
  }, [user]);

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
    setErrorMsg(null);
    const apiKey = ""; // API Key 會由系統注入
    const model = "gemini-2.5-flash-preview-09-2025";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    try {
      const translatePrompt = `將${langMode === 'EN' ? '英文' : '日文'}單字 "${newWord.term}" 翻譯成繁體中文，僅提供最簡短的一個意思。`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: translatePrompt }] }] })
      });
      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      setNewWord(prev => ({ ...prev, definition: text }));
    } catch (err) {
      setErrorMsg("翻譯功能暫時無法使用。");
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
        stats: { mc: { correct: 0, total: 0, archived: false } }
      });
      setNewWord({ term: '', definition: '' });
    } catch (err) { setErrorMsg("儲存失敗。"); }
  };

  const generateQuiz = (currentWords = words) => {
    // 篩選出目前語言且尚未熟記的單字
    const eligibleWords = currentWords.filter(w => !w.stats?.mc?.archived && w.lang === langMode);
    
    // 如果單字庫總數不足以出題
    if (currentWords.filter(w => w.lang === langMode).length < 3) {
      setQuizWord(null);
      return;
    }

    // 如果沒有尚未熟記的單字了
    if (eligibleWords.length === 0) {
      setQuizWord(null);
      return;
    }

    const randomWord = eligibleWords[Math.floor(Math.random() * eligibleWords.length)];
    const otherWords = currentWords.filter(w => w.id !== randomWord.id && w.lang === langMode);
    const shuffledOthers = otherWords.sort(() => 0.5 - Math.random()).slice(0, 3);
    const optionsSet = [...shuffledOthers.map(w => w.definition), randomWord.definition];
    
    setQuizWord(randomWord);
    setOptions(optionsSet.sort(() => 0.5 - Math.random()));
    setQuizFeedback(null);
    isTransitioning.current = false;
  };

  const handleQuizAnswer = async (answer) => {
    if (quizFeedback || !quizWord || !user || isTransitioning.current) return;
    
    isTransitioning.current = true;
    const isCorrect = answer === quizWord.definition;
    const currentStats = quizWord.stats?.mc || { correct: 0, total: 0, archived: false };
    
    const newTotal = currentStats.total + 1;
    const newCorrect = isCorrect ? currentStats.correct + 1 : currentStats.correct;
    // 答對超過 5 次且正確率 > 70% 則收錄
    const shouldArchive = newCorrect >= 5 && (newCorrect / newTotal) > 0.7;

    const updatedStats = { mc: { total: newTotal, correct: newCorrect, archived: shouldArchive } };

    setQuizFeedback({ 
      status: isCorrect ? 'correct' : 'wrong', 
      isArchived: shouldArchive,
      term: quizWord.term,
      message: isCorrect ? (shouldArchive ? '完美獵取！單字已收錄' : '答對了！') : `正確答案是：${quizWord.definition}` 
    });

    const wordRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', quizWord.id);
    updateDoc(wordRef, { stats: updatedStats });

    // 同步本地狀態，讓畫面的進度條能即時更新
    const nextWords = words.map(w => w.id === quizWord.id ? { ...w, stats: updatedStats } : w);
    setWords(nextWords);

    if (nextQuizTimeout.current) clearTimeout(nextQuizTimeout.current);
    nextQuizTimeout.current = setTimeout(() => generateQuiz(nextWords), shouldArchive ? 2000 : 1000);
  };

  useEffect(() => {
    if (activeTab === 'quiz') generateQuiz();
  }, [activeTab, langMode]);

  const Logo = () => (
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 flex items-center justify-center bg-[#2D4F1E] rounded-xl shadow-lg rotate-3">
        <Compass className="text-white w-6 h-6" />
      </div>
      <span className="text-2xl font-black text-[#2D4F1E]">VocabHunter</span>
    </div>
  );

  const totalCount = words.filter(w => w.lang === langMode).length;
  const archivedCount = words.filter(w => w.lang === langMode && w.stats?.mc?.archived).length;
  const progress = totalCount > 0 ? (archivedCount / totalCount) * 100 : 0;

  if (loading) return <div className="flex h-screen items-center justify-center font-bold">系統啟動中...</div>;

  if (!user) return (
    <div className={`flex h-screen items-center justify-center ${colors.bg} p-6`}>
      <div className="max-w-md w-full bg-white p-10 rounded-[40px] shadow-2xl text-center border">
        <div className="mb-10 flex justify-center scale-110"><Logo /></div>
        <h1 className="text-xl font-bold mb-8 text-[#2D4F1E]">智慧單字探險家</h1>
        <button onClick={() => signInWithPopup(auth, provider)} className={`w-full ${colors.primary} text-white py-5 rounded-2xl font-bold shadow-lg`}>Google 快速登入</button>
      </div>
    </div>
  );

  return (
    <div className={`min-h-screen ${colors.bg} text-stone-800 pb-32 font-sans relative`}>
      <header className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-30 px-6 h-20 flex items-center justify-between shadow-sm">
        <Logo />
        <div className="flex items-center gap-4">
          <div className="bg-stone-100 p-1 rounded-xl flex border">
            <button onClick={() => setLangMode('EN')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${langMode === 'EN' ? 'bg-[#2D4F1E] text-white' : 'text-stone-400'}`}>EN</button>
            <button onClick={() => setLangMode('JP')} className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all ${langMode === 'JP' ? 'bg-orange-800 text-white' : 'text-stone-400'}`}>JP</button>
          </div>
          <button onClick={() => signOut(auth)} className="p-2 text-stone-300 hover:text-red-700"><LogOut size={20} /></button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8">
        <div className="flex bg-[#E5E1D8] p-1 rounded-2xl shadow-inner border mb-8">
          <button onClick={() => setActiveTab('list')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'list' ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500'}`}>獵場單字庫</button>
          <button onClick={() => setActiveTab('quiz')} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'quiz' ? 'bg-white text-[#2D4F1E] shadow-sm' : 'text-stone-500'}`}>選擇挑戰</button>
        </div>

        {activeTab === 'list' ? (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-white p-6 rounded-3xl shadow-sm border-2 border-stone-100">
              <form onSubmit={addWord} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="relative">
                    <input type="text" placeholder="輸入單字..." className="w-full px-5 py-4 bg-stone-50 border-2 border-transparent rounded-2xl focus:border-[#2D4F1E] outline-none font-bold" value={newWord.term} onChange={(e) => setNewWord({ ...newWord, term: e.target.value })} />
                    <button type="button" onClick={fetchTranslation} className="absolute right-4 top-4 text-[#2D4F1E]">{isProcessing ? <Loader2 className="animate-spin" /> : <Search />}</button>
                  </div>
                  <input type="text" placeholder="翻譯結果" className="w-full px-5 py-4 bg-stone-50 border-2 border-transparent rounded-2xl focus:border-[#2D4F1E] outline-none" value={newWord.definition} onChange={(e) => setNewWord({ ...newWord, definition: e.target.value })} />
                </div>
                <button type="submit" className={`w-full py-4 rounded-2xl font-black text-white shadow-lg ${colors.primary}`}>收錄到皮箱</button>
              </form>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {words.filter(w => w.lang === langMode).map(word => (
                <div key={word.id} className={`bg-white p-5 rounded-3xl border-b-4 border-stone-200 flex justify-between items-center ${word.stats?.mc?.archived ? 'opacity-40 grayscale' : 'shadow-sm'}`}>
                  <div className="flex-1 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black">{word.term}</span>
                      <button onClick={() => speak(word.term, word.lang)} className="text-stone-300 hover:text-[#2D4F1E]"><Volume2 size={16}/></button>
                    </div>
                    <p className="text-stone-500 font-medium">{word.definition}</p>
                    {word.stats?.mc?.archived && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-green-100 text-green-700 inline-flex items-center gap-1 mt-2"><CheckCircle2 size={10} /> 已熟記</span>}
                  </div>
                  <button onClick={() => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', word.id))} className="text-stone-200 hover:text-red-800"><Trash2 size={20}/></button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-md mx-auto bg-white p-10 rounded-[40px] shadow-2xl border-2 border-stone-100 text-center min-h-[450px] flex flex-col justify-center relative overflow-hidden">
            {quizFeedback && (
              <div className="absolute inset-0 z-50 flex flex-col items-center justify-center p-8 bg-white/95 backdrop-blur-xl rounded-[40px] animate-in fade-in zoom-in">
                {quizFeedback.isArchived ? (
                  <div className="text-center">
                    <Medal size={100} className="text-[#2D4F1E] mx-auto mb-6 animate-bounce" />
                    <h2 className="text-3xl font-black mb-2 text-stone-800">獵取成功！</h2>
                    <p className="text-[#2D4F1E] font-bold text-2xl">"{quizFeedback.term}"</p>
                  </div>
                ) : (
                  <div className="text-center">
                    {quizFeedback.status === 'correct' ? <CheckCircle2 size={100} className="text-green-600 mx-auto mb-6" /> : <XCircle size={100} className="text-red-900 mx-auto mb-6" />}
                    <h2 className={`text-3xl font-black mb-4 ${quizFeedback.status === 'correct' ? 'text-green-700' : 'text-red-900'}`}>{quizFeedback.status === 'correct' ? '正確！' : '可惜...'}</h2>
                    <p className="text-stone-600 text-lg font-bold">{quizFeedback.message}</p>
                  </div>
                )}
              </div>
            )}

            {!quizWord ? (
              <div className="py-12 flex flex-col items-center">
                {totalCount < 3 ? (
                  <>
                    <AlertCircle size={48} className="text-stone-300 mb-4" />
                    <h3 className="text-xl font-bold mb-2">獵物不足</h3>
                    <p className="text-stone-500 mb-6">需至少 3 個單字才能挑戰</p>
                  </>
                ) : (
                  <>
                    <Trophy size={64} className="text-[#2D4F1E] mb-6" />
                    <h3 className="text-xl font-bold text-stone-800">恭喜！獵場已淨空</h3>
                    <p className="text-stone-500 mt-2">單字皆已進入皮箱</p>
                  </>
                )}
                <button onClick={() => setActiveTab('list')} className={`mt-4 ${colors.primary} text-white px-8 py-3 rounded-xl font-bold`}>前往獵場</button>
              </div>
            ) : (
              <div className="animate-in fade-in">
                <button onClick={() => speak(quizWord.term, quizWord.lang)} className="p-5 bg-stone-50 text-[#2D4F1E] rounded-full border mb-8 active:scale-95 transition-transform"><Volume2 size={40}/></button>
                <h2 className="text-5xl font-black mb-12 text-stone-800 tracking-tight">{quizWord.term}</h2>
                <div className="grid gap-3">
                  {options.map((opt, i) => (
                    <button key={i} onClick={() => handleQuizAnswer(opt)} className="py-4 px-6 bg-stone-50 border-2 border-stone-200 rounded-2xl font-bold text-stone-700 hover:border-[#2D4F1E] hover:bg-white transition-all active:scale-95">{opt}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <div className="fixed bottom-10 left-0 right-0 px-6 z-20">
        <div className="max-w-4xl mx-auto bg-white/95 backdrop-blur-md border border-stone-200 p-5 rounded-[30px] shadow-2xl flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Compass className="text-[#2D4F1E]" size={20} />
            <span className="font-black text-stone-700">探險進度：{archivedCount} / {totalCount}</span>
          </div>
          <div className="flex-1 h-3 bg-stone-100 rounded-full overflow-hidden border">
            <div className="h-full bg-[#2D4F1E] transition-all duration-1000" style={{ width: `${progress}%` }}></div>
          </div>
          <span className="text-2xl font-black text-[#2D4F1E]">{Math.round(progress)}%</span>
        </div>
      </div>
    </div>
  );
};

export default App;
