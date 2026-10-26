const sourceContent = window.hubeiContent;
const sourceIndustryIndex = new Map(sourceContent.industries.map(industry=>[industry.id,industry]));
const sourceCityIndustryIndex = new Map(sourceContent.cityIndustries.map(profile=>[`${profile.cityId}:${profile.industryId}`,profile]));
const sourceCompanySearchIndex = new Map();
const companyDirectoryState = {query:'',industry:'all',city:'all',collection:'all',page:1};
let cityIndustryDialogTrigger = null;

function escapeText(value){
  return String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}

function initializeSourceContent(){
  for(const industry of sourceContent.industries){
    const existing=industries.find(item=>item.id===industry.id);
    const values={...industry,status:'原站图文已收录',introEn:'The original Chinese profile is available below. English translation is pending.'};
    if(existing)Object.assign(existing,values);
    else industries.push(values);
  }
  for(const imported of sourceContent.companies){
    const existing=companies.find(company=>company.id===imported.id);
    const sectorNames=imported.industryIds.map(id=>sourceIndustryIndex.get(id)?.name).filter(Boolean);
    const cityNames=imported.cityIds.map(id=>cityById(id)?.name).filter(Boolean);
    const values={...imported,aliases:[...new Set([...(imported.aliases||[]),existing?.name,existing?.alias].filter(Boolean))],symbol:existing?.symbol||imported.name.slice(0,1),field:sectorNames.join(' · '),city:cityNames.join(' / ')};
    if(existing)Object.assign(existing,values);
    else companies.push(values);
  }
  for(const imported of sourceContent.cities){
    const existing=cityById(imported.id);
    if(existing)Object.assign(existing,imported,{region:'湖北省 · 原站城市资料',source:'原站城市专题 · 2026-10-26归档'});
  }
  for(const company of companies){
    if(!company.industryIds)company.industryIds=company.sourceKey==='optical-comms'?['laser-communications']:[];
    if(!company.cityIds)company.cityIds=[];
    sourceCompanySearchIndex.set(company.id,[company.name,...(company.aliases||[]),company.alias,company.field,...(company.tags||[]),...company.industryIds.map(id=>sourceIndustryIndex.get(id)?.name),...company.cityIds.map(id=>cityById(id)?.name)].filter(Boolean).join(' ').toLowerCase());
  }
}

function sourceCopy(htmlContent){
  return `<div class="source-rich-text" lang="zh-CN" data-preserve-text>${htmlContent||'<p>原站暂无此项正文。</p>'}</div>`;
}

function sourceLanguageNotice(){
  return language==='en'?'<p class="source-language-notice" data-preserve-text>Original Chinese content is shown below. English translation is pending.</p>':'';
}

function sourceAttribution(){
  const date=sourceContent.archivedAt.slice(0,10);
  return `<div class="source-note" data-preserve-text>${language==='en'?`Source: published content from the original Hubei Industry Atlas · Archived ${date}. Historical figures and forecasts retain their original context.`:`来源：湖北产业地图原站已发布图文 · ${date}归档。历史数据与预测保留原文口径。`}</div>`;
}

function sourceStageName(stage){
  return ({upstream:language==='en'?'Upstream':'上游',midstream:language==='en'?'Midstream':'中游',downstream:language==='en'?'Downstream':'下游'})[stage]||'';
}

