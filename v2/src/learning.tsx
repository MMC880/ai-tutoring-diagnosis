import { useEffect, useState } from 'react';
import type { Student } from './intake';

const API = 'http://127.0.0.1:8019';
type Original = { sha256: string; original_name: string; pages: number | null };
type Assignment = { assignment_id: string; batch: string; assignment_date: string; questions: string[]; candidate_questions: string[]; files: Original[]; correction_revision?: number; missing_pages?: string[] };
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
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [retests, setRetests] = useState<{ id: string; tag: string; result: string; answer: string; notice: string }[]>([]);
  const [assignmentId, setAssignment] = useState('');
  const [number, setNumber] = useState('');
  const [tag, setTag] = useState('');
  const [digest, setDigest] = useState('');
  const [page, setPage] = useState(1);
  const [quote, setQuote] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [analysis, setAnalysis] = useState<{ personal: Stats; classroom: Stats & { class_name: string }; notice: string } | null>(null);
  const [generation, refresh] = useState(0);
  const assignment = assignments.find(a => a.assignment_id === assignmentId);
  const link = links.find(l => l.assignment_id === assignmentId && l.number === number);
  useEffect(() => {
    let current = true;
    setAssignments([]); setLinks([]); setFeedback([]); setRetests([]); setAnalysis(null);
    if (!student) return;
    void api(`/api/learning/workspace?student_id=${encodeURIComponent(student.id)}&subject=${subject}`)
      .then(data => { if (current) { setAssignments(data.assignments); setLinks(data.links); setFeedback(data.feedback); setRetests(data.retests); } })
      .catch(error => { if (current) setNotice(error.message); });
    void api(`/api/learning/analysis?student_id=${encodeURIComponent(student.id)}&subject=${subject}`)
      .then(data => { if (current) setAnalysis(data); }).catch(error => { if (current) setNotice(error.message); });
    return () => { current = false; };
  }, [student?.id, subject, generation]);
  useEffect(() => { setAssignment(''); setNumber(''); setTag(''); setDigest(''); setQuote(''); }, [student?.id, subject]);
  useEffect(() => {
    setTag(link?.tag || ''); setDigest(link?.evidence_hash || assignment?.files[0]?.sha256 || '');
    setPage(link?.page || 1); setQuote(link?.quote || '');
  }, [assignmentId, number, link?.revision]);
  useEffect(() => {
    if (assignment && number && ![...assignment.questions, ...assignment.candidate_questions].includes(number)) {
      setNumber(''); setTag(''); setQuote('');
    }
  }, [assignment, number]);
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
        <Correction key={`${assignmentId}/${assignment.correction_revision || 0}`} assignment={assignment} scope={{ student_id: student!.id, subject }} updated={() => refresh(g => g + 1)} />
        <label>问题题号<select aria-label="问题题号" value={number} onChange={e => setNumber(e.target.value)}><option value="">请选择题号</option>{[...new Set([...assignment.questions, ...assignment.candidate_questions])].map(q => <option key={q} value={q}>第{q}题{assignment.questions.includes(q) ? '（教师提供）' : '（AI候选）'}</option>)}</select></label>
        {number ? <>
          <label>知识点<input aria-label="知识点" placeholder="例如：二次函数顶点式" value={tag} maxLength={100} onChange={e => setTag(e.target.value)} /></label>
          <label>证据原件<select aria-label="证据原件" value={digest} onChange={e => setDigest(e.target.value)}>{assignment.files.map(f => <option key={f.sha256} value={f.sha256}>{f.original_name}</option>)}</select></label>
          <a href={`${API}/api/learning/original/${assignmentId}/${digest}`}>下载原件核对</a>
          <label>原件内页码<input aria-label="证据页码" type="number" min={1} max={500} value={page} onChange={e => setPage(Number(e.target.value))} /></label>
          <label>原图位置或老师依据<textarea aria-label="关联依据" placeholder="例如：第1页下半部第3题，学生写了…；未核实的错因不要当事实" value={quote} maxLength={2000} onChange={e => setQuote(e.target.value)} /></label>
          <div className="actions">{link?.status !== 'CONFIRMED' ? <button disabled={busy || !tag.trim() || !quote.trim()} onClick={() => void save('CANDIDATE')}>保存候选</button> : null}<button disabled={busy || !tag.trim() || !quote.trim()} onClick={() => void save('CONFIRMED')}>老师确认知识点</button></div>
          <p>{link ? `当前：${link.status === 'CONFIRMED' ? '教师确认' : '候选待确认'} · 修订${link.revision}` : '尚未关联'}。单次错误不代表长期薄弱。</p>
          {student && link?.status === 'CONFIRMED' ? <FeedbackPanel key={`${student.id}/${subject}/${assignmentId}/${number}/${link.revision}`} scope={{ student_id: student.id, subject, assignment_id: assignmentId, number }} records={feedback.filter(f => f.assignment_id === assignmentId && f.number === number)} updated={() => refresh(g => g + 1)} /> : null}
        </> : null}
      </> : <p>没有记录时，先在 AI Agent 中拖入材料并说“帮我归档”。</p>}
    </>}
    <p role="status">{notice}</p>
    {analysis ? <div data-testid="learning-analysis"><StatsView title="这个学生的复习线索" data={analysis.personal} /><StatsView title={`班级共性 · ${analysis.classroom.class_name || '班级待补'}`} data={analysis.classroom} /><p className="muted">{analysis.notice}</p></div> : null}
    {retests.length ? <details><summary>复测记录（{retests.length}）</summary>{retests.map(r => <p key={r.id}>{r.tag} · {r.result} · 作答：{r.answer}。{r.notice}</p>)}</details> : null}
  </section>;
}

