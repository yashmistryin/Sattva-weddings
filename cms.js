/* Sattva Weddings — site editor (owner/editors only) + Gallery.
   Data lives in this artifact's db: cms/text, cms/img, cms/photos, gallery/*.
   Files live in assets, served at /_blob/<id>. */
(function(){
"use strict";
const S={db:null,user:null,assets:null,canEdit:false,edit:false,text:{},img:{},photos:{dest:{},venue:{}},gal:[],galLoaded:false,galFilter:""};
const DEF={dest:JSON.parse(JSON.stringify(PHOTOS.destinations||{})),venue:JSON.parse(JSON.stringify(PHOTOS.venues||{}))};
const ORIG=new WeakMap();
const blob=id=>/^img\//.test(id)?id:"/_blob/"+encodeURIComponent(id);
const hash=s=>{let x=5381;for(let i=0;i<s.length;i++)x=((x<<5)+x+s.charCodeAt(i))|0;return(x>>>0).toString(36)};
const norm=s=>(s||"").replace(/\s+/g," ").trim();
const SEL="h1,h2,h3,h4,h5,p,li,blockquote,cite,figcaption,dt,dd,summary,small,th,td,.label,.lede,.btn,.arrow,.fbig";
const SKIP="#cmsBar,#cmsBar *,#cmsPick,form *,select,option,textarea,input,.hdr nav *,.menu .links *,.crumbs *,#toast,.drawer *,[data-nocms],[data-nocms] *,.gal *,#galAdmin *,#lb *";
const MAX=20*1024*1024;

/* ---------- sanitiser: keeps em/strong/b/i/br and safe links ---------- */
function clean(html){const t=document.createElement("template");t.innerHTML=html||"";const ok={EM:1,STRONG:1,B:1,I:1,BR:1,A:1};
 const walk=n=>{[...n.childNodes].forEach(c=>{if(c.nodeType===1){walk(c);if(!ok[c.tagName]){c.replaceWith(...c.childNodes)}else{const href=c.tagName==="A"?c.getAttribute("href"):null;[...c.attributes].forEach(a=>c.removeAttribute(a.name));if(href&&/^(https?:|mailto:|tel:|#)/i.test(href))c.setAttribute("href",href)}}else if(c.nodeType!==3)c.remove()})};
 walk(t.content);return t.innerHTML.replace(/&nbsp;/g," ").replace(/\s+/g," ").trim()}

/* ---------- writes: one at a time per doc, coalesced ---------- */
const pend={};let chain=Promise.resolve();
function save(path,getData){clearTimeout(pend[path]);status("Saving…");pend[path]=setTimeout(()=>{chain=chain.then(()=>S.db.doc(path).set(getData())).then(()=>status("Saved"),e=>{status("Not saved");toast(e&&e.code==="quota_exceeded"?"Storage is full. Delete a few items and try again.":"Couldn't save. Check your connection and try again.")})},350)}

/* ---------- text ---------- */
function candidates(root){return[...root.querySelectorAll(SEL)].filter(el=>!el.matches(SKIP)&&!el.querySelector(SEL)&&norm(el.textContent))}
function setHTML(el,v){el.innerHTML=v;if(el.classList.contains("split")&&!S.edit){delete el.dataset.split;try{splitText(el)}catch(e){}}}
function applyText(root){if(!S.edit&&!Object.keys(S.text).length&&!document.querySelector("[data-cv]"))return;
 for(const el of candidates(root)){
  if(!el.dataset.ck){const sc=el.closest(".view");el.dataset.ck=(sc?sc.dataset.view:"g")+"|"+hash(norm(el.textContent))}
  if(el===document.activeElement)continue;
  const v=S.text[el.dataset.ck];
  if(v!=null){const hv=hash(v);if(el.dataset.cv!==hv){if(!ORIG.has(el))ORIG.set(el,el.innerHTML);setHTML(el,v);el.dataset.cv=hv}}
  else if(el.dataset.cv){if(ORIG.has(el))el.innerHTML=ORIG.get(el);delete el.dataset.cv}
  if(S.edit&&!el.dataset.cmsed)editable(el)}}
function editable(el){if(!ORIG.has(el))ORIG.set(el,el.innerHTML);
 if(el.dataset.split){el.innerHTML=clean(el.innerHTML)}
 el.dataset.cmsed=1;el.contentEditable="true";el.spellcheck=true}
function uneditable(){document.querySelectorAll("[data-cmsed]").forEach(el=>{el.removeAttribute("contenteditable");delete el.dataset.cmsed;if(el.classList.contains("split")){delete el.dataset.split;try{splitText(el)}catch(e){}}})}
document.addEventListener("focusout",e=>{const el=e.target;if(!S.edit||!el.dataset||!el.dataset.cmsed)return;
 const v=clean(el.innerHTML),o=clean(ORIG.get(el)||""),k=el.dataset.ck;if(!k)return;
 if(v===o||!v){if(!(k in S.text))return;delete S.text[k];delete el.dataset.cv}else{if(S.text[k]===v)return;S.text[k]=v;el.dataset.cv=hash(v)}
 save("cms/text",()=>({m:S.text}));schedule()},true);
document.addEventListener("keydown",e=>{const el=e.target;if(!S.edit||!el.dataset||!el.dataset.cmsed)return;
 if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();el.blur()}
 if(e.key==="Escape"){el.innerHTML=S.text[el.dataset.ck]!=null?S.text[el.dataset.ck]:clean(ORIG.get(el)||"");el.blur()}},true);
document.addEventListener("paste",e=>{const el=e.target.closest&&e.target.closest("[data-cmsed]");if(!S.edit||!el)return;e.preventDefault();document.execCommand("insertText",false,(e.clipboardData||window.clipboardData).getData("text/plain"))},true);
document.addEventListener("click",e=>{if(!S.edit)return;if(e.target.closest("[data-cmsed]")){e.preventDefault()}},true);

/* ---------- images ---------- */
function applyImg(root){root.querySelectorAll("img").forEach(im=>{if(im.closest("#cmsBar,.gal,#lb,#cmsPick"))return;
  if(im.dataset.co==null)im.dataset.co=im.getAttribute("src")||"";const id=S.img[im.dataset.co];const want=id?blob(id):im.dataset.co;if(im.getAttribute("src")!==want)im.setAttribute("src",want)});
 root.querySelectorAll("[data-cms-bg]").forEach(el=>{const id=S.img["bg:"+el.dataset.cmsBg];const w=id?`url("${blob(id)}")`:"";if(el.style.backgroundImage!==w)el.style.backgroundImage=w})}
function applyPhotos(){const P=PHOTOS.destinations,V=PHOTOS.venues||(PHOTOS.venues={});
 Object.keys(P).forEach(k=>{if(!DEF.dest[k])delete P[k]});Object.assign(P,JSON.parse(JSON.stringify(DEF.dest)));
 Object.keys(V).forEach(k=>delete V[k]);Object.assign(V,JSON.parse(JSON.stringify(DEF.venue)));
 Object.entries(S.photos.dest||{}).forEach(([k,ids])=>{if(ids&&ids.length)P[k]=ids.map(blob)});
 Object.entries(S.photos.venue||{}).forEach(([k,ids])=>{if(ids&&ids.length)V[k]=ids.map(blob)})}
function repaint(){document.querySelectorAll(".ph[data-ds],.ph[data-d],.ph[data-dd]").forEach(el=>{const s=el.dataset.ds||el.dataset.d||el.dataset.dd;const d=DESTS.find(x=>x.s===s);if(!d)return;
  if(el.dataset.ds&&!el.querySelector(":scope>img,:scope>canvas"))return;
  el.querySelectorAll(":scope>img,:scope>canvas").forEach(n=>n.remove());el.classList.remove("has-photo");destVisual(el,d,+el.dataset.i||0)});
 const r=parse();if(r.v==="dest"||r.v==="venue"){const y=scrollY;(r.v==="dest"?renderDest:renderVenue)(r.id);arm($(`.view[data-view="${r.v}"]`));scrollTo(0,y)}}

/* ---------- uploads ---------- */
function pickFiles(accept,multiple){return new Promise(res=>{const i=document.createElement("input");i.type="file";i.accept=accept;i.multiple=!!multiple;i.id="cmsPick";i.style.display="none";document.body.appendChild(i);i.onchange=()=>{res([...i.files]);i.remove()};i.click()})}
async function upload(f){if(f.size>MAX){toast(`${f.name} is over 20 MB. Compress it and try again.`);return null}
 try{const r=await S.assets.upload(f);return r}catch(e){toast(e&&e.code==="quota_exceeded"?"Upload space is full.":`Couldn't upload ${f.name}.`);return null}}

/* floating "replace photo" pill */
let hoverT=null;const pill=document.createElement("button");pill.id="cmsPill";pill.type="button";pill.textContent="Replace photo";pill.hidden=true;
document.addEventListener("pointerover",e=>{if(!S.edit)return;if(e.target.closest("#cmsPill"))return;
 const t=e.target.closest("img,[data-cms-bg],.ph[data-ds],.ph[data-d],.ph[data-dd],.vhero-ph");
 if(!t||t.closest("#cmsBar,.gal,#lb,.hdr nav")){return}
 const host=t.tagName==="IMG"&&t.parentElement.matches(".ph,.vhero-ph")?t.parentElement:t;
 const r=host.getBoundingClientRect();if(r.width<40||r.height<30)return;hoverT=host;
 pill.style.top=Math.max(8,r.top+12)+"px";pill.style.left=(r.left+12)+"px";pill.hidden=false},true);
addEventListener("scroll",()=>{pill.hidden=true},{passive:true});
pill.onclick=async()=>{const t=hoverT;pill.hidden=true;if(!t)return;
 const [f]=await pickFiles("image/*");if(!f)return;status("Uploading…");const r=await upload(f);if(!r){status("");return}
 const vh=t.closest(".vhero-ph");const r0=parse();
 if(vh&&r0.v==="venue"){S.photos.venue[r0.id]=[r.id];savePhotos();return}
 const dsEl=t.matches(".ph[data-ds],.ph[data-d],.ph[data-dd]")?t:null;
 if(dsEl){const s=dsEl.dataset.ds||dsEl.dataset.d||dsEl.dataset.dd;const cur=(S.photos.dest[s]||DEF.dest[s]||[]).slice();const i=+dsEl.dataset.i||0;
   cur[Math.min(i,cur.length)]=r.id;S.photos.dest[s]=cur;savePhotos();return}
 if(t.dataset.cmsBg){S.img["bg:"+t.dataset.cmsBg]=r.id}else{const im=t.tagName==="IMG"?t:t.querySelector("img");if(!im)return;if(im.dataset.co==null)im.dataset.co=im.getAttribute("src")||"";S.img[im.dataset.co]=r.id}
 applyImg(document.body);save("cms/img",()=>({m:S.img}))};
function savePhotos(){applyPhotos();repaint();save("cms/photos",()=>({dest:S.photos.dest,venue:S.photos.venue}))}

/* ---------- editor bar ---------- */
const bar=document.createElement("div");bar.id="cmsBar";bar.hidden=true;bar.innerHTML=`<button type="button" class="cb-main" id="cbToggle">Edit site</button><span class="cb-tip">Click any text to edit it. Hover a photo to replace it. Enter saves; Esc cancels.</span><button type="button" class="cb-b" id="cbReset">Reset this page</button><span class="cb-st" id="cbSt" aria-live="polite"></span>`;
function status(m){const s=$("#cbSt");if(s){s.textContent=m;clearTimeout(status.t);if(m==="Saved")status.t=setTimeout(()=>s.textContent="",2200)}}
function setEdit(on){S.edit=on;document.body.classList.toggle("cms-edit",on);$("#cbToggle").textContent=on?"Done":"Edit site";bar.classList.toggle("on",on);pill.hidden=true;
 if(on){toast("Editing on. Changes save automatically.");applyAll()}else{if(document.activeElement&&document.activeElement.dataset&&document.activeElement.dataset.cmsed)document.activeElement.blur();uneditable();applyAll()}}
let resetArm=0;
function bindBar(){$("#cbToggle").onclick=()=>setEdit(!S.edit);
 $("#cbReset").onclick=()=>{const b=$("#cbReset");if(Date.now()-resetArm>3000){resetArm=Date.now();b.textContent="Tap again to reset";setTimeout(()=>b.textContent="Reset this page",3000);return}
  b.textContent="Reset this page";const r=parse();const view=r.v;let n=0;
  Object.keys(S.text).forEach(k=>{if(k.startsWith(view+"|")){delete S.text[k];n++}});
  document.querySelectorAll(`.view[data-view="${view}"] img[data-co]`).forEach(im=>{if(S.img[im.dataset.co]){delete S.img[im.dataset.co];n++}});
  if(view==="home"&&S.img["bg:hero"]){delete S.img["bg:hero"];n++}
  if(view==="dest"&&S.photos.dest[r.id]){delete S.photos.dest[r.id];n++;savePhotos()}
  if(view==="venue"&&S.photos.venue[r.id]){delete S.photos.venue[r.id];n++;savePhotos()}
  save("cms/text",()=>({m:S.text}));save("cms/img",()=>({m:S.img}));
  uneditable();document.querySelectorAll("[data-cv]").forEach(el=>{if(ORIG.has(el)&&!S.text[el.dataset.ck]){el.innerHTML=ORIG.get(el);delete el.dataset.cv}});applyAll();toast(n?"Page reset to the original.":"Nothing to reset on this page.")}}

/* ---------- apply loop ---------- */
let raf=0;function schedule(){if(raf)return;raf=requestAnimationFrame(()=>{raf=0;applyAll()})}
function applyAll(){try{applyText(document.body);applyImg(document.body)}catch(e){}}
const _arm=arm;arm=function(r){_arm(r);applyAll()};

/* ================= Gallery ================= */
const SEED=[["img/aarti-gold.jpg","Evening aarti, gold hour"],["img/mehendi-drapes.jpg","Mehendi under drapes"],["img/marigold-arch.jpg","Marigold arch entrance"],["img/stage-night.jpg","Reception stage at night"],["img/aarti-blue.jpg","Blue-hour ceremony"],["img/favours.jpg","Hand-finished favours"]];
const ytId=u=>{const m=String(u).match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/)||String(u).trim().match(/^([\w-]{11})$/);return m?m[1]:null};
function galItems(){if(S.gal.length)return S.gal;return SEED.map(([src,cap],i)=>({id:"seed"+i,type:"image",src,cap,seed:true}))}
function srcOf(it){return it.src||blob(it.asset)}
function renderGal(){const g=$("#galGrid");if(!g)return;const all=galItems();
 const nP=all.filter(x=>x.type==="image").length,nF=all.length-nP;
 $("#galCats").innerHTML=[["","All",all.length],["image","Photographs",nP],["film","Films",nF]].map(([k,l,n])=>`<button class="cat-chip" data-gf="${k}" aria-pressed="${S.galFilter===k}">${l} <small>${n}</small></button>`).join("");
 const list=all.filter(x=>!S.galFilter||(S.galFilter==="image"?x.type==="image":x.type!=="image"));
 const ad=S.canEdit&&S.assets;
 g.innerHTML=list.length?list.map((it,i)=>{const cap=esc(it.cap||"");let media;
   if(it.type==="image")media=`<img src="${esc(srcOf(it))}" alt="${cap||"Sattva wedding photograph"}" loading="lazy">`;
   else if(it.type==="video")media=`<video src="${esc(srcOf(it))}#t=0.5" muted playsinline preload="metadata"></video><span class="gplay" aria-hidden="true"></span>`;
   else media=CONFIG.EMBED_VIDEO?`<div class="gyt" style="background:#17120d url('https://i.ytimg.com/vi/${esc(it.yt)}/hqdefault.jpg') center/cover"><span class="gplay" aria-hidden="true"></span><small>Film</small></div>`:`<div class="gyt"><span class="gplay" aria-hidden="true"></span><small>Film · YouTube</small></div>`;
   const ctl=ad&&!it.seed?`<div class="gctl"><input aria-label="Caption" placeholder="Add a caption" value="${cap}" data-cap="${it.id}"><button type="button" data-mv="-1" data-id="${it.id}" aria-label="Move earlier">←</button><button type="button" data-mv="1" data-id="${it.id}" aria-label="Move later">→</button><button type="button" data-del="${it.id}" aria-label="Delete">Delete</button></div>`:"";
   return`<figure class="gi gi-${it.type}"><button type="button" class="gopen" data-open="${i}" aria-label="Open ${cap||"item"}">${media}</button>${cap&&!ctl?`<figcaption>${cap}</figcaption>`:""}${ctl}</figure>`}).join(""):`<p class="empty">Nothing here yet.</p>`;
 g._list=list;
 const note=$("#galNote");if(note)note.hidden=!(ad&&!S.gal.length)}
document.addEventListener("click",async e=>{
 const f=e.target.closest("[data-gf]");if(f){S.galFilter=f.dataset.gf;renderGal();return}
 const o=e.target.closest("[data-open]");if(o){openLB(+o.dataset.open);return}
 const mv=e.target.closest("[data-mv]");if(mv){await move(mv.dataset.id,+mv.dataset.mv);return}
 const del=e.target.closest("[data-del]");if(del){if(del.dataset.arm!=="1"){del.dataset.arm="1";del.textContent="Confirm";setTimeout(()=>{del.dataset.arm="";del.textContent="Delete"},3000);return}
  const it=S.gal.find(x=>x.id===del.dataset.del);if(!it)return;try{await S.db.doc("gallery/"+it.id).delete();if(it.asset){try{await S.assets.delete(it.asset)}catch(_){}}toast("Removed from the gallery.")}catch(_){toast("Couldn't delete. Try again.")}}});
document.addEventListener("change",e=>{const c=e.target.closest("[data-cap]");if(!c)return;const id=c.dataset.cap;S.db.doc("gallery/"+id).update({cap:c.value.trim().slice(0,160)}).then(()=>toast("Caption saved."),()=>toast("Couldn't save the caption."))});
async function move(id,dir){const L=S.gal;const i=L.findIndex(x=>x.id===id),j=i+dir;if(i<0||j<0||j>=L.length)return;const a=L[i],b=L[j];
 const oa=a.order??i,ob=b.order??j;try{await S.db.doc("gallery/"+a.id).update({order:ob===oa?ob+dir:ob});await S.db.doc("gallery/"+b.id).update({order:oa})}catch(_){toast("Couldn't reorder. Try again.")}}
function nextOrder(){return S.gal.length?Math.min(...S.gal.map(x=>x.order??0))-1:0}
async function addFiles(files){files=files.filter(f=>/^(image|video)\//.test(f.type));if(!files.length){toast("Choose photos or videos.");return}
 const st=$("#galSt");let ok=0;for(let k=0;k<files.length;k++){const f=files[k];st.textContent=`Uploading ${k+1} of ${files.length}…`;const r=await upload(f);if(!r)continue;
  try{await S.db.collection("gallery").add({type:f.type.startsWith("video")?"video":"image",asset:r.id,cap:"",order:nextOrder()-k,at:new Date().toISOString()});ok++}catch(e){toast(e&&e.code==="quota_exceeded"?"Gallery is full.":"Couldn't save "+f.name)}}
 st.textContent=ok?`${ok} added.`:"";setTimeout(()=>st.textContent="",3000)}
function bindGalAdmin(){const a=$("#galAdmin");if(!a)return;a.hidden=false;
 $("#galChoose").onclick=async()=>addFiles(await pickFiles("image/*,video/*",true));
 a.addEventListener("dragover",e=>{e.preventDefault();a.classList.add("drag")});a.addEventListener("dragleave",()=>a.classList.remove("drag"));
 a.addEventListener("drop",e=>{e.preventDefault();a.classList.remove("drag");addFiles([...e.dataTransfer.files])});
 $("#galYtForm").onsubmit=async e=>{e.preventDefault();const id=ytId($("#galYt").value);if(!id){toast("That doesn't look like a YouTube link.");return}
  try{await S.db.collection("gallery").add({type:"youtube",yt:id,cap:$("#galYtCap").value.trim().slice(0,160),order:nextOrder(),at:new Date().toISOString()});$("#galYt").value="";$("#galYtCap").value="";toast("Film added.")}catch(_){toast("Couldn't add the film.")}}}
/* lightbox */
let lbI=0;function openLB(i){const L=$("#galGrid")._list||[];if(!L[i])return;lbI=i;const it=L[i];const lb=$("#lb"),st=$("#lbStage");
 if(it.type==="image")st.innerHTML=`<img src="${esc(srcOf(it))}" alt="${esc(it.cap||"")}">`;
 else if(it.type==="video")st.innerHTML=`<video src="${esc(srcOf(it))}" controls autoplay playsinline></video>`;
 else if(CONFIG.EMBED_VIDEO)st.innerHTML=`<div class="lbv"><iframe src="https://www.youtube-nocookie.com/embed/${esc(it.yt)}?autoplay=1&rel=0&modestbranding=1" title="${esc(it.cap||"Film")}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
 else st.innerHTML=`<div class="lbyt"><p>Films play in the page on the live site.</p><a class="btn" href="https://www.youtube.com/watch?v=${esc(it.yt)}" target="_blank" rel="noopener">Watch the film</a></div>`;
 $("#lbCap").textContent=it.cap||"";lb.hidden=false;requestAnimationFrame(()=>lb.classList.add("on"));document.body.style.overflow="hidden";$("#lbClose").focus()}
function closeLB(){const lb=$("#lb");lb.classList.remove("on");$("#lbStage").innerHTML="";document.body.style.overflow="";setTimeout(()=>lb.hidden=true,300)}
function stepLB(d){const L=$("#galGrid")._list||[];if(!L.length)return;openLB((lbI+d+L.length)%L.length)}
function bindLB(){$("#lbClose").onclick=closeLB;$("#lbPrev").onclick=()=>stepLB(-1);$("#lbNext").onclick=()=>stepLB(1);
 $("#lb").addEventListener("click",e=>{if(e.target.id==="lb")closeLB()});
 addEventListener("keydown",e=>{if($("#lb").hidden)return;if(e.key==="Escape")closeLB();if(e.key==="ArrowLeft")stepLB(-1);if(e.key==="ArrowRight")stepLB(1)})}

/* ================= boot ================= */
document.body.appendChild(bar);document.body.appendChild(pill);bindBar();bindLB();renderGal();
addEventListener("hashchange",()=>{if(parse().v==="gallery")renderGal()});
(async function(){if(!window.claude||!claude.use)return;
 try{S.db=await claude.use("db")}catch(e){S.db=null}if(!S.db)return;
 try{S.user=await claude.use("user")}catch(e){}
 try{S.canEdit=!!(S.user&&((await S.user.isOwner())||(await S.user.canEdit())))}catch(e){S.canEdit=false}
 if(S.canEdit){try{S.assets=await claude.use("assets")}catch(e){}}
 const onErr=()=>{};
 S.db.doc("cms/text").onSnapshot(s=>{S.text=(s.exists&&s.data().m)?{...s.data().m}:{};schedule()},onErr);
 S.db.doc("cms/img").onSnapshot(s=>{S.img=(s.exists&&s.data().m)?{...s.data().m}:{};schedule()},onErr);
 S.db.doc("cms/photos").onSnapshot(s=>{const d=s.exists?s.data():{};S.photos={dest:{...(d.dest||{})},venue:{...(d.venue||{})}};applyPhotos();repaint()},onErr);
 S.db.collection("gallery").onSnapshot(s=>{S.gal=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.order??0)-(b.order??0)||String(b.at).localeCompare(String(a.at)));S.galLoaded=true;renderGal()},onErr);
 new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});
 if(S.canEdit){bar.hidden=false;if(S.assets)bindGalAdmin();renderGal()}
})();
})();
