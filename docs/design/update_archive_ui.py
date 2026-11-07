from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]/'app'

def replace(path,before,after):
    source=path.read_text(encoding='utf-8')
    assert source.count(before)==1,(path.name,before[:60],source.count(before))
    path.write_text(source.replace(before,after,1),encoding='utf-8')

app=ROOT/'web/app.js'
source=app.read_text(encoding='utf-8')
start=source.index('function profilePage(p){');end=source.index('function classPage(p){',start)
source=source[:start]+"function profilePage(p){return archiveProfilePage(p);}\n"+source[end:]
app.write_text(source,encoding='utf-8')
replace(app,'let busy=false;','let busy=false,renderEpoch=0;')
replace(app,' const p=paper();dirty=false;',' const epoch=++renderEpoch,p=paper(),sourceView=view;dirty=false;')
replace(app," if(view==='profile'&&p)currentProfile=await api('profiles/'+p.student_id);",
        " if(view==='profile'&&p){const profile=await api('profiles/'+p.student_id);if(epoch!==renderEpoch||view!==sourceView||paperId!==p.id)return;currentProfile=profile;}")
replace(app," $('#app').innerHTML=`<div class=\"shell\">"," const markup=`<div class=\"shell\">")
replace(app," if(view==='review'&&p){$('.panel-head', $('#questions').parentElement)",
        " if(epoch!==renderEpoch||view!==sourceView||p?.id!==paper()?.id)return;$('#app').innerHTML=markup;\n if(view==='review'&&p){$('.panel-head', $('#questions').parentElement)")
replace(app," if(action.startsWith('grading-'))return gradingHandle(action,el);",
        " if(action.startsWith('archive-'))return archiveHandle(action,el);\n if(action.startsWith('grading-'))return gradingHandle(action,el);")
replace(app," if(e.id==='exercise-version'){", " if(e.id==='profile-student-select')return await archiveSelect(e);\n if(e.id==='exercise-version'){")
replace(app,'本地试用版 0.9','本地试用版 0.10')
replace(ROOT/'web/index.html','<script src="/app.js"></script>','<script src="/archive-panel.js"></script><script src="/app.js"></script>')
replace(ROOT/'server.py',"'/grading-panel.js':'grading-panel.js',","'/grading-panel.js':'grading-panel.js','/archive-panel.js':'archive-panel.js',")
replace(ROOT/'server.py',"version='0.9.0'","version='0.10.0'")
replace(ROOT/'web/learning-panel.js', '<p><button data-action="learning-open"',
        '<p><button data-action="archive-open" data-student="${esc(profile.student.id)}" data-event="${e.event_id}">回看当次确认</button> <button data-action="learning-open"')
