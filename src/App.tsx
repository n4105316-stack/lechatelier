import React, { useState, useEffect, useRef } from "react";
import { 
  Sun, Moon, LogIn, GraduationCap, User, Lock, CheckCircle2, 
  ChevronRight, Send, MessageSquare, Beaker, Globe, Thermometer,
  Droplets, BarChart3, Trophy, Users, LogOut, Info, AlertCircle,
  RefreshCw, Bot, X, Map as MapIcon, Wind, Box, Zap
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";

// Types
type Role = "student" | "teacher";
interface UserData {
  id: number;
  name: string;
  class: string;
  role: Role;
  progress: number;
  pretest_score?: number;
  posttest_score?: number;
  discussion_q1?: string;
  discussion_q2?: string;
  reflection?: string;
}

// Helper component for chemical formulas
const Chem = ({ text }: { text: string }) => {
  if (!text) return null;
  // Regex to match:
  // 1. Numbers after letters or closing parenthesis: CO2 -> CO<sub>2</sub>
  // 2. Explicit superscripts: ^2- -> <sup>2-</sup>
  // 3. Charges: H+ -> H<sup>+</sup>, HCO3- -> HCO3<sup>-</sup>
  // 4. Phases: (g), (l), (aq), (s) -> <i>(phase)</i>
  const parts = text.split(/(\d+|\^[\d\+\-]+|[+\-](?=\s|$|[.,)(])|\((?:g|l|aq|s)\))/g);
  
  return (
    <span>
      {parts.map((part, i) => {
        if (!part) return null;
        // Subscripts for numbers following letters or closing parenthesis
        if (/^\d+$/.test(part)) {
          const prev = parts[i-1];
          if (prev && /[A-Za-z\)]/.test(prev)) return <sub key={i}>{part}</sub>;
          return part;
        }
        // Explicit superscripts starting with ^
        if (/^\^/.test(part)) return <sup key={i}>{part.slice(1)}</sup>;
        // Charges (+ or -) following letters, numbers, or closing parenthesis
        if (/^[+\-]$/.test(part)) {
          const prev = parts[i-1];
          if (prev && /[A-Za-z0-9\)]/.test(prev)) return <sup key={i}>{part}</sup>;
          return part;
        }
        // Phases in italics
        if (/^\((?:g|l|aq|s)\)$/.test(part)) {
          return <i key={i} className="font-serif italic">{part}</i>;
        }
        return part;
      })}
    </span>
  );
};

const STEPS = [
  { id: "pretest", label: "Pretest", icon: <AlertCircle size={20} /> },
  { id: "ssi", label: "Isu Lingkungan (SSI)", icon: <Globe size={20} /> },
  { id: "concept", label: "Materi Konsep", icon: <Info size={20} /> },
  { id: "experiment", label: "Eksperimen Interaktif", icon: <Beaker size={20} /> },
  { id: "summary", label: "Rangkuman & Refleksi", icon: <BarChart3 size={20} /> },
  { id: "posttest", label: "Posttest", icon: <CheckCircle2 size={20} /> },
  { id: "leaderboard", label: "Leaderboard", icon: <Trophy size={20} /> },
];

const PRETEST_QUESTIONS = [
  { q: "Apa yang dimaksud dengan kesetimbangan dinamis?", a: ["Reaksi berhenti total", "Laju reaksi maju sama dengan laju reaksi balik", "Konsentrasi produk selalu lebih besar", "Warna larutan tidak berubah"], c: 1 },
  { q: "Faktor manakah yang TIDAK mempengaruhi kesetimbangan?", a: ["Suhu", "Tekanan", "Katalis", "Konsentrasi"], c: 2 },
  { q: "Jika konsentrasi reaktan ditambah, arah pergeseran kesetimbangan adalah...", a: ["Ke arah reaktan", "Ke arah produk", "Tetap", "Berhenti"], c: 1 },
  { q: "Reaksi eksoterm akan bergeser ke arah reaktan jika suhu...", a: ["Dinaikkan", "Diturunkan", "Tetap", "Ditambah katalis"], c: 0 },
  { q: "Simbol (⇌) dalam persamaan kimia menunjukkan...", a: ["Reaksi satu arah", "Reaksi kesetimbangan", "Reaksi cepat", "Reaksi lambat"], c: 1 },
];

const POSTTEST_QUESTIONS = [
  { 
    q: "Mengapa peningkatan CO2 di atmosfer menyebabkan pengasaman laut?", 
    a: ["CO2 bereaksi dengan air membentuk asam karbonat", "CO2 memanaskan air laut", "CO2 membunuh plankton", "CO2 mengurangi kadar garam"], 
    c: 0,
    e: "CO2 bereaksi dengan air laut membentuk asam karbonat (H2CO3) yang melepaskan ion H+, sehingga pH air laut menurun (menjadi lebih asam)."
  },
  { 
    q: "Sesuai prinsip Le Chatelier, penambahan CO2 pada sistem CO2(g) ⇌ CO2(aq) akan menggeser kesetimbangan ke...", 
    a: ["Kiri (Gas)", "Kanan (Larutan)", "Tetap", "Atas"], 
    c: 1,
    e: "Menambah konsentrasi zat di sisi kiri (gas) akan menggeser kesetimbangan ke sisi kanan (larutan) untuk mengurangi gangguan tersebut."
  },
  { 
    q: "Apa dampak utama pengasaman laut bagi terumbu karang?", 
    a: ["Warna memudar", "Pertumbuhan terhambat karena penurunan ion karbonat", "Suhu air naik", "Arus laut menguat"], 
    c: 1,
    e: "Peningkatan H+ bereaksi dengan ion karbonat (CO3^2-), mengurangi ketersediaannya bagi organisme laut untuk membangun cangkang kalsium karbonat."
  },
  { 
    q: "Jika volume diperkecil pada sistem gas, kesetimbangan bergeser ke arah...", 
    a: ["Jumlah mol lebih besar", "Jumlah mol lebih kecil", "Tetap", "Reaktan"], 
    c: 1,
    e: "Penurunan volume meningkatkan tekanan, sehingga sistem bergeser ke arah yang memiliki jumlah mol gas lebih sedikit."
  },
  { 
    q: "Bagaimana cara mengurangi dampak pengasaman laut berdasarkan konsep kesetimbangan?", 
    a: ["Menambah suhu", "Mengurangi emisi CO2", "Menambah garam", "Mengaduk air laut"], 
    c: 1,
    e: "Mengurangi penyebab utama gangguan (CO2) adalah cara paling efektif untuk mengembalikan kesetimbangan ke kondisi semula."
  },
];

export default function App() {
  const [user, setUser] = useState<UserData | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<"landing" | "login" | "dashboard" | "teacher">("landing");
  const [loginRole, setLoginRole] = useState<Role>("student");
  const [currentStep, setCurrentStep] = useState(0);
  const [students, setStudents] = useState<UserData[]>([]);

  // Theme effect
  useEffect(() => {
    if (theme === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
  }, [theme]);

  const handleLogin = async (name: string, className: string, key?: string) => {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, className, role: loginRole, key })
    });
    
    if (!res.ok) {
      const err = await res.json();
      alert(err.error || "Login gagal");
      return;
    }

    const data = await res.json();
    setUser(data);
    if (data.role === "teacher") {
      setView("teacher");
      fetchStudents();
    } else {
      setView("dashboard");
      setCurrentStep(data.progress);
    }
  };

  const fetchStudents = async () => {
    const res = await fetch("/api/students");
    const data = await res.json();
    setStudents(data);
  };

  const updateProgress = async (newProgress: number, score?: { type: "pre" | "post", val: number }) => {
    if (!user) return;
    const body: any = { studentId: user.id, progress: newProgress };
    if (score?.type === "pre") body.pretestScore = score.val;
    if (score?.type === "post") body.posttestScore = score.val;

    await fetch("/api/update-progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    setUser({ ...user, progress: Math.max(user.progress, newProgress) });
    setCurrentStep(newProgress);
  };

  const logout = () => {
    setUser(null);
    setView("landing");
  };

  return (
    <div className="min-h-screen transition-colors duration-500 overflow-x-hidden relative">
      {/* Decorative Background Elements */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue/10 dark:bg-blue/5 rounded-full blur-[120px] animate-float-custom" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-teal/10 dark:bg-teal/5 rounded-full blur-[120px] animate-float-custom" style={{ animationDelay: "2s" }} />
      </div>

      {/* Navbar */}
      <nav className={`sticky top-0 z-50 glass px-6 py-4 flex justify-between items-center transition-all ${view === "landing" || view === "login" ? "hidden" : "flex"}`}>
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => user?.role === "student" ? setView("dashboard") : setView("teacher")}>
          <div className="w-10 h-10 bg-gradient-to-br from-blue to-teal rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-md">
            ⇌
          </div>
          <span className="font-display font-extrabold text-xl text-blue hidden sm:block">LeChat</span>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            className="w-10 h-10 rounded-xl border border-blue/20 flex items-center justify-center hover:bg-blue/10 transition-colors"
          >
            {theme === "light" ? <Moon size={20} className="text-blue" /> : <Sun size={20} className="text-teal" />}
          </button>
          {user && (
            <button onClick={logout} className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-red-500 transition-colors px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700">
              <LogOut size={18} /> <span className="hidden sm:inline">Keluar</span>
            </button>
          )}
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {view === "landing" && (
            <LandingPage 
              theme={theme} 
              onToggleTheme={() => setTheme(theme === "light" ? "dark" : "light")} 
              onLogin={(role) => { setLoginRole(role); setView("login"); }} 
            />
          )}
          {view === "login" && <LoginForm role={loginRole} onBack={() => setView("landing")} onLogin={handleLogin} />}
          {view === "dashboard" && user && (
            <Dashboard 
              user={user} 
              currentStep={currentStep} 
              onStepChange={setCurrentStep} 
              updateProgress={updateProgress}
            />
          )}
          {view === "teacher" && <TeacherDashboard students={students} refresh={fetchStudents} />}
        </AnimatePresence>
      </main>

      <Footer />
      
      {/* AI Chat Widget (Only for students in dashboard) */}
      {view === "dashboard" && user?.role === "student" && <AIChatWidget />}
    </div>
  );
}

