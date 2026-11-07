"""One-shot exact source edits; never reads local records or credentials."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / 'app'

def replace(path, before, after):
    text = path.read_text(encoding='utf-8')
    assert text.count(before) == 1, (path.name, before[:70], text.count(before))
    path.write_text(text.replace(before, after, 1), encoding='utf-8')

replace(ROOT/'web/app.js', 'function questionHTML(q){', 'function baseQuestionHTML(q){')
replace(ROOT/'web/app.js', 'function reviewFooter(p){',
        "function questionHTML(q){return baseQuestionHTML(q).replace('</article>',gradingHTML(q)+'</article>');}\nfunction reviewFooter(p){")
replace(ROOT/'web/app.js', " if(view==='review'&&p)await renderPhotoProgress(p);",
        " if(view==='review'&&p){$$('#questions .question').forEach(gradingRefresh);await renderPhotoProgress(p);}")
replace(ROOT/'web/app.js', " if(action.startsWith('photo-'))return photoHandle(action,el);",
        " if(action.startsWith('grading-'))return gradingHandle(action,el);\n if(action.startsWith('photo-'))return photoHandle(action,el);")
replace(ROOT/'web/app.js', " if(e.matches('.question [data-field]'))changed();",
        " if(e.matches('.question [data-field]')){gradingInput(e);changed();}")
replace(ROOT/'web/app.js', "if(ev.target.matches('.question [data-field]'))changed();",
        "if(ev.target.matches('.question [data-field]')){gradingInput(ev.target);changed();}")
replace(ROOT/'web/app.js', '当前为本地录入与教师核对模式。图片不自动识别；候选判断、知识点和错因可人工修改。未确认内容不进入学情统计。',
        '以老师已批改的作业为主：对照原件录入老师原判，再核对知识点。AI辅助可选，候选另列；有分歧先核清，未确认内容不进入学情统计。')
replace(ROOT/'web/app.js', 'aria-label="${esc(q.id)} 判定"', 'aria-label="${esc(q.id)} 判定" title="本次最终判定（保存与教师确认后才生效）"')
replace(ROOT/'web/app.js', '先收一份学生已经做完的作业', '先收一份老师已批改的学生作业')
replace(ROOT/'web/app.js', '收一份已完成的学生作业', '收一份老师已批改的学生作业')
replace(ROOT/'web/app.js', '本地试用版 0.8', '本地试用版 0.9')
replace(ROOT/'web/index.html', '<script src="/app.js"></script>', '<script src="/grading-panel.js"></script><script src="/app.js"></script>')
# The static allowlist uses compact spacing in this project.
replace(ROOT/'server.py', "'/continuation-panel.js':'continuation-panel.js',", "'/continuation-panel.js':'continuation-panel.js','/grading-panel.js':'grading-panel.js',")
replace(ROOT/'server.py', "version='0.8.0'", "version='0.9.0'")
