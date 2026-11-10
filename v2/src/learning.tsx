import { useEffect, useState } from 'react';
import type { Student } from './intake';

const API = 'http://127.0.0.1:8019';
type Original = { sha256: string; original_name: string; pages: number | null };
type Assignment = { assignment_id: string; batch: string; assignment_date: string; questions: string[]; candidate_questions: string[]; files: Original[] };
type Link = { assignment_id: string; number: string; tag: string; status: string; revision: number; evidence_hash: string; page: number; quote: string };
export async function api(url: string, body?: unknown) {
  const response = await fetch(API + url, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw Error(typeof data.detail === 'string' ? data.detail : '本地处理失败，请重试');
  return data;
}

export function LearningPanel({ student, subject }: { student: Student | null; subject: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [assignmentId, setAssignment] = useState('');
  const [number, setNumber] = useState('');
  const [tag, setTag] = useState('');
  const [digest, setDigest] = useState('');
  const [page, setPage] = useState(1);
  const [quote, setQuote] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [generation, refresh] = useState(0);
  const assignment = assignments.find(a => a.assignment_id === assignmentId);
  const link = links.find(l => l.assignment_id === assignmentId && l.number === number);
  useEffect(() => {
    let current = true;
    setAssignments([]); setLinks([]); setNotice('');
    if (!student) return;
    void api(`/api/learning/workspace?student_id=${encodeURIComponent(student.id)}&subject=${subject}`)
      .then(data => { if (current) { setAssignments(data.assignments); setLinks(data.links); } })
      .catch(error => { if (current) setNotice(error.message); });
    return () => { current = false; };
  }, [student?.id, subject, generation]);
  useEffect(() => { setAssignment(''); setNumber(''); setTag(''); setDigest(''); setQuote(''); }, [student?.id, subject]);
  useEffect(() => {
    setTag(link?.tag || ''); setDigest(link?.evidence_hash || assignment?.files[0]?.sha256 || '');
    setPage(link?.page || 1); setQuote(link?.quote || '');
  }, [assignmentId, number, link?.revision]);
  async function save(status: string) {
    if (!student || !assignment) return;
    setBusy(true); setNotice('正在保存并回读…');
    try {
      const result = await api('/api/learning/link', { student_id: student.id, subject, assignment_id: assignmentId, number,
        tag, evidence_hash: digest, page, quote, status, expected_revision: link?.revision || 0 });
      setNotice(`已保存修订${result.revision}：${status === 'CONFIRMED' ? '教师确认关联' : '候选待确认'}；旧记录保留`);
      refresh(g => g + 1);
    } catch (error) { setNotice(error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(false); }
  }
  return <section className="learning-panel" data-testid="learning-panel">
    <h2>知识点与复习</h2><p className="muted">先选学生，再选已归档作业。题号来自老师记录；看原件后补知识点，不强求整卷识别。</p>
    {!student ? <p>请先选择学生</p> : <>
      <button disabled={busy} onClick={() => refresh(g => g + 1)}>刷新作业记录</button>
      <label>作业<select aria-label="学习作业" value={assignmentId} onChange={e => { setAssignment(e.target.value); setNumber(''); }}><option value="">请选择作业</option>{assignments.map(a => <option key={a.assignment_id} value={a.assignment_id}>{a.assignment_date} · {a.batch}</option>)}</select></label>
      {assignment ? <>
        <label>问题题号<select aria-label="问题题号" value={number} onChange={e => setNumber(e.target.value)}><option value="">请选择题号</option>{[...new Set([...assignment.questions, ...assignment.candidate_questions])].map(q => <option key={q} value={q}>第{q}题{assignment.questions.includes(q) ? '（教师提供）' : '（AI候选）'}</option>)}</select></label>
        {number ? <>
          <label>知识点<input aria-label="知识点" placeholder="例如：二次函数顶点式" value={tag} maxLength={100} onChange={e => setTag(e.target.value)} /></label>
          <label>证据原件<select aria-label="证据原件" value={digest} onChange={e => setDigest(e.target.value)}>{assignment.files.map(f => <option key={f.sha256} value={f.sha256}>{f.original_name}</option>)}</select></label>
          <a href={`${API}/api/learning/original/${assignmentId}/${digest}`}>下载原件核对</a>
          <label>原件内页码<input aria-label="证据页码" type="number" min={1} max={500} value={page} onChange={e => setPage(Number(e.target.value))} /></label>
          <label>原图位置或老师依据<textarea aria-label="关联依据" placeholder="例如：第1页下半部第3题，学生写了…；未核实的错因不要当事实" value={quote} maxLength={2000} onChange={e => setQuote(e.target.value)} /></label>
          <div className="actions">{link?.status !== 'CONFIRMED' ? <button disabled={busy || !tag.trim() || !quote.trim()} onClick={() => void save('CANDIDATE')}>保存候选</button> : null}<button disabled={busy || !tag.trim() || !quote.trim()} onClick={() => void save('CONFIRMED')}>老师确认知识点</button></div>
          <p>{link ? `当前：${link.status === 'CONFIRMED' ? '教师确认' : '候选待确认'} · 修订${link.revision}` : '尚未关联'}。单次错误不代表长期薄弱。</p>
        </> : null}
      </> : <p>没有记录时，先在 AI Agent 中拖入材料并说“帮我归档”。</p>}
    </>}
    <p role="status">{notice}</p>
  </section>;
}
