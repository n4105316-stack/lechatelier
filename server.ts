import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("learning.db");

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    class TEXT NOT NULL,
    pretest_score INTEGER,
    posttest_score INTEGER,
    progress INTEGER DEFAULT 0,
    discussion_q1 TEXT,
    discussion_q2 TEXT,
    reflection TEXT,
    last_active DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/login", (req, res) => {
    const { name, className, role, key } = req.body;
    if (role === "teacher") {
      if (key === "guru hebat") {
        return res.json({ id: 0, name: "Guru", role: "teacher" });
      } else {
        return res.status(401).json({ error: "Kunci akses salah" });
      }
    }
    
    let student = db.prepare("SELECT * FROM students WHERE name = ? AND class = ?").get(name, className) as any;
    if (!student) {
      const info = db.prepare("INSERT INTO students (name, class) VALUES (?, ?)").run(name, className);
      student = { id: info.lastInsertRowid, name, class: className, progress: 0 };
    } else {
      db.prepare("UPDATE students SET last_active = CURRENT_TIMESTAMP WHERE id = ?").run(student.id);
    }
    res.json({ ...student, role: "student" });
  });

  app.get("/api/students", (req, res) => {
    const students = db.prepare("SELECT * FROM students ORDER BY last_active DESC").all();
    res.json(students);
  });

  app.post("/api/update-progress", (req, res) => {
    const { studentId, progress, pretestScore, posttestScore } = req.body;
    if (pretestScore !== undefined) {
      db.prepare("UPDATE students SET pretest_score = ?, progress = MAX(progress, ?), last_active = CURRENT_TIMESTAMP WHERE id = ?").run(pretestScore, progress, studentId);
    } else if (posttestScore !== undefined) {
      db.prepare("UPDATE students SET posttest_score = ?, progress = MAX(progress, ?), last_active = CURRENT_TIMESTAMP WHERE id = ?").run(posttestScore, progress, studentId);
    } else {
      db.prepare("UPDATE students SET progress = MAX(progress, ?), last_active = CURRENT_TIMESTAMP WHERE id = ?").run(progress, studentId);
    }
    res.json({ success: true });
  });

  app.post("/api/update-discussion", (req, res) => {
    const { studentId, q1, q2 } = req.body;
    db.prepare("UPDATE students SET discussion_q1 = ?, discussion_q2 = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?").run(q1, q2, studentId);
    res.json({ success: true });
  });

  app.post("/api/update-reflection", (req, res) => {
    const { studentId, reflection } = req.body;
    db.prepare("UPDATE students SET reflection = ?, last_active = CURRENT_TIMESTAMP WHERE id = ?").run(reflection, studentId);
    res.json({ success: true });
  });

  app.delete("/api/students/:id", (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM students WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.get("/api/leaderboard", (req, res) => {
    const leaderboard = db.prepare("SELECT name FROM students WHERE posttest_score IS NOT NULL ORDER BY posttest_score DESC, last_active ASC").all();
    res.json(leaderboard);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