// --- Components ---

function LandingPage({ theme, onToggleTheme, onLogin }: { theme: string, onToggleTheme: () => void, onLogin: (role: Role) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="min-h-[90vh] flex flex-col items-center justify-center text-center space-y-12 py-12 relative z-10"
    >
      <button 
        onClick={onToggleTheme}
        className="absolute top-0 right-0 glass px-4 py-2 rounded-full flex items-center gap-2 text-sm font-bold shadow-md hover:scale-105 transition-transform"
      >
        {theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
        {theme === "light" ? "Mode Gelap" : "Mode Terang"}
      </button>

      <div className="space-y-6">
        <motion.div 
          initial={{ scale: 0.8 }} animate={{ scale: 1 }}
          className="text-6xl md:text-8xl font-display font-extrabold text-gradient leading-none"
        >
          ⇌
        </motion.div>
        <h1 className="text-3xl md:text-5xl font-display font-extrabold text-blue-900 dark:text-white leading-tight max-w-4xl mx-auto">
          Pembelajaran Interaktif<br />Kesetimbangan Kimia:<br />Prinsip Le Chatelier
        </h1>
        <p className="text-lg text-blue-900/80 dark:text-slate-300 max-w-2xl mx-auto font-medium leading-relaxed">
          Yuk belajar kesetimbangan kimia melalui isu nyata — Pemanasan Global dan Pengasaman Laut. Belajar aktif, bermakna, dan menyenangkan! 🌍
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-6 justify-center pt-8">
        <button 
          onClick={() => onLogin("student")}
          className="px-10 py-5 btn-gradient rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all transform hover:scale-105"
        >
          👨‍🎓 Masuk sebagai Siswa
        </button>
        <button 
          onClick={() => onLogin("teacher")}
          className="px-10 py-5 glass border-2 border-blue/20 text-blue rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all transform hover:scale-105"
        >
          👩‍🏫 Masuk sebagai Guru
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-12 w-full max-w-5xl">
        {[
          { icon: "⚗️", label: "Eksperimen Virtual" },
          { icon: "🌊", label: "Isu Lingkungan" },
          { icon: "🤖", label: "Chat AI" },
          { icon: "🏆", label: "Leaderboard" },
          { icon: "📊", label: "Nilai & Progres" },
        ].map((item, i) => (
          <motion.div 
            key={i}
            whileHover={{ y: -5 }}
            className="glass p-6 rounded-2xl flex flex-col items-center gap-3 border border-blue/10"
          >
            <span className="text-3xl">{item.icon}</span>
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 text-center">{item.label}</span>
          </motion.div>
        ))}
      </div>

      <footer className="pt-12 text-xs font-bold text-slate-400 uppercase tracking-widest">
        LeChat — Media Pembelajaran Digital Kimia SMA
      </footer>
    </motion.div>
  );
}

function LoginForm({ role, onBack, onLogin }: { role: Role, onBack: () => void, onLogin: (n: string, c: string, k?: string) => void }) {
  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [key, setKey] = useState("");

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
      className="max-w-md mx-auto glass p-10 rounded-[32px] space-y-8 relative z-10 border-t-8 border-blue shadow-2xl"
    >
      <button onClick={onBack} className="text-sm font-bold text-slate-400 hover:text-blue flex items-center gap-2 transition-colors">
        ← Kembali
      </button>

      <div className="text-center space-y-4">
        <div className="w-14 h-14 bg-gradient-to-br from-blue to-teal rounded-2xl flex items-center justify-center text-2xl mx-auto shadow-lg">
          {role === "student" ? "👨‍🎓" : "👩‍🏫"}
        </div>
        <h2 className="text-2xl font-display font-extrabold text-gradient">Login {role === "student" ? "Siswa" : "Guru"}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Silakan masukkan identitas Anda</p>
      </div>

      <div className="space-y-5">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-600 dark:text-slate-300 ml-1">Nama Lengkap</label>
          <input 
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={role === "student" ? "Contoh: Ferdian Cahya" : "Nama Guru"}
            className="w-full px-5 py-4 rounded-2xl bg-slate-100/50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 focus:border-blue outline-none transition-all font-medium"
          />
        </div>
        {role === "student" ? (
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300 ml-1">Kelas</label>
            <select 
              value={className} onChange={(e) => setClassName(e.target.value)}
              className="w-full px-5 py-4 rounded-2xl bg-slate-100/50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 focus:border-blue outline-none transition-all font-medium"
            >
              <option value="">— Pilih Kelas —</option>
              {["XI IPA 1", "XI IPA 2", "XI IPA 3", "XI IPA 4", "XI IPA 5", "XI IPA 6"].map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300 ml-1">Kunci Akses</label>
            <input 
              type="password" value={key} onChange={(e) => setKey(e.target.value)}
              placeholder="Masukkan kunci akses..."
              className="w-full px-5 py-4 rounded-2xl bg-slate-100/50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 focus:border-blue outline-none transition-all font-medium"
            />
          </div>
        )}
      </div>

      <button 
        onClick={() => onLogin(name, className, key)}
        disabled={!name || (role === "student" && !className) || (role === "teacher" && !key)}
        className="w-full py-5 btn-gradient rounded-2xl font-bold text-lg disabled:opacity-50 transition-all shadow-xl"
      >
        Mulai Belajar 🚀
      </button>
    </motion.div>
  );
}

function Dashboard({ user, currentStep, onStepChange, updateProgress }: { user: UserData, currentStep: number, onStepChange: (s: number) => void, updateProgress: (p: number, s?: any) => void }) {
  return (
    <div className="grid lg:grid-cols-4 gap-8 relative z-10">
      {/* Sidebar Progress */}
      <div className="lg:col-span-1 space-y-4">
        <div className="glass p-8 rounded-[32px] space-y-8 border-l-8 border-blue shadow-2xl">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-blue to-teal text-white rounded-2xl flex items-center justify-center shadow-lg">
              <User size={28} />
            </div>
            <div>
              <h4 className="font-display font-extrabold text-lg text-gradient leading-tight">{user.name}</h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">{user.class}</p>
            </div>
          </div>
          
          <div className="space-y-3">
            {STEPS.map((step, idx) => {
              const isLocked = idx > user.progress;
              const isCompleted = idx < user.progress;
              const isActive = idx === currentStep;

              return (
                <button
                  key={step.id}
                  disabled={isLocked}
                  onClick={() => onStepChange(idx)}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 group ${
                    isActive ? "bg-gradient-to-r from-blue to-teal text-white shadow-lg scale-105" : 
                    isLocked ? "opacity-30 cursor-not-allowed" : "hover:bg-blue/10 dark:hover:bg-blue/5"
                  }`}
                >
                  <div className={`text-xl ${isActive ? "text-white" : isCompleted ? "text-teal" : "text-slate-400 group-hover:text-blue"}`}>
                    {isLocked ? <Lock size={20} /> : isCompleted ? <CheckCircle2 size={20} /> : step.icon}
                  </div>
                  <span className={`text-sm font-bold ${isActive ? "text-white" : "text-slate-600 dark:text-slate-300"}`}>{step.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="lg:col-span-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="glass p-10 rounded-[40px] shadow-2xl border border-white/10 min-h-[600px]"
          >
            {currentStep === 0 && <Pretest onComplete={(score) => updateProgress(1, { type: "pre", val: score })} />}
            {currentStep === 1 && <SSIContent studentId={user.id} onComplete={() => updateProgress(2)} />}
            {currentStep === 2 && <ConceptMaterial onComplete={() => updateProgress(3)} />}
            {currentStep === 3 && <Experiment onComplete={() => updateProgress(4)} />}
            {currentStep === 4 && <Summary studentId={user.id} onComplete={() => updateProgress(5)} />}
            {currentStep === 5 && <Posttest onComplete={(score) => updateProgress(6, { type: "post", val: score })} />}
            {currentStep === 6 && <Leaderboard />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Pretest({ onComplete }: { onComplete: (score: number) => void }) {
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleAnswer = () => {
    if (selected === PRETEST_QUESTIONS[currentQ].c) setScore(score + 20);
    setShowFeedback(true);
  };

  const nextQuestion = () => {
    setShowFeedback(false);
    setSelected(null);
    if (currentQ < PRETEST_QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      setFinished(true);
    }
  };

  if (finished) {
    return (
      <div className="text-center space-y-10 py-12">
        <div className="w-32 h-32 bg-teal/10 text-teal rounded-full flex items-center justify-center mx-auto shadow-inner">
          <CheckCircle2 size={64} />
        </div>
        <div className="space-y-4">
          <h2 className="text-3xl font-display font-extrabold text-gradient">Pretest Selesai!</h2>
          <p className="text-slate-600 dark:text-slate-300 font-medium text-base">Skor pemahaman awal Anda:</p>
          <div className="text-5xl font-display font-black text-blue">{score}</div>
        </div>
        <button onClick={() => onComplete(score)} className="px-12 py-5 btn-gradient rounded-2xl font-bold text-lg shadow-xl">
          Lanjutkan ke Materi SSI 🌍
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <span className="text-teal font-black uppercase tracking-widest text-xs">Soal {currentQ + 1} / 5</span>
          <h3 className="text-2xl font-display font-extrabold text-slate-900 dark:text-white leading-tight">
            <Chem text={PRETEST_QUESTIONS[currentQ].q} />
          </h3>
        </div>
        <div className="w-16 h-16 rounded-2xl bg-blue/5 flex items-center justify-center text-blue font-black text-xl border border-blue/10">
          {currentQ + 1}
        </div>
      </div>

      <div className="grid gap-4">
        {PRETEST_QUESTIONS[currentQ].a.map((ans, idx) => (
          <button 
            key={idx} 
            disabled={showFeedback}
            onClick={() => setSelected(idx)}
            className={`w-full text-left p-6 rounded-2xl border-2 transition-all duration-300 flex items-center gap-4 group ${
              selected === idx 
                ? (showFeedback ? (idx === PRETEST_QUESTIONS[currentQ].c ? "border-teal bg-teal/5" : "border-red-500 bg-red-50") : "border-blue bg-blue/5 text-blue shadow-md") 
                : (showFeedback && idx === PRETEST_QUESTIONS[currentQ].c ? "border-teal bg-teal/5" : "border-slate-200 dark:border-slate-700 hover:border-blue/50 hover:bg-blue/5")
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-colors ${
              selected === idx ? (showFeedback ? (idx === PRETEST_QUESTIONS[currentQ].c ? "bg-teal text-white" : "bg-red-500 text-white") : "bg-blue text-white") : (showFeedback && idx === PRETEST_QUESTIONS[currentQ].c ? "bg-teal text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-blue")
            }`}>
              {["A", "B", "C", "D"][idx]}
            </div>
            <span className={`font-semibold ${showFeedback && idx === PRETEST_QUESTIONS[currentQ].c ? "text-teal-700 dark:text-teal-300" : "text-slate-700 dark:text-slate-200"}`}>
              <Chem text={ans} />
            </span>
          </button>
        ))}
      </div>

      {showFeedback && (
        <motion.div 
          initial={{ opacity: 0, y: 10 }} 
          animate={{ opacity: 1, y: 0 }} 
          className={`p-4 rounded-2xl font-bold text-center ${
            selected === PRETEST_QUESTIONS[currentQ].c 
              ? "bg-teal/10 text-teal border border-teal/20" 
              : "bg-red-500/10 text-red-500 border border-red-500/20"
          }`}
        >
          {selected === PRETEST_QUESTIONS[currentQ].c ? "Benar ✅" : "Salah ❌"}
        </motion.div>
      )}

      {!showFeedback ? (
        <button 
          onClick={handleAnswer}
          disabled={selected === null}
          className="w-full py-5 btn-gradient rounded-2xl font-bold text-lg disabled:opacity-50 shadow-xl"
        >
          Kirim Jawaban
        </button>
      ) : (
        <button 
          onClick={nextQuestion}
          className="w-full py-5 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl font-bold text-lg shadow-xl"
        >
          {currentQ === PRETEST_QUESTIONS.length - 1 ? "Lihat Hasil" : "Soal Berikutnya →"}
        </button>
      )}
    </div>
  );
}

function SSIContent({ studentId, onComplete }: { studentId: number, onComplete: () => void }) {
  const [answer1, setAnswer1] = useState("");
  const [answer2, setAnswer2] = useState("");

  const handleSave = async () => {
    await fetch("/api/update-discussion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, q1: answer1, q2: answer2 })
    });
    onComplete();
  };

  return (
    <div className="space-y-12 relative z-10">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal/10 text-teal rounded-full text-xs font-black uppercase tracking-widest">
          <Globe size={14} /> Socio-Scientific Issue
        </div>
        <h2 className="text-3xl md:text-4xl font-display font-extrabold text-gradient leading-tight">Pemanasan Global & Pengasaman Laut</h2>
        <p className="text-base text-slate-600 dark:text-slate-300 font-medium leading-relaxed max-w-3xl">
          Pemanasan global bukan hanya tentang kenaikan suhu, tetapi juga tentang perubahan kimiawi di lautan kita. 
          Samudera menyerap sekitar 30% emisi karbon dioksida (CO₂) dari atmosfer.
        </p>
      </div>

      {/* Custom Illustration from Design */}
      <div className="relative h-[300px] w-full rounded-[40px] overflow-hidden border-2 border-blue/20 shadow-2xl bg-gradient-to-b from-[#87CEEB] via-[#E0F0FF] to-[#1a6fa8]">
        {/* Sun & Rays */}
        <div className="absolute top-6 right-10 w-20 h-20 rounded-full bg-gradient-to-br from-yellow-300 to-orange-500 shadow-[0_0_60px_rgba(255,200,0,0.7)] z-10">
          <div className="absolute inset-0 animate-pulse bg-yellow-400/20 rounded-full scale-150 blur-xl" />
        </div>
        
        {/* Clouds */}
        <motion.div animate={{ x: [-20, 20, -20] }} transition={{ repeat: Infinity, duration: 10, ease: "linear" }} className="absolute top-10 left-20 w-24 h-8 bg-white/60 rounded-full blur-md" />
        <motion.div animate={{ x: [20, -20, 20] }} transition={{ repeat: Infinity, duration: 12, ease: "linear" }} className="absolute top-20 right-40 w-32 h-10 bg-white/40 rounded-full blur-lg" />

        {/* Factory & Industrial Complex */}
        <div className="absolute bottom-[120px] left-10 flex items-end">
          <div className="relative">
            {/* Chimneys */}
            <div className="flex gap-2 mb-[-2px] ml-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-4 h-12 bg-slate-700 rounded-t-sm relative">
                  <div className="absolute top-0 left-0 w-full h-1 bg-slate-800" />
                  {/* Smoke Particles */}
                  {[1, 2, 3].map(j => (
                    <motion.div 
                      key={j}
                      initial={{ opacity: 0, y: 0, scale: 0.5 }}
                      animate={{ opacity: [0, 0.8, 0], y: -100, x: [0, 20, -20, 10], scale: [0.5, 2, 3] }}
                      transition={{ repeat: Infinity, duration: 4, delay: (i * 1.5) + (j * 0.8) }}
                      className="absolute top-[-10px] left-0 w-6 h-6 bg-slate-400/40 rounded-full blur-md"
                    />
                  ))}
                  {/* CO2 Labels - More frequent and visible */}
                  {[0, 1].map(k => (
                    <motion.div 
                      key={k}
                      initial={{ opacity: 0, y: 0 }}
                      animate={{ opacity: [0, 1, 0], y: -150, x: 40 * (k === 0 ? 1 : -1) }}
                      transition={{ repeat: Infinity, duration: 4, delay: (i * 1.5) + (k * 2) }}
                      className="absolute top-[-20px] left-0 text-[9px] font-black text-slate-700 bg-white/80 px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm border border-slate-200"
                    >
                      CO₂ GAS 💨
                    </motion.div>
                  ))}
                </div>
              ))}
            </div>
            {/* Main Building */}
            <div className="w-24 h-16 bg-slate-600 rounded-t-lg border-b-4 border-slate-800 flex items-center justify-center gap-2">
              <div className="w-3 h-3 bg-yellow-400/50 rounded-sm animate-pulse" />
              <div className="w-3 h-3 bg-yellow-400/50 rounded-sm animate-pulse" style={{ animationDelay: "0.5s" }} />
            </div>
          </div>
        </div>

        {/* Atmosphere to Ocean CO2 Transfer */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="flex gap-8">
            {[1, 2, 3].map(i => (
              <motion.div 
                key={i}
                animate={{ y: [0, 150], opacity: [0, 1, 0] }}
                transition={{ repeat: Infinity, duration: 4, delay: i * 1.3 }}
                className="flex flex-col items-center"
              >
                <div className="text-[10px] font-black text-blue-600 bg-white/90 px-2 py-1 rounded-full shadow-lg border border-blue-200 mb-2">CO₂</div>
                <div className="w-0.5 h-20 bg-gradient-to-b from-blue-400 to-transparent dashed opacity-50" />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Ocean Waves & Depth */}
        <div className="absolute bottom-0 left-0 right-0 h-[120px] bg-gradient-to-b from-[#1a6fa8] to-[#0d3b5c]">
          {/* Surface Waves */}
          <div className="absolute top-0 left-0 right-0 h-8 bg-[url('data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 1200 80\'%3E%3Cpath d=\'M0,40 C300,0 600,80 900,40 C1050,20 1150,60 1200,40 L1200,80 L0,80 Z\' fill=\'%231a6fa8\'/%3E%3C/svg%3E')] bg-repeat-x bg-contain opacity-80" />
          
          {/* Underwater Elements */}
          <div className="absolute inset-0 flex items-center justify-around px-20">
            <motion.div animate={{ y: [0, -5, 0] }} transition={{ repeat: Infinity, duration: 4 }} className="text-2xl opacity-40">🐚</motion.div>
            <motion.div animate={{ y: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 5 }} className="text-3xl opacity-30">🐠</motion.div>
            <motion.div animate={{ y: [0, -8, 0] }} transition={{ repeat: Infinity, duration: 6 }} className="text-2xl opacity-40">🌿</motion.div>
          </div>

          <div className="absolute bottom-4 left-0 right-0 text-white/80 text-[10px] font-black uppercase tracking-[0.2em] text-center px-4">
            PENYERAPAN CO₂ BERLEBIH → PEMBENTUKAN ASAM KARBONAT → pH LAUT MENURUN
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="glass p-8 rounded-3xl space-y-6 border-t-4 border-blue">
          <h4 className="text-xl font-display font-bold flex items-center gap-2">
            <span className="text-2xl">🏭</span> Emisi CO₂ Industri
          </h4>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Aktivitas industri menghasilkan jutaan ton <Chem text="CO2" /> ke atmosfer. Konsentrasi <Chem text="CO2" /> atmosfer telah meningkat pesat, memicu pergeseran kesetimbangan global.
          </p>
          <div className="px-4 py-2 bg-orange-500/10 text-orange-600 rounded-full text-xs font-black inline-block">⚠️ Isu Global Serius</div>
        </div>
        <div className="glass p-8 rounded-3xl space-y-6 border-t-4 border-teal">
          <h4 className="text-xl font-display font-bold flex items-center gap-2">
            <span className="text-2xl">🌊</span> Dampak Pengasaman
          </h4>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Saat <Chem text="CO2" /> larut, terbentuk asam karbonat yang melepaskan ion <Chem text="H+" />. Akibatnya, pH laut turun dan mengancam kehidupan organisme laut.
          </p>
          <div className="px-4 py-2 bg-red-500/10 text-red-600 rounded-full text-xs font-black inline-block">🐚 Ancaman Ekosistem</div>
        </div>
      </div>

      <div className="glass p-10 rounded-[32px] space-y-8 border-l-8 border-blue">
        <h3 className="text-2xl font-display font-extrabold text-blue">🧪 Reaksi Kesetimbangan</h3>
        <div className="space-y-4">
          <div className="p-6 bg-slate-100/50 dark:bg-slate-800/50 rounded-2xl text-center font-mono text-xl font-bold border border-blue/10">
            <Chem text="CO2(g) + H2O(l) ⇌ H2CO3(aq) ⇌ HCO3-(aq) + H+(aq)" />
          </div>
        </div>
      </div>

      <div className="space-y-8 pt-8 border-t-2 border-slate-100 dark:border-slate-800">
        <h3 className="text-2xl font-display font-extrabold">💬 Diskusi Reflektif</h3>
        <div className="grid gap-6">
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">1. Mengapa peningkatan konsentrasi CO₂ dapat menyebabkan pengasaman laut?</label>
            <textarea 
              value={answer1} onChange={(e) => setAnswer1(e.target.value)}
              className="w-full p-5 rounded-2xl bg-slate-100/50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 outline-none focus:border-blue transition-all font-medium"
              rows={3} placeholder="Jelaskan menggunakan konsep kesetimbangan..."
            />
          </div>
          <div className="space-y-3">
            <label className="text-sm font-bold text-slate-600 dark:text-slate-300">2. Apakah perubahan kondisi lingkungan dapat menggeser kesetimbangan reaksi kimia?</label>
            <textarea 
              value={answer2} onChange={(e) => setAnswer2(e.target.value)}
              className="w-full p-5 rounded-2xl bg-slate-100/50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 outline-none focus:border-blue transition-all font-medium"
              rows={3} placeholder="Berikan contoh atau pendapat Anda..."
            />
          </div>
        </div>
        <button 
          onClick={handleSave}
          disabled={!answer1 || !answer2}
          className="px-12 py-5 btn-gradient rounded-2xl font-bold text-lg disabled:opacity-50 shadow-xl"
        >
          Simpan Jawaban & Lanjut ke Materi ✅
        </button>
      </div>
    </div>
  );
}

function ConceptMaterial({ onComplete }: { onComplete: () => void }) {
  const [checked, setChecked] = useState(false);

  return (
    <div className="space-y-12 relative z-10">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue/10 text-blue rounded-full text-xs font-black uppercase tracking-widest">
          <Info size={14} /> Materi Pembelajaran
        </div>
        <h2 className="text-3xl md:text-4xl font-display font-extrabold text-gradient leading-tight">Prinsip Le Chatelier</h2>
      </div>
      
      <div className="glass p-8 rounded-[24px] bg-blue-500/5 border-l-8 border-blue shadow-xl">
        <p className="text-lg font-medium italic leading-relaxed text-slate-800 dark:text-blue-100">
          "Jika suatu sistem kesetimbangan diberikan gangguan (perubahan kondisi), sistem akan menyesuaikan diri sehingga mengurangi pengaruh gangguan tersebut."
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {[
          { title: "Konsentrasi", desc: "Ditambah: Geser menjauhi zat tersebut. Dikurangi: Geser mendekati zat tersebut.", icon: "🧪", rule: <Chem text="↑[Reaktan] → Geser Kanan" />, color: "blue" },
          { title: "Suhu", desc: "Naik: Geser ke arah endoterm (ΔH +). Turun: Geser ke arah eksoterm (ΔH -).", icon: "🌡️", rule: <Chem text="↑Suhu + Ekso → Geser Kiri" />, color: "red" },
          { title: "Tekanan/Volume", desc: "Tekanan ↑ (Volume ↓): Geser ke koefisien gas kecil. Tekanan ↓ (Volume ↑): Geser ke koefisien gas besar.", icon: "🔴", rule: <Chem text="↑Tekanan → Mol Gas ↓" />, color: "teal" },
          { title: "Katalis", desc: "Mempercepat tercapainya kesetimbangan, namun TIDAK menggeser arah kesetimbangan.", icon: "⚡", rule: <Chem text="Katalis ≠ Menggeser" />, color: "purple" },
        ].map((f, i) => (
          <motion.div 
            key={i} whileHover={{ y: -5 }}
            className="p-8 rounded-3xl glass border border-blue/10 flex gap-6"
          >
            <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-3xl shadow-inner shrink-0">
              {f.icon}
            </div>
            <div className="space-y-2">
              <h4 className="text-xl font-display font-bold">{f.title}</h4>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{f.desc}</p>
              <div className="inline-block px-3 py-1 bg-blue-500/10 text-blue font-black text-[10px] rounded-lg uppercase tracking-wider">
                {f.rule}
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="p-8 rounded-[32px] bg-teal-500/5 border-2 border-dashed border-teal/30">
        <h4 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
          <span className="text-2xl">🌍</span> Tantangan Berpikir: Isu Lingkungan
        </h4>
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          Berdasarkan faktor-faktor di atas, bagaimana menurut Anda peningkatan emisi gas CO₂ dari industri dapat mempengaruhi kesetimbangan kimia di lautan? 
          Cobalah analisis pergeseran reaksinya secara mandiri sebelum melihat kesimpulan di akhir modul.
        </p>
      </div>

      <div 
        onClick={() => setChecked(!checked)}
        className={`flex items-center gap-4 p-6 rounded-2xl border-2 cursor-pointer transition-all duration-300 ${
          checked ? "border-teal bg-teal/5" : "border-slate-200 dark:border-slate-700 hover:border-blue/50"
        }`}
      >
        <div className={`w-8 h-8 rounded-lg border-2 flex items-center justify-center transition-colors ${
          checked ? "bg-teal border-teal text-white" : "bg-white dark:bg-slate-800 border-slate-300"
        }`}>
          {checked && <CheckCircle2 size={20} />}
        </div>
        <span className="font-bold text-lg">Saya telah memahami prinsip dasar Le Chatelier</span>
      </div>

      <button 
        onClick={onComplete}
        disabled={!checked}
        className="w-full py-6 btn-gradient rounded-3xl font-black text-xl disabled:opacity-50 shadow-2xl transform hover:scale-[1.01] transition-transform"
      >
        Mulai Eksperimen Interaktif 🧪
      </button>
    </div>
  );
}

function Experiment({ onComplete }: { onComplete: () => void }) {
  const [activeTab, setActiveTab] = useState<"concentration" | "temp" | "pressure" | "volume" | "catalyst">("concentration");
  
  // Concentration State
  const [concR, setConcR] = useState(5);
  const [concP, setConcP] = useState(5);

  // Temp State
  const [tempType, setTempType] = useState<"exo" | "endo">("exo");
  const [tempVal, setTempVal] = useState(50);

  // Pressure State
  const [pressVal, setPressVal] = useState(5);

  // Volume State
  const [volVal, setVolVal] = useState(60);

  // Catalyst State
  const [hasCatalyst, setHasCatalyst] = useState(false);

  const renderConcentration = () => {
    const isRight = concR > concP + 1;
    const isLeft = concP > concR + 1;
    const statusClass = isRight ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : isLeft ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20";
    
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="glass p-6 rounded-3xl bg-blue-500/5 border-l-4 border-blue">
          <p className="text-sm font-bold text-blue flex items-center gap-2">
            <Info size={16} /> 💡 Prinsip:
          </p>
          <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">
            Jika konsentrasi reaktan ditambah → bergeser ke kanan. Jika konsentrasi produk ditambah → bergeser ke kiri.
          </p>
        </div>

        <div className="glass p-8 rounded-[32px] border-l-4 border-blue space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-blue/10 rounded-lg text-blue"><Beaker size={20} /></div>
            <h3 className="text-xl font-display font-bold">A + B ⇌ C + D</h3>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-black text-slate-500 uppercase tracking-wider">🔴 Konsentrasi Reaktan</label>
                <span className="text-lg font-mono font-black text-blue">{concR} mol/L</span>
              </div>
              <input type="range" min="1" max="10" value={concR} onChange={(e) => setConcR(Number(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-rose-500" />
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-black text-slate-500 uppercase tracking-wider">🟢 Konsentrasi Produk</label>
                <span className="text-lg font-mono font-black text-blue">{concP} mol/L</span>
              </div>
              <input type="range" min="1" max="10" value={concP} onChange={(e) => setConcP(Number(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-emerald-500" />
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="glass p-10 rounded-[40px] border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center min-h-[250px] relative overflow-hidden">
            <div className="flex items-center gap-8 w-full justify-around">
              <div className="text-center space-y-4 flex-1">
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Reaktan</div>
                <div className="flex flex-wrap justify-center gap-2 max-w-[120px] mx-auto">
                  {Array.from({ length: concR }).map((_, i) => (
                    <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-4 h-4 rounded-full bg-rose-500 shadow-lg shadow-rose-500/20" />
                  ))}
                </div>
              </div>
              <div className={`text-4xl font-black ${isRight ? "text-emerald-500" : isLeft ? "text-rose-500" : "text-slate-300"}`}>
                {isRight ? "→" : isLeft ? "←" : "⇌"}
              </div>
              <div className="text-center space-y-4 flex-1">
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Produk</div>
                <div className="flex flex-wrap justify-center gap-2 max-w-[120px] mx-auto">
                  {Array.from({ length: concP }).map((_, i) => (
                    <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }} className="w-4 h-4 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/20" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center space-y-6">
            <div className={`p-6 rounded-3xl border-2 text-center transition-all duration-500 ${statusClass}`}>
              <div className="text-xs font-black uppercase tracking-[0.2em] mb-2">Status Sistem</div>
              <div className="text-2xl font-display font-black">
                {isRight ? "Bergeser ke Kanan →" : isLeft ? "← Bergeser ke Kiri" : "Kesetimbangan Seimbang ⚖️"}
              </div>
            </div>
            <div className="p-6 bg-blue-500/5 rounded-3xl border border-blue/10">
              <p className="text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                {isRight ? "Reaktan berlebih! Sistem menggeser kesetimbangan ke arah produk untuk mengurangi kelebihan tersebut." : isLeft ? "Produk berlebih! Sistem menggeser kesetimbangan ke arah reaktan untuk menyeimbangkan kembali." : "Laju reaksi maju sama dengan laju reaksi balik. Sistem berada dalam kondisi stabil."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderTemp = () => {
    const isExo = tempType === "exo";
    const isHot = tempVal > 60;
    const isCold = tempVal < 40;
    
    let shift = "balanced";
    if (isExo) {
      if (isHot) shift = "left";
      if (isCold) shift = "right";
    } else {
      if (isHot) shift = "right";
      if (isCold) shift = "left";
    }

    const statusClass = shift === "right" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : shift === "left" ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20";

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="glass p-6 rounded-3xl bg-orange-500/5 border-l-4 border-orange-500">
          <p className="text-sm font-bold text-orange-600 flex items-center gap-2">
            <Info size={16} /> 💡 Prinsip:
          </p>
          <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">
            • <b>Eksoterm:</b> Suhu naik → ke kiri | Suhu turun → ke kanan<br/>
            • <b>Endoterm:</b> Suhu naik → ke kanan | Suhu turun → ke kiri
          </p>
        </div>

        <div className="glass p-8 rounded-[32px] border-l-4 border-orange-500 space-y-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/10 rounded-lg text-orange-500"><Thermometer size={20} /></div>
              <h3 className="text-xl font-display font-bold">
                {isExo ? "A + B ⇌ C + D + Kalor" : "A + B + Kalor ⇌ C + D"}
              </h3>
            </div>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <button onClick={() => setTempType("exo")} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${isExo ? "bg-orange-500 text-white shadow-lg" : "text-slate-400"}`}>🔥 EKSOTERM</button>
              <button onClick={() => setTempType("endo")} className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${!isExo ? "bg-blue-500 text-white shadow-lg" : "text-slate-400"}`}>❄️ ENDOTERM</button>
            </div>
          </div>

          <div className="space-y-4 relative">
            <div className="flex justify-between items-center">
              <label className="text-sm font-black text-slate-500 uppercase tracking-wider">🌡️ Suhu Sistem</label>
              <span className="text-lg font-mono font-black text-orange-500">{tempVal}°C</span>
            </div>
            <div className="relative h-10 flex items-center">
              <div className="w-full h-3 bg-gradient-to-r from-blue-400 via-slate-200 to-rose-500 rounded-full overflow-hidden border border-slate-200 dark:border-slate-700">
                <motion.div 
                  initial={false}
                  animate={{ width: `${tempVal}%` }} 
                  className="h-full bg-white/20" 
                />
              </div>
              <motion.div 
                initial={false}
                animate={{ left: `${tempVal}%` }} 
                className="absolute top-1/2 -translate-y-1/2 w-8 h-8 bg-white border-4 border-orange-500 rounded-full shadow-[0_4px_10px_rgba(249,115,22,0.4)] z-10 flex items-center justify-center -translate-x-1/2 pointer-events-none"
              >
                <div className="w-0.5 h-3 bg-orange-200 rounded-full mx-0.5" />
                <div className="w-0.5 h-3 bg-orange-200 rounded-full mx-0.5" />
              </motion.div>
              <input 
                type="range" min="0" max="100" value={tempVal} 
                onChange={(e) => setTempVal(Number(e.target.value))} 
                className="w-full h-full opacity-0 absolute inset-0 cursor-pointer z-20" 
              />
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="glass p-10 rounded-[40px] border-2 border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center min-h-[250px]">
            <div className="flex items-center gap-8 w-full justify-around">
              <div className="text-center space-y-4 flex-1">
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Reaktan</div>
                <div className="flex flex-wrap justify-center gap-2 max-w-[120px] mx-auto">
                  {Array.from({ length: shift === "left" ? 7 : shift === "right" ? 3 : 5 }).map((_, i) => (
                    <motion.div key={i} animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.1 }} className="w-4 h-4 rounded-full bg-rose-500 shadow-lg shadow-rose-500/20" />
                  ))}
                </div>
              </div>
              <div className={`text-4xl font-black ${shift === "right" ? "text-emerald-500" : shift === "left" ? "text-rose-500" : "text-slate-300"}`}>
                {shift === "right" ? "→" : shift === "left" ? "←" : "⇌"}
              </div>
              <div className="text-center space-y-4 flex-1">
                <div className="text-xs font-black text-slate-400 uppercase tracking-widest">Produk</div>
                <div className="flex flex-wrap justify-center gap-2 max-w-[120px] mx-auto">
                  {Array.from({ length: shift === "right" ? 7 : shift === "left" ? 3 : 5 }).map((_, i) => (
                    <motion.div key={i} animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.1 }} className="w-4 h-4 rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/20" />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col justify-center space-y-6">
            <div className={`p-6 rounded-3xl border-2 text-center transition-all duration-500 ${statusClass}`}>
              <div className="text-xs font-black uppercase tracking-[0.2em] mb-2">Status Suhu</div>
              <div className="text-2xl font-display font-black">
                {shift === "right" ? "Bergeser ke Kanan →" : shift === "left" ? "← Bergeser ke Kiri" : "Suhu Normal ⚖️"}
              </div>
            </div>
            <div className="p-6 bg-orange-500/5 rounded-3xl border border-orange-500/10">
              <p className="text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                {isExo 
                  ? (isHot ? "Suhu naik pada reaksi eksoterm! Sistem bergeser ke arah reaktan (kiri) untuk menyerap kelebihan panas." : isCold ? "Suhu turun pada reaksi eksoterm! Sistem bergeser ke arah produk (kanan) untuk menghasilkan panas." : "Suhu berada pada kondisi optimal untuk kesetimbangan.")
                  : (isHot ? "Suhu naik pada reaksi endoterm! Sistem bergeser ke arah produk (kanan) untuk menyerap panas tambahan." : isCold ? "Suhu turun pada reaksi endoterm! Sistem bergeser ke arah reaktan (kiri) untuk menyeimbangkan suhu." : "Suhu berada pada kondisi optimal untuk kesetimbangan.")
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPressure = () => {
    const isHigh = pressVal > 6;
    const isLow = pressVal < 4;
    const shift = isHigh ? "right" : isLow ? "left" : "balanced";
    const statusClass = shift === "right" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : shift === "left" ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20";

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="glass p-6 rounded-3xl bg-teal-500/5 border-l-4 border-teal">
          <p className="text-sm font-bold text-teal-600 flex items-center gap-2">
            <Info size={16} /> 💡 Prinsip:
          </p>
          <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">
            Tekanan naik → bergeser ke sisi mol gas lebih sedikit. Tekanan turun → bergeser ke sisi mol gas lebih banyak.
          </p>
        </div>

        <div className="glass p-8 rounded-[32px] border-l-4 border-teal space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-teal/10 rounded-lg text-teal"><Wind size={20} /></div>
            <div className="space-y-1">
              <h3 className="text-xl font-display font-bold">
                <Chem text="N2(g) + 3H2(g)" /> <span className="text-teal mx-1">⇌</span> <Chem text="2NH3(g)" />
              </h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">(4 mol gas ⇌ 2 mol gas)</p>
            </div>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-sm font-black text-slate-500 uppercase tracking-wider">💨 Tekanan Sistem</label>
              <span className="text-lg font-mono font-black text-teal">{pressVal} atm</span>
            </div>
            <input type="range" min="1" max="10" value={pressVal} onChange={(e) => setPressVal(Number(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-teal" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="glass p-10 rounded-[40px] border-2 border-teal/20 flex flex-col items-center justify-center min-h-[250px] relative overflow-hidden">
            <motion.div 
              animate={{ padding: isHigh ? "20px" : isLow ? "40px" : "30px" }}
              className="bg-slate-100 dark:bg-slate-800 rounded-3xl border-2 border-teal/30 flex items-center gap-8 transition-all duration-500"
            >
              <div className="text-center space-y-2">
                <div className="text-[10px] font-black text-slate-400 uppercase"><Chem text="N2 + 3H2" /></div>
                <div className="flex flex-wrap justify-center gap-1 max-w-[80px]">
                  {Array.from({ length: shift === "left" ? 6 : shift === "right" ? 2 : 4 }).map((_, i) => (
                    <motion.div key={i} animate={{ x: [0, 2, -2, 0], y: [0, -2, 2, 0] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.2 }} className="w-3 h-3 rounded-full bg-blue-500" />
                  ))}
                </div>
              </div>
              <div className="text-2xl text-teal font-black">⇌</div>
              <div className="text-center space-y-2">
                <div className="text-[10px] font-black text-slate-400 uppercase"><Chem text="2NH3" /></div>
                <div className="flex flex-wrap justify-center gap-1 max-w-[80px]">
                  {Array.from({ length: shift === "right" ? 6 : shift === "left" ? 2 : 4 }).map((_, i) => (
                    <motion.div key={i} animate={{ x: [0, -2, 2, 0], y: [0, 2, -2, 0] }} transition={{ repeat: Infinity, duration: 2, delay: i * 0.2 }} className="w-3 h-3 rounded-full bg-emerald-500" />
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

          <div className="flex flex-col justify-center space-y-6">
            <div className={`p-6 rounded-3xl border-2 text-center transition-all duration-500 ${statusClass}`}>
              <div className="text-xs font-black uppercase tracking-[0.2em] mb-2">Status Tekanan</div>
              <div className="text-2xl font-display font-black">
                {shift === "right" ? "Bergeser ke Kanan →" : shift === "left" ? "← Bergeser ke Kiri" : "Tekanan Normal ⚖️"}
              </div>
            </div>
            <div className="p-6 bg-teal-500/5 rounded-3xl border border-teal/10">
              <p className="text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                {isHigh ? "Tekanan naik! Sistem bergeser ke arah jumlah mol gas yang lebih sedikit (kanan, 2 mol) untuk mengurangi tekanan." : isLow ? "Tekanan turun! Sistem bergeser ke arah jumlah mol gas yang lebih banyak (kiri, 4 mol) untuk meningkatkan tekanan kembali." : "Tekanan sistem berada dalam kondisi setimbang."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderVolume = () => {
    const isSmall = volVal < 50;
    const isLarge = volVal > 70;
    const shift = isSmall ? "right" : isLarge ? "left" : "balanced";
    const statusClass = shift === "right" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : shift === "left" ? "bg-rose-500/10 text-rose-600 border-rose-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20";

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="glass p-6 rounded-3xl bg-indigo-500/5 border-l-4 border-indigo-500">
          <p className="text-sm font-bold text-indigo-600 flex items-center gap-2">
            <Info size={16} /> 💡 Prinsip:
          </p>
          <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">
            Volume turun → tekanan naik → ke mol sedikit. Volume naik → tekanan turun → ke mol banyak.
          </p>
        </div>

        <div className="glass p-8 rounded-[32px] border-l-4 border-indigo-500 space-y-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500"><Box size={20} /></div>
            <h3 className="text-xl font-display font-bold">
              <Chem text="N2(g) + 3H2(g)" /> <span className="text-indigo mx-1">⇌</span> <Chem text="2NH3(g)" />
            </h3>
          </div>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <label className="text-sm font-black text-slate-500 uppercase tracking-wider">📦 Volume Wadah</label>
              <span className="text-lg font-mono font-black text-indigo-500">{volVal}%</span>
            </div>
            <input type="range" min="30" max="100" value={volVal} onChange={(e) => setVolVal(Number(e.target.value))} className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full appearance-none cursor-pointer accent-indigo-500" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="glass p-10 rounded-[40px] border-2 border-indigo-200 flex items-center justify-center min-h-[250px]">
            <motion.div 
              animate={{ width: `${volVal * 2.5}px`, height: `${volVal * 1.5}px` }}
              className="bg-slate-100 dark:bg-slate-800 rounded-2xl border-2 border-indigo-500/30 flex flex-wrap items-center justify-center gap-2 p-4 overflow-hidden transition-all duration-500"
            >
              {Array.from({ length: shift === "right" ? 6 : shift === "left" ? 10 : 8 }).map((_, i) => (
                <motion.div key={i} animate={{ x: [0, 5, -5, 0], y: [0, -5, 5, 0] }} transition={{ repeat: Infinity, duration: 3, delay: i * 0.3 }} className="w-3 h-3 rounded-full bg-indigo-500 shadow-sm" />
              ))}
            </motion.div>
          </div>

          <div className="flex flex-col justify-center space-y-6">
            <div className={`p-6 rounded-3xl border-2 text-center transition-all duration-500 ${statusClass}`}>
              <div className="text-xs font-black uppercase tracking-[0.2em] mb-2">Status Volume</div>
              <div className="text-2xl font-display font-black">
                {shift === "right" ? "Bergeser ke Kanan →" : shift === "left" ? "← Bergeser ke Kiri" : "Volume Normal ⚖️"}
              </div>
            </div>
            <div className="p-6 bg-indigo-500/5 rounded-3xl border border-indigo-500/10">
              <p className="text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                {isSmall ? "Volume diperkecil! Tekanan naik secara otomatis, sehingga sistem bergeser ke arah jumlah mol gas yang lebih sedikit (kanan)." : isLarge ? "Volume diperbesar! Tekanan turun, sehingga sistem bergeser ke arah jumlah mol gas yang lebih banyak (kiri) untuk menyeimbangkan tekanan." : "Volume wadah berada dalam kondisi standar."}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderCatalyst = () => {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="glass p-6 rounded-3xl bg-purple-500/5 border-l-4 border-purple-500">
          <p className="text-sm font-bold text-purple-600 flex items-center gap-2">
            <Info size={16} /> 💡 Prinsip:
          </p>
          <p className="text-xs mt-1 text-slate-600 dark:text-slate-400">
            Katalis mempercepat kesetimbangan, tetapi TIDAK mengubah posisi kesetimbangan.
          </p>
        </div>

        <div className="glass p-8 rounded-[32px] border-l-4 border-purple-500 space-y-6">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/10 rounded-lg text-purple-500"><Zap size={20} /></div>
              <h3 className="text-xl font-display font-bold">A + B ⇌ C + D</h3>
            </div>
            <button 
              onClick={() => setHasCatalyst(!hasCatalyst)}
              className={`px-6 py-3 rounded-2xl font-black text-xs transition-all duration-500 flex items-center gap-2 shadow-lg ${hasCatalyst ? "bg-purple-600 text-white shadow-purple-500/30 scale-105" : "bg-slate-100 dark:bg-slate-800 text-slate-400"}`}
            >
              ⚡ KATALIS: {hasCatalyst ? "AKTIF" : "NONAKTIF"}
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="glass p-10 rounded-[40px] border-2 border-purple-200 flex flex-col items-center justify-center min-h-[300px] space-y-6">
            <div className="w-full max-w-[400px] aspect-[2/1] relative border-b-2 border-l-2 border-slate-300 dark:border-slate-700">
              {/* Chart Axes Labels */}
              <div className="absolute -left-10 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-black text-slate-400 uppercase tracking-widest">Energi</div>
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-black text-slate-400 uppercase tracking-widest">Waktu</div>
              
              <svg viewBox="0 0 400 200" className="w-full h-full overflow-visible">
                {/* Baseline */}
                <line x1="0" y1="180" x2="400" y2="180" stroke="currentColor" strokeWidth="1" className="text-slate-200 dark:text-slate-800" />
                
                {/* Without Catalyst Curve */}
                <motion.path 
                  d="M 20 180 Q 150 20 280 100 L 380 100" 
                  fill="none" stroke="#ef4444" strokeWidth="3" 
                  initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                />
                <text x="250" y="40" fill="#ef4444" fontSize="10" fontWeight="900">Tanpa Katalis (Ea Tinggi)</text>

                {/* With Catalyst Curve */}
                {hasCatalyst && (
                  <motion.path 
                    d="M 20 180 Q 150 100 280 100 L 380 100" 
                    fill="none" stroke="#10b981" strokeWidth="3" 
                    initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                  />
                )}
                {hasCatalyst && <text x="250" y="130" fill="#10b981" fontSize="10" fontWeight="900">Dengan Katalis (Ea Rendah)</text>}
                
                {/* Equilibrium Line */}
                <line x1="0" y1="100" x2="400" y2="100" stroke="#667eea" strokeWidth="1" strokeDasharray="4 4" />
                <text x="10" y="90" fill="#667eea" fontSize="8" fontWeight="900">POSISI KESETIMBANGAN (TETAP)</text>
              </svg>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-400"><div className="w-3 h-3 bg-rose-500 rounded-full" /> Tanpa Katalis</div>
              <div className="flex items-center gap-2 text-[10px] font-black text-slate-400"><div className="w-3 h-3 bg-emerald-500 rounded-full" /> Dengan Katalis</div>
            </div>
          </div>

          <div className="flex flex-col justify-center space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Waktu</div>
                <div className="text-xl font-mono font-black text-purple-600">{hasCatalyst ? "4.0" : "8.0"}s</div>
              </div>
              <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Posisi</div>
                <div className="text-xl font-mono font-black text-blue">50%</div>
              </div>
            </div>
            <div className={`p-6 rounded-3xl border-2 text-center transition-all duration-500 ${hasCatalyst ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}`}>
              <div className="text-xs font-black uppercase tracking-[0.2em] mb-2">Status Katalis</div>
              <div className="text-2xl font-display font-black">
                {hasCatalyst ? "Reaksi Lebih Cepat! ⚡" : "Laju Reaksi Normal ⚖️"}
              </div>
            </div>
            <div className="p-6 bg-purple-500/5 rounded-3xl border border-purple-500/10">
              <p className="text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">
                {hasCatalyst 
                  ? "Katalis menurunkan energi aktivasi (Ea), sehingga kesetimbangan tercapai dalam waktu yang jauh lebih singkat. Namun, perhatikan bahwa posisi kesetimbangan (jumlah produk vs reaktan) tetap sama!" 
                  : "Tanpa katalis, sistem memerlukan energi aktivasi yang lebih tinggi untuk mencapai kesetimbangan, sehingga proses berlangsung lebih lambat."
                }
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10 relative z-10">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue/10 text-blue rounded-full text-xs font-black uppercase tracking-widest">
            <Beaker size={14} /> Laboratorium Virtual v2.0
          </div>
          <h2 className="text-3xl font-display font-extrabold text-gradient">Eksperimen Kesetimbangan</h2>
        </div>
        
        <div className="flex flex-wrap gap-2 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
          {[
            { id: "concentration", label: "Konsentrasi", icon: <Beaker size={14} /> },
            { id: "temp", label: "Suhu", icon: <Thermometer size={14} /> },
            { id: "pressure", label: "Tekanan", icon: <Wind size={14} /> },
            { id: "volume", label: "Volume", icon: <Box size={14} /> },
            { id: "catalyst", label: "Katalis", icon: <Zap size={14} /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black transition-all duration-300 ${
                activeTab === tab.id 
                ? "bg-white dark:bg-slate-700 text-blue shadow-md scale-105" 
                : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              }`}
            >
              {tab.icon} {tab.label.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-[500px]">
        {activeTab === "concentration" && renderConcentration()}
        {activeTab === "temp" && renderTemp()}
        {activeTab === "pressure" && renderPressure()}
        {activeTab === "volume" && renderVolume()}
        {activeTab === "catalyst" && renderCatalyst()}
      </div>

      <div className="pt-8 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue/10 flex items-center justify-center text-blue">
            <Info size={24} />
          </div>
          <p className="text-sm font-medium text-slate-500 max-w-sm">
            Eksperimen ini mensimulasikan Prinsip Le Chatelier secara real-time. Cobalah semua variabel untuk memahami pergeseran kesetimbangan.
          </p>
        </div>
        <button 
          onClick={() => {
            setConcR(5); setConcP(5);
            setTempVal(50); setTempType("exo");
            setPressVal(5);
            setVolVal(60);
            setHasCatalyst(false);
          }}
          className="px-6 py-3 text-xs font-black text-blue hover:underline uppercase tracking-widest flex items-center gap-2"
        >
          <RefreshCw size={14} /> Reset Simulasi
        </button>
        <button 
          onClick={onComplete} 
          className="px-12 py-5 btn-gradient rounded-[24px] font-black text-xl shadow-2xl hover:scale-[1.05] transition-all active:scale-95"
        >
          Selesai Eksperimen & Lanjut →
        </button>
      </div>
    </div>
  );
}

function Summary({ studentId, onComplete }: { studentId: number, onComplete: () => void }) {
  const [reflection, setReflection] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSave = async () => {
    await fetch("/api/update-reflection", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId, reflection })
    });
    setSubmitted(true);
  };

  return (
    <div className="space-y-12 relative z-10">
      <div className="space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal/10 text-teal rounded-full text-xs font-black uppercase tracking-widest">
          <MapIcon size={14} /> Ringkasan & Refleksi
        </div>
        <h2 className="text-4xl md:text-5xl font-display font-extrabold text-gradient leading-tight">Peta Konsep Kesetimbangan</h2>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2 glass p-10 rounded-[40px] border-l-8 border-blue shadow-xl space-y-8">
          <h3 className="text-2xl font-display font-extrabold">🧠 Intisari Pembelajaran</h3>
          <div className="grid sm:grid-cols-2 gap-6">
            <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-2xl border border-blue/10">
              <h5 className="font-black text-blue uppercase tracking-widest text-xs mb-2">Prinsip Utama</h5>
              <p className="text-sm font-bold">Sistem akan bergeser untuk meniadakan gangguan (Le Chatelier).</p>
            </div>
            <div className="p-6 bg-teal-50 dark:bg-teal-900/20 rounded-2xl border border-teal/10">
              <h5 className="font-black text-teal uppercase tracking-widest text-xs mb-2">Faktor Penentu</h5>
              <p className="text-sm font-bold">Konsentrasi, Suhu, Tekanan, dan Volume.</p>
            </div>
            <div className="p-6 bg-orange-50 dark:bg-orange-900/20 rounded-2xl border border-orange/10">
              <h5 className="font-black text-orange-600 uppercase tracking-widest text-xs mb-2">Dampak Lingkungan</h5>
              <p className="text-sm font-bold"><Chem text="CO2 ↑ → Kesetimbangan Laut Bergeser → Pengasaman." /></p>
            </div>
            <div className="p-6 bg-purple-50 dark:bg-purple-900/20 rounded-2xl border border-purple/10">
              <h5 className="font-black text-purple-600 uppercase tracking-widest text-xs mb-2">Solusi SSI</h5>
              <p className="text-sm font-bold">Pengurangan emisi karbon untuk menjaga pH laut tetap stabil.</p>
            </div>
          </div>
          
          <div className="p-8 bg-blue-500/5 rounded-3xl border-2 border-blue/20">
            <h4 className="font-display font-bold text-blue mb-3 flex items-center gap-2">
              <Info size={18} /> Analisis Prinsip Le Chatelier pada Isu Global
            </h4>
            <p className="text-sm font-medium leading-relaxed text-slate-700 dark:text-slate-300">
              Berdasarkan prinsip Le Chatelier, peningkatan konsentrasi <b><Chem text="CO2" /></b> di atmosfer (gangguan) menyebabkan sistem kesetimbangan di laut bergeser ke arah <b>produk (kanan)</b>. 
              Hal ini mengakibatkan peningkatan konsentrasi ion <b><Chem text="H+" /></b>, yang secara langsung menurunkan pH air laut (menjadi lebih asam). 
              Inilah alasan ilmiah mengapa emisi karbon industri sangat berbahaya bagi ekosistem terumbu karang dan kehidupan laut lainnya.
            </p>
          </div>
        </div>
        <div className="glass p-10 rounded-[40px] border-t-8 border-teal shadow-xl flex flex-col justify-center items-center text-center space-y-4">
          <div className="w-20 h-20 bg-teal/10 text-teal rounded-full flex items-center justify-center text-4xl">🌱</div>
          <h4 className="font-display font-bold text-xl">Kesimpulan</h4>
          <p className="text-sm text-slate-500 font-medium">Kimia bukan hanya di lab, tapi terjadi di seluruh ekosistem bumi kita.</p>
        </div>
      </div>

      <div className="space-y-8 pt-8 border-t-2 border-slate-100 dark:border-slate-800">
        <h3 className="text-2xl font-display font-extrabold">📝 Refleksi Akhir</h3>
        {!submitted ? (
          <div className="space-y-6">
            <p className="text-slate-600 dark:text-slate-300 font-medium">Apa hal terpenting yang Anda pelajari hari ini tentang hubungan antara kimia dan lingkungan?</p>
            <textarea 
              value={reflection} onChange={(e) => setReflection(e.target.value)}
              className="w-full p-6 rounded-[32px] bg-slate-100/50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 outline-none focus:border-blue transition-all font-medium"
              rows={4} placeholder="Tuliskan refleksi Anda di sini..."
            />
            <button 
              onClick={handleSave}
              disabled={!reflection}
              className="px-12 py-5 btn-gradient rounded-2xl font-bold text-lg disabled:opacity-50 shadow-xl"
            >
              Kirim Refleksi & Lanjut ke Posttest 🚀
            </button>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-8 rounded-[32px] bg-blue-500/10 border-2 border-blue/20 space-y-4">
            <div className="flex items-center gap-3 text-blue font-black">
              <CheckCircle2 size={24} /> Refleksi Terkirim!
            </div>
            <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
              Terima kasih atas refleksinya. Memahami hubungan ini adalah langkah pertama untuk menjadi warga dunia yang lebih peduli terhadap isu lingkungan melalui kacamata sains.
            </p>
            <button onClick={onComplete} className="px-8 py-3 btn-gradient rounded-xl font-bold">
              Mulai Posttest Sekarang!
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Posttest({ onComplete }: { onComplete: (score: number) => void }) {
  const [currentQ, setCurrentQ] = useState(0);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const handleNext = () => {
    if (selected === POSTTEST_QUESTIONS[currentQ].c) setScore(score + 20);
    setShowExplanation(true);
  };

  const nextQuestion = () => {
    setShowExplanation(false);
    setSelected(null);
    if (currentQ < POSTTEST_QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      setFinished(true);
    }
  };

  if (finished) {
    return (
      <div className="text-center space-y-10 py-12">
        <div className="w-32 h-32 bg-blue/10 text-blue rounded-full flex items-center justify-center mx-auto shadow-inner">
          <Trophy size={64} />
        </div>
        <div className="space-y-4">
          <h2 className="text-3xl font-display font-extrabold text-gradient">Posttest Selesai!</h2>
          <p className="text-slate-500 dark:text-slate-400 font-medium text-base">Skor akhir pemahaman Anda:</p>
          <div className="text-6xl font-display font-black text-blue">{score}</div>
        </div>
        <button onClick={() => onComplete(score)} className="px-12 py-5 btn-gradient rounded-2xl font-bold text-lg shadow-xl">
          Lihat Peringkat & Selesai 🏆
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <span className="text-blue font-black uppercase tracking-widest text-xs">Posttest • Soal {currentQ + 1} / 5</span>
          <h3 className="text-2xl font-display font-extrabold text-slate-900 dark:text-white leading-tight">
            <Chem text={POSTTEST_QUESTIONS[currentQ].q} />
          </h3>
        </div>
        <div className="w-16 h-16 rounded-2xl bg-teal/5 flex items-center justify-center text-teal font-black text-xl border border-teal/10">
          {currentQ + 1}
        </div>
      </div>

      <div className="grid gap-4">
        {POSTTEST_QUESTIONS[currentQ].a.map((ans, idx) => (
          <button 
            key={idx} 
            disabled={showExplanation}
            onClick={() => setSelected(idx)}
            className={`w-full text-left p-6 rounded-2xl border-2 transition-all duration-300 flex items-center gap-4 group ${
              selected === idx 
                ? (showExplanation ? (idx === POSTTEST_QUESTIONS[currentQ].c ? "border-teal bg-teal/5" : "border-red-500 bg-red-50") : "border-blue bg-blue/5 text-blue shadow-md") 
                : (showExplanation && idx === POSTTEST_QUESTIONS[currentQ].c ? "border-teal bg-teal/5" : "border-slate-200 dark:border-slate-700 hover:border-blue/50")
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm transition-colors ${
              selected === idx ? (showExplanation ? (idx === POSTTEST_QUESTIONS[currentQ].c ? "bg-teal text-white" : "bg-red-500 text-white") : "bg-blue text-white") : (showExplanation && idx === POSTTEST_QUESTIONS[currentQ].c ? "bg-teal text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400")
            }`}>
              {["A", "B", "C", "D"][idx]}
            </div>
            <span className="font-semibold"><Chem text={ans} /></span>
          </button>
        ))}
      </div>

      {showExplanation && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="p-6 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue text-sm font-medium leading-relaxed">
          <span className="font-black text-blue uppercase tracking-widest text-[10px] block mb-2">Penjelasan:</span>
          <Chem text={POSTTEST_QUESTIONS[currentQ].e} />
        </motion.div>
      )}

      {!showExplanation ? (
        <button 
          onClick={handleNext}
          disabled={selected === null}
          className="w-full py-5 btn-gradient rounded-2xl font-bold text-lg disabled:opacity-50 shadow-xl"
        >
          Kirim Jawaban
        </button>
      ) : (
        <button 
          onClick={nextQuestion}
          className="w-full py-5 bg-slate-800 text-white dark:bg-white dark:text-slate-800 rounded-2xl font-bold text-lg shadow-xl"
        >
          {currentQ === 4 ? "Lihat Hasil Akhir" : "Lanjut ke Soal Berikutnya →"}
        </button>
      )}
    </div>
  );
}

function Leaderboard() {
  const [leaders, setLeaders] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then(res => res.json())
      .then(setLeaders);
  }, []);

  return (
    <div className="space-y-10 relative z-10">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue/10 text-blue rounded-full text-xs font-black uppercase tracking-widest">
          <Trophy size={14} /> Hall of Fame
        </div>
        <h2 className="text-3xl font-display font-extrabold text-gradient">Peringkat Siswa</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Siswa dengan pemahaman terbaik konsep Kesetimbangan Kimia SSI.</p>
      </div>

      <div className="glass rounded-[40px] overflow-hidden border border-white/10 shadow-2xl">
        <div className="grid grid-cols-4 p-6 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">Rank</div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 col-span-2">Nama Siswa</div>
          <div className="text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 text-right">Status</div>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {leaders.length > 0 ? leaders.map((s, i) => (
            <motion.div 
              key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
              className="grid grid-cols-4 p-6 items-center hover:bg-blue/5 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
                  i === 0 ? "bg-yellow-400 text-white shadow-lg shadow-yellow-400/30" : 
                  i === 1 ? "bg-slate-300 text-white shadow-lg shadow-slate-300/30" : 
                  i === 2 ? "bg-orange-400 text-white shadow-lg shadow-orange-400/30" : 
                  "bg-slate-100 dark:bg-slate-800 text-slate-400"
                }`}>
                  {i + 1}
                </div>
              </div>
              <div className="col-span-2 font-bold text-slate-700 dark:text-slate-200">{s.name}</div>
              <div className="text-right text-xs font-black text-teal uppercase tracking-widest">Selesai</div>
            </motion.div>
          )) : (
            <div className="p-12 text-center text-slate-400 font-medium italic">Belum ada data peringkat...</div>
          )}
        </div>
      </div>
    </div>
  );
}

function TeacherDashboard({ students, refresh }: { students: UserData[], refresh: () => void }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const handleDelete = async (id: number) => {
    if (confirm("Apakah Anda yakin ingin menghapus data siswa ini?")) {
      await fetch(`/api/students/${id}`, { method: "DELETE" });
      refresh();
    }
  };

  return (
    <div className="space-y-10 relative z-10">
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue/10 text-blue rounded-full text-xs font-black uppercase tracking-widest">
            <User size={14} /> Panel Monitoring Guru
          </div>
          <h2 className="text-3xl font-display font-extrabold text-gradient">Data Progress Siswa</h2>
        </div>
        <button onClick={refresh} className="p-3 glass rounded-xl text-blue hover:bg-blue/10 transition-colors">
          <RefreshCw size={20} />
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-6">
        <div className="glass p-6 rounded-2xl border-l-4 border-blue">
          <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-1">Total Siswa</h5>
          <div className="text-3xl font-display font-black text-blue">{students.length}</div>
        </div>
        <div className="glass p-6 rounded-2xl border-l-4 border-teal">
          <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-1">Rata-rata Posttest</h5>
          <div className="text-3xl font-display font-black text-teal">
            {students.length > 0 ? Math.round(students.reduce((acc, s) => acc + (s.posttest_score || 0), 0) / students.length) : 0}
          </div>
        </div>
        <div className="glass p-6 rounded-2xl border-l-4 border-orange-400">
          <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 mb-1">Penyelesaian</h5>
          <div className="text-3xl font-display font-black text-orange-400">
            {students.filter(s => s.progress >= 6).length} / {students.length}
          </div>
        </div>
      </div>

      <div className="glass rounded-[40px] overflow-hidden border border-white/10 shadow-2xl overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-700">
              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">Nama Siswa</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400">Kelas</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 text-center">Pretest</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 text-center">Posttest</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 text-right">Progress</th>
              <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {students.filter(s => s.id !== 0).map((s, i) => (
              <React.Fragment key={s.id}>
                <tr className="hover:bg-blue/5 transition-colors cursor-pointer" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                  <td className="p-6 font-bold text-slate-700 dark:text-slate-200">{s.name}</td>
                  <td className="p-6 text-xs font-black text-blue uppercase tracking-widest">{s.class}</td>
                  <td className="p-6 text-center font-mono font-bold text-slate-500">{s.pretest_score ?? "-"}</td>
                  <td className="p-6 text-center font-mono font-bold text-teal">{s.posttest_score ?? "-"}</td>
                  <td className="p-6 text-right">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-black uppercase tracking-widest">
                      <div className="w-2 h-2 rounded-full bg-teal animate-pulse" />
                      Step {s.progress + 1} / 7
                    </div>
                  </td>
                  <td className="p-6 text-right">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X size={18} />
                    </button>
                  </td>
                </tr>
                {expandedId === s.id && (
                  <tr className="bg-blue-50/30 dark:bg-blue-900/10">
                    <td colSpan={6} className="p-8">
                      <div className="grid md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <h6 className="text-xs font-black text-blue uppercase tracking-widest">Jawaban Diskusi SSI</h6>
                          <div className="space-y-3">
                            <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-blue/10">
                              <p className="text-[10px] font-bold text-slate-400 mb-1">Q1: Mengapa CO2 menyebabkan pengasaman?</p>
                              <p className="text-sm font-medium">{s.discussion_q1 || "Belum dijawab"}</p>
                            </div>
                            <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-blue/10">
                              <p className="text-[10px] font-bold text-slate-400 mb-1">Q2: Perubahan lingkungan & kesetimbangan?</p>
                              <p className="text-sm font-medium">{s.discussion_q2 || "Belum dijawab"}</p>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <h6 className="text-xs font-black text-teal uppercase tracking-widest">Refleksi Siswa</h6>
                          <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-teal/10 h-full">
                            <p className="text-sm font-medium italic">"{s.reflection || "Belum ada refleksi"}"</p>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AIChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<{ role: "user" | "ai", text: string }[]>([
    { role: "ai", text: "Halo! Saya asisten AI Kimia SSI. Ada yang ingin ditanyakan tentang Kesetimbangan Kimia atau Isu Lingkungan?" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async (textOverride?: string) => {
    const text = textOverride || input;
    if (!text.trim()) return;

    setMessages(prev => [...prev, { role: "user", text }]);
    setInput("");
    setLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: text,
        config: {
          systemInstruction: "Anda adalah asisten pembelajaran kimia untuk siswa SMA. Fokus pada materi Kesetimbangan Kimia, Prinsip Le Chatelier, Pemanasan Global, dan Pengasaman Laut. Berikan jawaban yang edukatif, mudah dipahami, dan hubungkan dengan isu lingkungan (SSI). Gunakan bahasa Indonesia yang ramah. PENTING: Gunakan format Markdown yang benar. Gunakan tag <sub> untuk subscript (misal H<sub>2</sub>O) dan tag <sup> untuk superscript/muatan (misal H<sup>+</sup>), bold untuk poin penting, dan italik untuk istilah asing. Selalu pastikan rumus kimia tertulis dengan benar menggunakan tag HTML tersebut agar terbaca dengan baik.",
        }
      });
      setMessages(prev => [...prev, { role: "ai", text: response.text || "Maaf, saya tidak bisa menjawab itu saat ini." }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "ai", text: "Terjadi kesalahan koneksi. Silakan coba lagi." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-50">
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="mb-4 w-[380px] h-[550px] glass rounded-[32px] shadow-[0_20px_60px_rgba(0,0,0,0.2)] border border-white/20 flex flex-col overflow-hidden"
          >
            {/* Header - Hardware Style */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue flex items-center justify-center shadow-[0_0_15px_rgba(44,123,229,0.5)]">
                  <Bot size={24} />
                </div>
                <div>
                  <h4 className="font-display font-bold text-sm uppercase tracking-widest">AI SSI Assistant</h4>
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-teal rounded-full animate-pulse" />
                    <span className="text-[10px] font-black text-teal uppercase tracking-widest">Online</span>
                  </div>
                </div>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 dark:bg-slate-900/50">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] p-4 rounded-2xl text-sm font-medium leading-relaxed ${
                    m.role === "user" ? "bg-blue text-white shadow-lg" : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm border border-slate-100 dark:border-slate-700"
                  }`}>
                    <div className="markdown-content">
                      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>{m.text}</Markdown>
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 flex gap-2">
                    <div className="w-2 h-2 bg-blue rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-blue rounded-full animate-bounce" style={{ animationDelay: "0.2s" }} />
                    <div className="w-2 h-2 bg-blue rounded-full animate-bounce" style={{ animationDelay: "0.4s" }} />
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 space-y-4">
              <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                {["Apa itu SSI?", "Efek CO2 ke laut?", "Prinsip Le Chatelier?"].map((q, i) => (
                  <button 
                    key={i} onClick={() => handleSend(q)}
                    className="whitespace-nowrap px-4 py-2 bg-blue/5 text-blue text-[10px] font-black uppercase tracking-widest rounded-full border border-blue/10 hover:bg-blue/10 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
              <div className="relative">
                <input 
                  value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="Tanya asisten AI..."
                  className="w-full pl-5 pr-14 py-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border-2 border-transparent focus:border-blue outline-none text-sm font-medium transition-all"
                />
                <button 
                  onClick={() => handleSend()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-blue text-white rounded-xl flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-16 h-16 btn-gradient rounded-full flex items-center justify-center shadow-2xl hover:scale-110 transition-transform relative group"
      >
        <div className="absolute inset-0 rounded-full bg-blue animate-ping opacity-20 group-hover:hidden" />
        <Bot size={32} className="text-white" />
      </button>
    </div>
  );
}

function Footer() {
  return (
    <footer className="w-full py-12 px-8 mt-12 border-t border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md relative z-10">
      <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
        {/* Left Section: UM Logo & Info */}
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 glass p-2 rounded-2xl flex items-center justify-center border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden bg-white">
            <img 
              src="https://blogger.googleusercontent.com/img/a/AVvXsEgajGPsZocghSO34zbKsTjc0Y43OKCjgQZi9QMXMUrH-SpZmvClPrsL-uQF_wArpidoaeHt4E80MrcDchZhNX6LAWTIzDEh26-BwwjH4VlBJsywvaZsMNxR2L8LwzQU-mLkwtrGVteVdmJypEld0FdQnniHpQfCTjUH_EZFqu1Cx7M1EMg_b5Hv8XYM3u01" 
              alt="Logo Universitas Negeri Malang" 
              className="w-full h-full object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="flex flex-col">
            <h4 className="font-display font-extrabold text-slate-900 dark:text-white text-lg">Universitas Negeri Malang</h4>
            <p className="text-slate-600 dark:text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">EXCELLENCE IN LEARNING INNOVATION</p>
          </div>
        </div>

        {/* Right Section: Modul Info & Copyright */}
        <div className="flex flex-col items-center md:items-end text-center md:text-right space-y-1">
          <h3 className="font-display font-black text-slate-900 dark:text-white text-xl uppercase tracking-tight text-center md:text-right">MEDIA DIGITAL KESETIMBANGAN KIMIA SMA</h3>
          <p className="text-slate-600 dark:text-slate-400 italic text-xs max-w-md">
            Mendukung Pembelajaran Kimia Abad 21 yang Adaptif & Interaktif melalui Teknologi AI.
          </p>
          <div className="flex items-center gap-3 pt-3">
            <span className="text-slate-400 text-xs font-bold">© 2026 •</span>
            <div className="px-5 py-1.5 bg-blue-50 dark:bg-blue-900/20 text-blue font-black text-[10px] rounded-full border border-blue/10 uppercase tracking-[0.15em] shadow-sm">
              NURUL AFIFAH - UM CHEMISTRY
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