function renderSourceIndustry(industry){
  const parent=industryById(industry.parentId);
  const profile=sourceIndustryIndex.get(industry.id);
  if(!profile)return `<div class="empty-state">${language==='en'?'Profile unavailable.':'行业资料暂未收录。'}</div>`;
  const relatedCities=cities.filter(city=>sourceCityIndustryIndex.has(`${city.id}:${industry.id}`));
  const relatedIndustries=profile.related.map(industryById).filter(Boolean);
  return `${backLink(`industry/${parent.id}`,language==='en'?`Back to ${parent.name}`:`返回${parent.name}`)}
  <div class="detail-heading"><div class="view-kicker">${language==='en'?'SECONDARY INDUSTRY PROFILE':'二级行业专题'} · ${escapeText(parent.name)}</div><h1>${escapeText(industry.name)}</h1><p data-preserve-text>${escapeText(industry.intro)}</p><div class="tag-list"><a class="tag" href="#industry/${parent.id}">${escapeText(parent.name)}</a><span class="tag">${profile.companies.length} ${language==='en'?'company records':'条企业档案'}</span></div></div>
  <div class="source-profile-grid"><section class="panel detail-card source-profile-introduction"><h2>${language==='en'?'Industry overview':'行业介绍'}</h2>${sourceLanguageNotice()}${sourceCopy(profile.introductionHtml)}</section><aside class="panel detail-card source-profile-aside"><h2>${language==='en'?'City presence':'城市布局'}</h2><p>${language==='en'?'Open a city to read its local industry profiles.':'进入城市专题，查看该行业在当地的发展介绍。'}</p><div class="relation-pills">${relatedCities.map(city=>`<a href="#city/${city.id}">${escapeText(language==='en'?(mapCityNamesEn[city.id]||city.name):city.name)}</a>`).join('')}</div><h3>${language==='en'?'Related industries':'关联行业'}</h3><div class="relation-pills">${relatedIndustries.map(related=>`<a href="#industry/${related.id}">${escapeText(related.name)}</a>`).join('')}</div><h3>${language==='en'?'Company directory':'企业库'}</h3>${linkTo('companies',language==='en'?'Browse all companies →':'查看全部企业 →')}</aside></div>
  <section class="section-block panel detail-card"><h2>${language==='en'?'Industry chain overview':'产业链总述'}</h2>${sourceCopy(profile.chain.overviewHtml)}</section>
  <section class="section-block source-chain-sections" aria-label="${language==='en'?'Industry chain stages':'上中下游产业链'}">${profile.chain.layers.map((layer,index)=>`<details class="panel source-chain-stage"${index===0?' open':''} data-chain-stage="${layer.id}"><summary><span><small>${String(index+1).padStart(2,'0')}</small>${sourceStageName(layer.id)}</span><span>${layer.companyIds.length} ${language==='en'?'company records':'条企业档案'}<b aria-hidden="true">＋</b></span></summary><div class="source-chain-body">${sourceCopy(layer.introductionHtml)}<h3>${language==='en'?'Companies and institutions':'相关企业与机构'}</h3>${companyCards(layer.companyIds)}</div></details>`).join('')}</section>${sourceAttribution()}`;
}

function renderSourceCity(city){
  const profiles=sourceContent.cityIndustries.filter(profile=>profile.cityId===city.id);
  return `${previousBackLink(language==='en'?'Back':'返回上级','cities')}<div class="detail-heading"><div class="view-kicker">${language==='en'?'CITY PROFILE · HUBEI':'城市专题 · 湖北'}</div><h1>${escapeText(language==='en'?(mapCityNamesEn[city.id]||city.name):city.name)}</h1><p data-preserve-text>${escapeText(city.intro)}</p><div class="tag-list"><span class="tag">${profiles.length} ${language==='en'?'local industry profiles':'个本地行业专题'}</span><span class="tag">${city.companies.length} ${language==='en'?'linked company records':'条关联企业档案'}</span></div></div>
  <section class="section-block panel detail-card city-overview"><h2>${language==='en'?'City overview':'城市介绍'}</h2>${sourceLanguageNotice()}${sourceCopy(city.introductionHtml)}</section>
  <section class="section-block panel detail-card"><div class="section-heading"><div><h2>${language==='en'?'Industries in this city':'本市行业与产业布局'}</h2><p>${language==='en'?'Select an industry to read its local introduction in a dialog.':'点击行业，在弹窗中查看本市行业介绍，再进入对应行业专题。'}</p></div></div><div class="city-industry-grid">${profiles.map(profile=>{const industry=industryById(profile.industryId);return `<button class="city-industry-card" type="button" data-city-industry="${city.id}:${profile.industryId}" aria-haspopup="dialog"><span class="city-industry-card-top"><strong>${escapeText(industry.name)}</strong><span aria-hidden="true">↗</span></span><span class="city-industry-excerpt" data-preserve-text>${escapeText(profile.summary)}</span><span class="city-industry-card-bottom">${profile.companyIds.length} ${language==='en'?'company records':'条企业档案'}<span>${language==='en'?'Read local profile':'查看本市介绍'}</span></span></button>`}).join('')}</div></section>
  <section class="section-block panel detail-card"><h2>${language==='en'?'Companies linked to this city':'本市关联企业与机构'}</h2><p>${language==='en'?'City relationships follow the source and do not necessarily indicate headquarters or registration.':'按原站明确记录的城市关联展示，不等同于企业总部或工商注册地。'}</p>${companyCards(city.companies)}</section>${sourceAttribution()}`;
}

function closeCityIndustryDialog(){
  const dialog=document.querySelector('#cityIndustryDialog');
  if(!dialog)return;
  dialog.close();
  dialog.remove();
  document.body.classList.remove('source-dialog-open');
  if(cityIndustryDialogTrigger?.isConnected)cityIndustryDialogTrigger.focus({preventScroll:true});
  cityIndustryDialogTrigger=null;
}