function Correction({ assignment: a, scope, updated }: { assignment: Assignment; scope: { student_id: string; subject: string }; updated: () => void }) {
  const [date, setDate] = useState(a.assignment_date === '待补' ? '' : a.assignment_date);
  const [questions, setQuestions] = useState(a.questions.join('、'));
  const [missing, setMissing] = useState((a.missing_pages || []).join('\n'));
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try { await api('/api/learning/correct', { ...scope, assignment_id: a.assignment_id, assignment_date: date || '待补',
      questions: questions.trim() ? questions.trim().split(/[、,，\s]+/) : [], missing_pages: missing.split('\n').filter(v => v.trim()),
      reason, expected_revision: a.correction_revision || 0 }); setNotice('已追加更正，原始回执保留'); updated(); }
    catch (error) { setNotice(error instanceof Error ? error.message : '更正失败'); }
    finally { setBusy(false); }
  }
  return <details><summary>老师更正／补日期与缺页</summary><p>填写更正后的完整错题清单；留空表示本次不再确认任何错题，不代表整卷全对。原记录保留。</p>
    <label>作业日期<input aria-label="更正作业日期" type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
    <label>更正后错题号<input aria-label="更正后错题号" value={questions} onChange={e => setQuestions(e.target.value)} placeholder="3、5、8" /></label>
    <label>缺页或材料待补<textarea aria-label="缺页说明" value={missing} onChange={e => setMissing(e.target.value)} placeholder="每行一项，例如：第6页未提供（不算答错）" /></label>
    <label>更正理由<textarea aria-label="更正理由" value={reason} onChange={e => setReason(e.target.value)} /></label>
    <button disabled={busy || !reason.trim()} onClick={() => void save()}>追加更正并更新统计</button><p role="status">{notice}</p></details>;
}

