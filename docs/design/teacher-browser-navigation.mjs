// Exercise visible parent controls; never rewrite the application's view or student state.
export async function revealViewControl(selector,{evaluate,click,until}){
 const route=selector.match(/^\[data-view=(ai|teaching|backup|pilot|intake|review|practice|queue)\]$/)?.[1];
 if(!route||await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`))return;
 const parents=['ai','teaching','backup','pilot'].includes(route)?['.settings-nav [data-view=settings]']:route==='queue'?['.main-nav [data-view=profile]']:route==='practice'?['.main-nav [data-view=registration]','.workspace-subnav [data-view=review]']:['.main-nav [data-view=registration]'];
 for(const parent of parents){await until(`!!document.querySelector(${JSON.stringify(parent)})`);await click(parent);}
 await until(`!!document.querySelector(${JSON.stringify(selector)})`);
}
export async function openRegistrationPaper(id,{evaluate,click,until}){
 const source=await evaluate(`fetch('/api/papers/'+${JSON.stringify(id)}).then(r=>{if(!r.ok)throw Error('无法读取合成目标卷');return r.json()})`);
 await click('.main-nav [data-view=registration]');await until("!!document.querySelector('#registration-page')");
 await evaluate("(()=>{const input=document.querySelector('#profile-student-search');input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));})()");
 await click('[data-action=registration-select][data-student="'+source.student_id+'"]');
 await until(`!!document.querySelector('.registration-paper[data-paper="${id}"]')`);
 await click('.registration-paper[data-paper="'+id+'"] [data-action=registration-open]');
 await until(`document.querySelector('#paper-select')?.value===${JSON.stringify(id)}&&!!document.querySelector('#questions')`);
}