function openCityIndustryDialog(key,trigger){
  const profile=sourceCityIndustryIndex.get(key);
  if(!profile)return;
  closeCityIndustryDialog();
  cityIndustryDialogTrigger=trigger;
  const city=cityById(profile.cityId);
  const industry=industryById(profile.industryId);
  const dialog=document.createElement('dialog');
  dialog.id='cityIndustryDialog';
  dialog.className='city-industry-dialog';
  dialog.setAttribute('aria-labelledby','cityIndustryDialogTitle');
  dialog.innerHTML=`<header class="city-industry-dialog-head"><div><span>${language==='en'?'LOCAL INDUSTRY PROFILE':'本市行业介绍'}</span><h2 id="cityIndustryDialogTitle">${escapeText(language==='en'?(mapCityNamesEn[city.id]||city.name):city.name)} · ${escapeText(industry.name)}</h2></div><button type="button" data-close-city-industry aria-label="${language==='en'?'Close dialog':'关闭弹窗'}" autofocus>×</button></header><div class="city-industry-dialog-body">${sourceLanguageNotice()}${sourceCopy(profile.introductionHtml)}${profile.companyIds.length?`<section class="city-industry-dialog-companies"><h3>${language==='en'?'Companies in this local industry':'本市该行业企业'}</h3>${companyCards(profile.companyIds)}</section>`:''}${sourceAttribution()}</div><footer class="city-industry-dialog-footer"><button type="button" data-close-city-industry>${language==='en'?'Back to city':'返回城市'}</button><a href="#industry/${industry.id}" class="city-industry-open-profile">${language==='en'?'Open industry profile':'进入行业专题'} →</a></footer>`;
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeCityIndustryDialog()});
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const bounds=dialog.getBoundingClientRect();if(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom)closeCityIndustryDialog()});
  document.body.append(dialog);
  document.body.classList.add('source-dialog-open');
  dialog.showModal();
}

function renderSourceCompanyDirectory(query){
  if(query!==undefined&&query!==companyDirectoryState.query){companyDirectoryState.query=query;companyDirectoryState.page=1}
  const state=companyDirectoryState;
  const needle=state.query.trim().toLowerCase();
  const filtered=companies.filter(company=>(!needle||sourceCompanySearchIndex.get(company.id).includes(needle))&&(state.industry==='all'||company.industryIds.includes(state.industry))&&(state.city==='all'||company.cityIds.includes(state.city))&&(state.collection==='all'||company.sourceKey===state.collection)).sort((first,second)=>Number(Boolean(second.sourceId))-Number(Boolean(first.sourceId))||(first.sourceId||0)-(second.sourceId||0));
  const pageSize=36;
  const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
  state.page=Math.max(1,Math.min(state.page,pageCount));
  const visible=filtered.slice((state.page-1)*pageSize,state.page*pageSize);
  const industryOptions=sourceContent.industries.map(industry=>industryById(industry.id));
  const options=(items,selected)=>items.map(([value,label])=>`<option value="${value}"${value===selected?' selected':''}>${escapeText(label)}</option>`).join('');
  return `${previousBackLink(language==='en'?'Back':'返回上级')}${header(language==='en'?'HUBEI COMPANY DIRECTORY':'湖北企业与机构',language==='en'?'Company directory':'企业库',language==='en'?'All imported source profiles and the original optical communications appendix. Search and filter across industries and cities.':'收录原站全部企业档案及原有光通信分册资料，可按名称、行业、城市和资料集合筛选。',`${companies.length} ${language==='en'?'records':'条档案'}`)}
  <div class="source-directory-summary" data-preserve-text>${language==='en'?`${sourceContent.companies.length} original-site records + ${opticalCompanies().length} appendix records. Identically named source records remain separate.`:`原站 ${sourceContent.companies.length} 条 + 光通信附录 ${opticalCompanies().length} 条。同名不同来源ID分别保留，不自动合并。`}</div>
  <div class="filter-row source-company-filters"><div class="source-search-field"><label for="companySearch">${language==='en'?'Search':'搜索企业'}</label><input id="companySearch" type="search" placeholder="${language==='en'?'Company, alias, industry or city':'企业名称、简称、行业或城市'}" value="${escapeText(state.query)}"></div><div><label for="companySector">${language==='en'?'Industry':'行业'}</label><select id="companySector">${options([['all',language==='en'?'All industries':'全部行业'],...industryOptions.map(industry=>[industry.id,industry.name])],state.industry)}</select></div><div><label for="companyCity">${language==='en'?'City':'城市'}</label><select id="companyCity">${options([['all',language==='en'?'All cities':'全部城市'],...cities.map(city=>[city.id,language==='en'?(mapCityNamesEn[city.id]||city.name):city.name])],state.city)}</select></div><div><label for="companyCollection">${language==='en'?'Collection':'资料集合'}</label><select id="companyCollection">${options([['all',language==='en'?'All collections':'全部资料'],['industry-site',language==='en'?'Original website':'原站企业'],['optical-comms',language==='en'?'Optical appendix':'光通信附录']],state.collection)}</select></div><button class="source-filter-reset" type="button" data-company-reset>${language==='en'?'Reset':'重置'}</button></div>
  <p class="source-result-count" role="status">${filtered.length} ${language==='en'?'results':'条结果'} · ${language==='en'?'Page':'第'} ${state.page} / ${pageCount} ${language==='en'?'':'页'}</p><div class="company-grid source-company-grid">${visible.map(companyCard).join('')||`<div class="empty-state">${language==='en'?'No matching companies. Try another filter.':'没有符合条件的企业，请调整筛选条件。'}</div>`}</div>
  <nav class="source-pagination" aria-label="${language==='en'?'Company directory pages':'企业库分页'}"><button type="button" data-company-page="${state.page-1}"${state.page===1?' disabled':''}>← ${language==='en'?'Previous':'上一页'}</button><span>${state.page} / ${pageCount}</span><button type="button" data-company-page="${state.page+1}"${state.page===pageCount?' disabled':''}>${language==='en'?'Next':'下一页'} →</button></nav>${sourceAttribution()}`;
}