type Feedback = { id: string; assignment_id: string; number: string; status: string; revision: number; tag: string; origin: string; explanation: string; review_advice: string; levels: { level: string; title: string; question: string; solution: string }[] };
function FeedbackPanel({ scope, records, updated }: { scope: { student_id: string; subject: string; assignment_id: string; number: string }; records: Feedback[]; updated: () => void }) {
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState('PENDING');
  const [level, setLevel] = useState('A');
  const [independent, setIndependent] = useState(false);
  const [manual, setManual] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  async function action(url: string, data: unknown) {
    setBusy(true); setNotice('正在保存…');
    try { await api(url, data); setNotice('已保存并回读，原历史保留'); if (url.endsWith('/retest')) { setAnswer(''); setRequestId(crypto.randomUUID()); } updated(); }
    catch (error) { setNotice(error instanceof Error ? error.message : '保存失败'); }
    finally { setBusy(false); }
  }
  return <section data-testid="feedback-panel"><h3>讲解、补练与复测</h3>
    <button disabled={busy} onClick={() => void action('/api/learning/feedback', scope)}>准备三级补练草稿</button>
    <details><summary>录入老师或Agent准备的三档内容</summary><p className="muted">其他知识点可用。粘贴JSON：explanation和levels，levels含A/B/C各档level、title、question、solution。保存后仍须审核。</p><textarea aria-label="手工补练内容" value={manual} onChange={e => setManual(e.target.value)} /><button disabled={busy || !manual.trim()} onClick={() => { try { const data = JSON.parse(manual); void action('/api/learning/feedback', { ...scope, explanation: data.explanation, levels: data.levels }); } catch { setNotice('内容不是有效JSON，请核对格式'); } }}>保存待审补练</button></details>
    {records.map(f => <details key={f.id} open={records.length === 1}><summary>{f.tag} · {f.status === 'APPROVED' ? '教师已审核' : f.status === 'REJECTED' ? '已退回' : '待教师审核'}</summary>
      <p>{f.origin}</p><p>{f.explanation}</p>{f.levels.map(l => <section key={l.level}><strong>{l.level}档 · {l.title}</strong><p>{l.question}</p><details><summary>教师完整解答</summary><p>{l.solution}</p></details></section>)}<p>{f.review_advice}</p>
      {f.status === 'WAITING_TEACHER' ? <div className="actions"><button disabled={busy} onClick={() => void action('/api/learning/approve', { ...scope, feedback_id: f.id, expected_revision: f.revision, approved: true })}>老师审核通过</button><button disabled={busy} onClick={() => void action('/api/learning/approve', { ...scope, feedback_id: f.id, expected_revision: f.revision, approved: false })}>退回草稿</button></div> : null}
      {f.status === 'APPROVED' ? <><label>本次练习档次<select aria-label="复测档次" value={level} onChange={e => setLevel(e.target.value)}><option>A</option><option>B</option><option>C</option></select></label><a href={`${API}/api/learning/practice/${f.id}?level=${level}`}>下载学生单档题面（无解答）</a>
        <label>复测原答<textarea aria-label="复测原答" value={answer} onChange={e => setAnswer(e.target.value)} /></label><label>老师复核结果<select aria-label="复测结果" value={result} onChange={e => setResult(e.target.value)}><option value="PENDING">待确认</option><option value="CORRECT">本次答对</option><option value="PARTIAL">部分正确</option><option value="INCORRECT">本次答错</option></select></label><label><input type="checkbox" checked={independent} onChange={e => setIndependent(e.target.checked)} />老师确认本次独立完成</label>
        <button disabled={busy || !answer.trim()} onClick={() => void action('/api/learning/retest', { ...scope, feedback_id: f.id, level, answer, result, independent, request_id: requestId })}>登记复测并保留历史</button></> : null}
    </details>)}<p role="status">{notice}</p>
  </section>;
}

type Stats = { assignment_count: number; student_count: number; undated_count: number; confirmed_question_count: number; linked_question_count: number;
  patterns: { tag: string; assignment_count: number; student_count: number; suggestion: string; evidence: { assignment_id: string; number: string; page: number; quote: string }[] }[] };
function StatsView({ title, data }: { title: string; data: Stats }) {
  return <section><h3>{title}</h3><p>覆盖{data.student_count}人 · {data.assignment_count}份作业 · 确认错题{data.confirmed_question_count}道，其中{data.linked_question_count}道已关联知识点；日期待补{data.undated_count}份。</p>
    {data.patterns.length ? data.patterns.map(p => <details key={p.tag}><summary>{p.tag} · {p.assignment_count}份作业 / {p.student_count}人</summary><p>{p.suggestion}</p>{p.evidence.map(e => <p key={e.assignment_id + e.number}>作业{e.assignment_id.slice(0, 12)} · 第{e.number}题 · 第{e.page}页：{e.quote}</p>)}</details>) : <p className="muted">尚无确认关联，不凭题号推断知识点。</p>}
  </section>;
}
