import { AppError } from '../utils/apiResponse';
import { Attempt, TopicProgress, Topic, Chapter } from '../models';
import { Types } from 'mongoose';

/* ---------- OCR: read a question from a photo (tesseract.js, runs on the server) ---------- */
export async function ocrImage(dataUrl: string) {
  const m = /^data:image\/(png|jpe?g|webp|bmp|gif);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) throw new AppError(400, 'BAD_IMAGE', 'Send the image as a base64 data URL (png, jpg or webp)');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length > 6 * 1024 * 1024) throw new AppError(413, 'TOO_LARGE', 'Image must be under 6 MB');
  const { recognize } = await import('tesseract.js');
  const r = await recognize(buf, 'eng');
  const text = (r.data.text || '').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
  return { text, confidence: Math.round(r.data.confidence ?? 0) };
}

/* ---------- AI teacher: step-by-step explanation (needs OPENAI_API_KEY; otherwise the Page uses its built-in solver) ---------- */
export async function explainDoubt(question: string) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new AppError(501, 'AI_NOT_CONFIGURED', 'Set OPENAI_API_KEY in .env to enable AI explanations');
  const prompt = `You are a friendly CBSE Class 9-10 maths teacher. Explain the student's question step by step in simple English.
Return ONLY JSON: {"title": string, "steps": [{"title": string, "text": string, "example": string}], "answer": string}. 3-8 steps. Use symbols like √, ², π (no LaTeX).
Question: ${question}`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.2, response_format: { type: 'json_object' }, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new AppError(502, 'AI_FAILED', `AI service error ${res.status}`);
  const j: any = await res.json();
  try { return JSON.parse(j.choices[0].message.content); } catch { throw new AppError(502, 'AI_BAD_JSON', 'AI returned an unreadable answer'); }
}

/* ---------- Mistake classifier: concept / formula / calculation ---------- */
const FORMULA_RE = /formula|area|volume|surface|perimeter|circumference|nth term|\bsum\b|distance|section|mid-?point|roots?|discriminant|mean|median|mode|heron|sin|cos|tan|identity|probability|slant|radius|hypotenuse|pythagoras|=/i;
const num = (s: string) => {
  const x = String(s ?? '').replace(/[−–]/g, '-').replace(/,/g, '').replace(/\s*(cm|m|km|units?|sq|cm²|cm³|m²|m³|°|%)\b.*$/i, '').trim();
  const f = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(x); if (f) return +f[1] / +f[2];
  return /^-?\d+(?:\.\d+)?$/.test(x) ? +x : null;
};
export function classifyMistake(q: any, answer: string, subjective?: { found: string[]; missing: string[] } | null): 'CONCEPT' | 'FORMULA' | 'CALCULATION' {
  if (q.type === 'SUBJECTIVE' && subjective) {
    if (!subjective.found.length) return 'CONCEPT';
    if (subjective.missing.every(k => /\d/.test(k) && /^[\s\d.,\-−+/√π²³°]+(cm|m|units?|sq)?$/i.test(k.trim()))) return 'CALCULATION';
    if (subjective.missing.some(k => /[=²³√π^]|formula|\bsin|\bcos|\btan/i.test(k))) return 'FORMULA';
    return 'CONCEPT';
  }
  const nR = num(q.correctAnswer), nW = num(answer), ctx = `${q.text} ${q.explanation ?? ''}`;
  if (nR != null && nW != null) {
    if (nW === -nR || (nR !== 0 && Math.abs(nW - nR) / Math.abs(nR) <= 0.15) || Math.abs(nW - nR) === 1 || (nR !== 0 && [2, 0.5, 10, 0.1].includes(nW / nR))) return 'CALCULATION';
    return FORMULA_RE.test(ctx) ? 'FORMULA' : 'CALCULATION';
  }
  if (/[=²³√π]|\^/.test(`${q.correctAnswer}${answer}`) && FORMULA_RE.test(ctx)) return 'FORMULA';
  return 'CONCEPT';
}

/* ---------- Analysis: chapter strength, strong/weak topics, mistake log ---------- */
export async function studentAnalysis(studentId: string, classNo?: number) {
  const sid = new Types.ObjectId(studentId);
  const prog: any[] = await TopicProgress.find({ student: sid }).populate({ path: 'topic', select: 'name icon slug chapter', populate: { path: 'chapter', select: 'name chapterNo subject' } }).lean();
  const chapters = new Map<string, { chapter: string; chapterNo: number; sum: number; n: number }>();
  for (const p of prog) {
    const ch = p.topic?.chapter; if (!ch) continue;
    const k = String(ch._id); const c = chapters.get(k) ?? { chapter: ch.name, chapterNo: ch.chapterNo, sum: 0, n: 0 };
    c.sum += p.mastery ?? 0; c.n += 1; chapters.set(k, c);
  }
  // average over ALL topics of each touched chapter (untouched topics count as 0%)
  const chapterRows = [];
  for (const [id, c] of chapters) {
    const total = await Topic.countDocuments({ chapter: id });
    const mastery = Math.round(c.sum / Math.max(total, 1));
    chapterRows.push({ chapterId: id, chapter: c.chapter, chapterNo: c.chapterNo, mastery, topicsStarted: c.n, topics: total, band: mastery >= 75 ? 'STRONG' : mastery >= 55 ? 'AVERAGE' : 'WEAK' });
  }
  chapterRows.sort((a, b) => a.chapterNo - b.chapterNo);
  const started = prog.filter(p => p.attempts > 0 || p.stepsDone);
  const strong = started.filter(p => p.mastery >= 75).map(p => ({ topic: p.topic?.name, icon: p.topic?.icon, mastery: p.mastery }));
  const weak = started.filter(p => p.mastery < 55).map(p => ({ topic: p.topic?.name, icon: p.topic?.icon, mastery: p.mastery }));
  const wrong: any[] = await Attempt.find({ student: sid, isCorrect: false }).sort({ createdAt: -1 }).limit(100)
    .populate({ path: 'question', select: 'text type explanation' }).populate({ path: 'topic', select: 'name', populate: { path: 'chapter', select: 'name' } }).lean();
  const counts = { CONCEPT: 0, FORMULA: 0, CALCULATION: 0 } as Record<string, number>;
  const log = wrong.map(a => { if (a.errorType) counts[a.errorType] = (counts[a.errorType] ?? 0) + 1;
    return { question: a.question?.text, yourAnswer: a.answer, errorType: a.errorType ?? null, topic: a.topic?.name, chapter: a.topic?.chapter?.name, explanation: a.question?.explanation, at: a.createdAt }; });
  const [total, correct] = await Promise.all([Attempt.countDocuments({ student: sid }), Attempt.countDocuments({ student: sid, isCorrect: true })]);
  return { classNo: classNo ?? null, accuracy: total ? Math.round((correct / total) * 100) : 0, chapters: chapterRows, strong, weak, mistakeTypes: counts, mistakes: log };
}