function renderSourceCompany(company){
  const industryLinks=company.industryIds.map(industryById).filter(Boolean);
  const cityLinks=company.cityIds.map(cityById).filter(Boolean);
  const stages=[...new Set(company.relations.map(relation=>relation.stage).filter(Boolean))];
  return `${previousBackLink(language==='en'?'Back':'返回上级','companies')}<div class="detail-heading"><div class="view-kicker">${language==='en'?'COMPANY PROFILE':'企业与机构档案'}</div><h1 data-preserve-text>${escapeText(company.name)}</h1><p data-preserve-text>${escapeText(company.field)}${company.city?` · ${escapeText(company.city)}`:''}</p><div class="tag-list"><span class="tag">${language==='en'?'Source record':'原站档案'} #${company.sourceId}</span>${stages.map(stage=>`<span class="tag">${sourceStageName(stage)}</span>`).join('')}</div></div>
  <div class="company-profile source-company-profile"><section class="panel detail-card"><h2>${language==='en'?'Company overview':'企业介绍'}</h2>${sourceLanguageNotice()}${sourceCopy(company.introductionHtml)}${sourceAttribution()}</section><aside class="panel detail-card source-profile-aside"><h2>${language==='en'?'Relationships and source':'关联信息与来源'}</h2><h3>${language==='en'?'Industries':'关联行业'}</h3><div class="relation-pills">${industryLinks.map(industry=>`<a href="#industry/${industry.id}">${escapeText(industry.name)}</a>`).join('')}</div><h3>${language==='en'?'Source-linked cities':'来源关联城市'}</h3><div class="relation-pills">${cityLinks.map(city=>`<a href="#city/${city.id}">${escapeText(language==='en'?(mapCityNamesEn[city.id]||city.name):city.name)}</a>`).join('')||`<span>${language==='en'?'Not specified':'原站未明确'}</span>`}</div><p>${language==='en'?'These links do not necessarily indicate headquarters or registration.':'关联城市不等同于企业总部或工商注册地。'}</p><div class="profile-stat"><b>${language==='en'?'Source identifier':'来源编号'}</b>${company.sourceId}</div><div class="profile-stat"><b>${language==='en'?'Content':'资料状态'}</b>${language==='en'?'Original Chinese content · Local demo':'原站中文图文 · 本地演示'}</div></aside></div>`;
}

document.addEventListener('click',event=>{
  const trigger=event.target.closest('[data-city-industry]');
  if(trigger){openCityIndustryDialog(trigger.dataset.cityIndustry,trigger);return}
  if(event.target.closest('[data-close-city-industry]')){closeCityIndustryDialog();return}
  const page=event.target.closest('[data-company-page]');
  if(page&&!page.disabled){companyDirectoryState.page=Number(page.dataset.companyPage);root.innerHTML=renderSourceCompanyDirectory();applyLanguage();document.querySelector('.source-company-filters')?.scrollIntoView({block:'start'});return}
  if(event.target.closest('[data-company-reset]')){Object.assign(companyDirectoryState,{query:'',industry:'all',city:'all',collection:'all',page:1});root.innerHTML=renderSourceCompanyDirectory();applyLanguage();document.querySelector('#companySearch')?.focus()}
});

document.addEventListener('error',event=>{
  if(event.target instanceof HTMLImageElement&&event.target.closest('.source-rich-text'))event.target.closest('.content-image-link')?.classList.add('is-unavailable');
},true);
