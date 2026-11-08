// Exercise visible parent controls; never rewrite the application's view or student state.
export async function revealViewControl(selector,{evaluate,click,until}){
 const route=selector.match(/^\[data-view=(ai|teaching|backup|pilot|review|practice|queue)\]$/)?.[1];
 if(!route||await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`))return;
 const parents=['ai','teaching','backup','pilot'].includes(route)?['.settings-nav [data-view=settings]']:route==='queue'?['.main-nav [data-view=profile]']:route==='practice'?['.main-nav [data-view=intake]','.workspace-subnav [data-view=review]']:['.main-nav [data-view=intake]'];
 for(const parent of parents){await until(`!!document.querySelector(${JSON.stringify(parent)})`);await click(parent);}
 await until(`!!document.querySelector(${JSON.stringify(selector)})`);
}
