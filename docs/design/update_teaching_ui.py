from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]/'app'

def replace(path,before,after):
    source=path.read_text(encoding='utf-8');assert source.count(before)==1,(path.name,before[:60],source.count(before))
    path.write_text(source.replace(before,after,1),encoding='utf-8')

app=ROOT/'web/app.js'
replace(app,"ai:['AI服务','本机配置，先预览外发内容，再逐次授权']};","ai:['AI服务','本机配置，先预览外发内容，再逐次授权'],teaching:['教学资料库','老师资料本地整理，审核后引用到具体问题']};")
replace(app,"['▤','◉','▥','▧','⚙','✧'][i]","['▤','◉','▥','▧','⚙','✧','▦'][i]")
replace(app,"view==='backup'?await backupPage():!p?emptyPage()","view==='backup'?await backupPage():view==='teaching'?await teachingPage():!p?emptyPage()")
replace(app,"gradingHTML(q)+'</article>'","gradingHTML(q)+teachingQuestionHTML(q)+'</article>'")
replace(app,"if(view==='review'&&p){$$('#questions .question').forEach(gradingRefresh);await renderPhotoProgress(p);}",
        "if(view==='review'&&p){$$('#questions .question').forEach(gradingRefresh);await Promise.all([renderPhotoProgress(p),teachingRenderLinks(p)]);}")
replace(app,"if(action.startsWith('archive-'))return archiveHandle(action,el);","if(action.startsWith('teaching-'))return teachingHandle(action,el);\n if(action.startsWith('archive-'))return archiveHandle(action,el);")
replace(app,"q[x.dataset.field]=x.type==='checkbox'?x.checked:x.value","q[x.dataset.field]=x.dataset.field==='teaching_ref'?JSON.parse(x.value):x.type==='checkbox'?x.checked:x.value")
replace(app,'本地试用版 0.10','本地试用版 0.11')
replace(ROOT/'web/index.html','<script src="/app.js"></script>','<script src="/teaching-panel.js"></script><script src="/app.js"></script>')
replace(ROOT/'server.py',"'/archive-panel.js':'archive-panel.js',","'/archive-panel.js':'archive-panel.js','/teaching-panel.js':'teaching-panel.js',")
replace(ROOT/'server.py',"version='0.10.0'","version='0.11.0'")
