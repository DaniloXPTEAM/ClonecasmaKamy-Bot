"use strict";
(() => {
  const $ = selector => document.querySelector(selector);
  const state = {loaded:false, flowId:null, nodes:[], edges:[], integrations:[], selected:null, connectFrom:null, runs:[]};
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function api(path, options={}) {
    const cookie=document.cookie.split("; ").find(v=>v.startsWith("kamy_csrf="))?.split("=")[1]||"";
    const method=(options.method||"GET").toUpperCase(),headers={"Content-Type":"application/json",...(options.headers||{})};
    if(["POST","PUT","PATCH","DELETE"].includes(method)){try{headers["X-CSRF-Token"]=decodeURIComponent(cookie)}catch{headers["X-CSRF-Token"]=cookie}}
    const response=await fetch(path,{...options,method,headers,credentials:"same-origin"});
    const data=await response.json().catch(()=>({detail:"Resposta inválida do motor de automação."}));
    if(!response.ok)throw new Error(data.detail||"Falha na automação.");return data;
  }
  function toast(message){const el=$("#toast");if(!el)return;el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3800)}
  const labels={manual:"Manual Trigger",webhook:"Webhook Trigger",schedule:"Schedule Trigger",http:"HTTP Request",condition:"Condition",transform:"Transform",ai:"AI Agent",javascript:"JavaScript",python:"Python",log:"Log / Output"};
  const icons={manual:"◉",webhook:"↗",schedule:"◷",http:"⇧",condition:"◇",transform:"⇄",ai:"✧",javascript:"JS",python:"Py",log:"☷"};
  function defaults(type){
    const map={
      manual:{},webhook:{},schedule:{intervalSeconds:300},
      http:{method:"GET",url:"https://api.example.com",headers:{},timeoutMs:15000},
      condition:{path:"status",operator:"equals",value:"ok"},
      transform:{value:{message:"{{input.message}}"}},
      ai:{systemPrompt:"Resuma o conteúdo recebido e destaque as próximas ações."},
      javascript:{code:"return { ok: true, input };"},
      python:{code:'output = {"ok": True, "input": input}'},
      log:{}
    };return JSON.parse(JSON.stringify(map[type]||{}));
  }
  function makeNode(type,x,y){
    const index=state.nodes.length+1;
    return {id:"node-"+Date.now().toString(36)+"-"+index,type,name:labels[type]||type,x:x??80+(index%4)*270,y:y??70+(index%5)*175,config:defaults(type)};
  }
  function blankFlow(){
    state.flowId=null;state.nodes=[makeNode("manual",70,110),makeNode("http",370,110),makeNode("log",670,110)];
    state.edges=[{id:"edge-"+Date.now()+"-1",source:state.nodes[0].id,target:state.nodes[1].id},{id:"edge-"+Date.now()+"-2",source:state.nodes[1].id,target:state.nodes[2].id}];
    state.selected=state.nodes[0].id;$("#workflowName").value="Meu primeiro fluxo";$("#workflowActive").checked=false;$("#allowWorkflowCode").checked=false;$("#workflowStatus").textContent="NOVO RASCUNHO";$("#workflowRunList").innerHTML="<p>Salve e execute o workflow para ver o histórico.</p>";render();
  }
  function currentPayload(){
    return {name:$("#workflowName").value.trim(),active:$("#workflowActive").checked,allowCodeExecution:$("#allowWorkflowCode").checked,nodes:state.nodes,edges:state.edges};
  }
  function render(){
    const canvas=$("#workflowCanvas"),nodesEl=$("#workflowNodes"),svg=$("#workflowEdges");
    if(!canvas||!nodesEl||!svg)return;
    nodesEl.innerHTML=state.nodes.map(node=>'<article class="workflow-node '+(state.selected===node.id?"selected":"")+'" data-node="'+escapeHtml(node.id)+'" style="left:'+node.x+'px;top:'+node.y+'px"><button class="node-port input-port" data-port="in" data-id="'+escapeHtml(node.id)+'" title="Entrada"></button><div class="node-head" data-drag="'+escapeHtml(node.id)+'"><span class="node-icon">'+icons[node.type]+'</span><span class="node-title"><b>'+escapeHtml(node.name)+'</b><small>'+escapeHtml(labels[node.type])+'</small></span><span class="node-grip">⠿</span></div><div class="node-summary">'+escapeHtml(nodeSummary(node))+'</div><div class="node-foot"><span>'+escapeHtml(node.type.toUpperCase())+'</span><span class="node-state">● PRONTO</span></div>'+(node.type==="condition"?'<button class="node-port output-port condition-true" data-port="out" data-branch="true" data-id="'+escapeHtml(node.id)+'" title="Saída true"></button><button class="node-port output-port condition-false" data-port="out" data-branch="false" data-id="'+escapeHtml(node.id)+'" title="Saída false"></button>':'<button class="node-port output-port" data-port="out" data-id="'+escapeHtml(node.id)+'" title="Saída"></button>')+'</article>').join("");
    const w=Math.max(canvas.clientWidth,1500),h=Math.max(canvas.clientHeight,950);
    svg.setAttribute("viewBox","0 0 "+w+" "+h);svg.setAttribute("width",w);svg.setAttribute("height",h);
    const byId=Object.fromEntries(state.nodes.map(n=>[n.id,n]));
    svg.innerHTML='<defs><marker id="edgeArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#53e58b"/></marker></defs>'+state.edges.map(edge=>{
      const a=byId[edge.source],b=byId[edge.target];if(!a||!b)return "";
      const x1=a.x+236,y1=a.y+(edge.sourceHandle==="true"?45:edge.sourceHandle==="false"?88:65),x2=b.x,y2=b.y+65,curve=Math.max(45,Math.abs(x2-x1)*.45);
      return '<path class="workflow-edge" data-edge="'+escapeHtml(edge.id)+'" d="M'+x1+' '+y1+' C'+(x1+curve)+' '+y1+' '+(x2-curve)+' '+y2+' '+x2+' '+y2+'" marker-end="url(#edgeArrow)"/>';
    }).join("");
    $("#canvasEmpty").classList.toggle("hidden",state.nodes.length>0);
    renderInspector();
  }
  function nodeSummary(node){
    if(node.type==="http")return (node.config.method||"GET")+" · "+(node.config.url||"Configure URL");
    if(node.type==="schedule")return "A cada "+(node.config.intervalSeconds||300)+" segundos";
    if(node.type==="condition")return (node.config.path||"campo")+" "+(node.config.operator||"equals");
    if(node.type==="javascript"||node.type==="python")return "Código local · revisão obrigatória";
    if(node.type==="ai")return "Modelo de IA configurado pelo usuário";
    if(node.type==="webhook")return "POST "+(state.flowId?"/api/automation/webhooks/"+state.flowId:"/webhook/...");
    return node.type==="transform"?"Transformação de dados":node.type==="log"?"Registrar saída":"Início manual";
  }
  function renderInspector(){
    const root=$("#nodeInspector"),node=state.nodes.find(n=>n.id===state.selected);
    if(!node){root.innerHTML="<p>Selecione um nó no canvas para editar.</p>";return}
    root.innerHTML='<div class="inspector-node-type"><span>'+icons[node.type]+'</span><b>'+escapeHtml(labels[node.type])+'</b></div><label>Nome do nó<input id="inspectorNodeName" value="'+escapeHtml(node.name)+'" maxlength="80"></label><label>Configuração JSON<textarea id="inspectorNodeConfig" rows="15" spellcheck="false">'+escapeHtml(JSON.stringify(node.config,null,2))+'</textarea></label><div class="inspector-actions"><button id="applyNodeConfig" class="secondary-btn" type="button">Aplicar</button><button id="removeNode" class="danger-btn" type="button">Remover nó</button></div>'+(node.type==="webhook"&&state.flowId?'<div class="webhook-address"><small>URL local do webhook</small><code>/api/automation/webhooks/'+escapeHtml(state.flowId)+'</code></div>':"");
    $("#applyNodeConfig").onclick=()=>{
      try{const config=JSON.parse($("#inspectorNodeConfig").value);if(!config||Array.isArray(config)||typeof config!=="object")throw Error("A configuração precisa ser um objeto JSON.");node.name=$("#inspectorNodeName").value.trim()||labels[node.type];node.config=config;render();toast("Configuração do nó aplicada.");}
      catch(error){toast("JSON inválido: "+error.message)}
    };
    $("#removeNode").onclick=()=>{state.nodes=state.nodes.filter(n=>n.id!==node.id);state.edges=state.edges.filter(e=>e.source!==node.id&&e.target!==node.id);state.selected=state.nodes[0]?.id||null;render()};
  }
  function addNode(type){
    const node=makeNode(type,90+(state.nodes.length%4)*265,70+(state.nodes.length%5)*165);
    state.nodes.push(node);state.selected=node.id;render();toast(labels[type]+" adicionado.");
  }
  function connect(source,target,sourceHandle){
    if(source===target)return toast("Escolha dois nós diferentes.");
    if(state.edges.some(e=>e.source===source&&e.target===target))return toast("Esses nós já estão conectados.");
    state.edges.push({id:"edge-"+Date.now().toString(36),source,target,sourceHandle:sourceHandle||"default"});state.connectFrom=null;render();toast("Conexão criada. Salve o workflow para persistir.");
  }
  function bindCanvas(){
    $("#workflowNodes").addEventListener("click",event=>{
      const port=event.target.closest("[data-port]");
      if(port){const {id,port:kind}=port.dataset;if(kind==="out"){state.connectFrom={id,branch:port.dataset.branch||"default"};$("#workflowStatus").textContent="SELECIONE UMA ENTRADA";toast("Agora clique na entrada do nó de destino.");}else if(state.connectFrom){connect(state.connectFrom.id,id,state.connectFrom.branch)}else{toast("Clique primeiro em uma saída verde.");}return}
      const node=event.target.closest("[data-node]");if(node){state.selected=node.dataset.node;render()}
    });
    let drag=null;
    $("#workflowNodes").addEventListener("pointerdown",event=>{
      const head=event.target.closest("[data-drag]");if(!head||event.target.closest("button"))return;
      const node=state.nodes.find(n=>n.id===head.dataset.drag);if(!node)return;
      drag={id:node.id,startX:event.clientX,startY:event.clientY,x:node.x,y:node.y};head.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    document.addEventListener("pointermove",event=>{
      if(!drag)return;const node=state.nodes.find(n=>n.id===drag.id);if(!node)return;
      node.x=Math.max(12,drag.x+event.clientX-drag.startX);node.y=Math.max(12,drag.y+event.clientY-drag.startY);
      const el=document.querySelector('[data-node="'+CSS.escape(node.id)+'"]');if(el){el.style.left=node.x+"px";el.style.top=node.y+"px"}
      renderEdgesOnly();
    });
    document.addEventListener("pointerup",()=>{if(drag){drag=null;render()}});
    $("#workflowEdges").addEventListener("click",event=>{const path=event.target.closest("[data-edge]");if(path){state.edges=state.edges.filter(e=>e.id!==path.dataset.edge);render();toast("Conexão removida.")}});
  }
  function renderEdgesOnly(){
    const svg=$("#workflowEdges"),canvas=$("#workflowCanvas"),w=Math.max(canvas.clientWidth,1500),h=Math.max(canvas.clientHeight,950),byId=Object.fromEntries(state.nodes.map(n=>[n.id,n]));
    svg.setAttribute("viewBox","0 0 "+w+" "+h);svg.setAttribute("width",w);svg.setAttribute("height",h);
    svg.innerHTML='<defs><marker id="edgeArrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="#53e58b"/></marker></defs>'+state.edges.map(e=>{const a=byId[e.source],b=byId[e.target];if(!a||!b)return "";const x1=a.x+236,y1=a.y+(e.sourceHandle==="true"?45:e.sourceHandle==="false"?88:65),x2=b.x,y2=b.y+65,c=Math.max(45,Math.abs(x2-x1)*.45);return '<path class="workflow-edge" data-edge="'+escapeHtml(e.id)+'" d="M'+x1+' '+y1+' C'+(x1+c)+' '+y1+' '+(x2-c)+' '+y2+' '+x2+' '+y2+'" marker-end="url(#edgeArrow)"/>'}).join("");
  }
  async function loadIntegrations(){
    const data=await api("/api/automation/integrations");state.integrations=data.items||[];$("#integrationCount").textContent=state.integrations.length+" conectores / operações";
    renderIntegrations();
  }
  function renderIntegrations(){
    const query=$("#integrationSearch").value.toLowerCase();
    $("#automationIntegrations").innerHTML=state.integrations.filter(x=>(x.name+" "+x.category).toLowerCase().includes(query)).map(x=>'<button class="integration-entry" data-integration="'+escapeHtml(x.id)+'"><span class="integration-mark">'+escapeHtml(x.name.slice(0,2).toUpperCase())+'</span><span><b>'+escapeHtml(x.name)+'</b><small>'+escapeHtml(x.category)+'</small></span><i>＋</i></button>').join("")||"<p class='empty-integrations'>Nenhum serviço encontrado.</p>";
    document.querySelectorAll("[data-integration]").forEach(button=>button.onclick=()=>{const item=state.integrations.find(x=>x.id===button.dataset.integration);const node=makeNode("http");node.name=item.name+" · API";node.config={method:item.method||"GET",url:item.status==="imported"?item.baseUrl+item.path:"https://api.example.com",headers:{},service:item.service||item.name,operation:item.name,timeoutMs:15000};state.nodes.push(node);state.selected=node.id;render();toast(item.status==="imported"?item.name+" adicionada. Revise parâmetros e autenticação.":item.name+" adicionado como modelo HTTP. Configure endpoint e autenticação.")});
  }
  async function loadAiSettings(){
    const data=await api("/api/automation/settings/ai");$("#automationAiBase").value=data.baseUrl;$("#automationAiModel").value=data.model;$("#automationAiState").textContent=data.configured?"Chave configurada e criptografada localmente.":"Configure um provedor compatível com OpenAI.";
  }
  async function loadRuns(){
    if(!state.flowId)return;
    const data=await api("/api/automation/workflows/"+state.flowId+"/runs");state.runs=data.items||[];
    $("#workflowRunList").innerHTML=state.runs.length?state.runs.map(run=>'<div class="workflow-run"><span class="run-state '+escapeHtml(run.status)+'">'+escapeHtml(run.status.toUpperCase())+'</span><b>'+escapeHtml(run.source)+' · '+escapeHtml(run.nodeRuns?.length||0)+' nós</b><small>'+escapeHtml(new Date(run.startedAt).toLocaleString())+'</small><button data-run-detail="'+escapeHtml(run.id)+'">Detalhes</button></div><pre class="run-details hidden" id="run-'+escapeHtml(run.id)+'">'+escapeHtml(JSON.stringify({output:run.output,error:run.error,nodes:run.nodeRuns},null,2))+'</pre>').join(""):"<p>Nenhuma execução registrada.</p>";
    document.querySelectorAll("[data-run-detail]").forEach(btn=>btn.onclick=()=>$("#run-"+CSS.escape(btn.dataset.runDetail)).classList.toggle("hidden"));
  }
  async function load(){
    if(state.loaded)return;state.loaded=true;bindCanvas();
    try{const data=await api("/api/automation/workflows");if(data.items?.length)await openWorkflow(data.items[0].id);else blankFlow();await Promise.all([loadIntegrations(),loadAiSettings()])}
    catch(error){state.loaded=false;toast("Motor de automação indisponível: "+error.message)}
  }
  async function openWorkflow(id){
    const flow=await api("/api/automation/workflows/"+id);state.flowId=flow.id;state.nodes=flow.nodes;state.edges=flow.edges;state.selected=state.nodes[0]?.id||null;
    $("#workflowName").value=flow.name;$("#workflowActive").checked=flow.active;$("#allowWorkflowCode").checked=flow.allowCodeExecution;$("#workflowStatus").textContent=flow.active?"ATIVO":"SALVO";render();await loadRuns();
  }
  async function save(){
    const payload=currentPayload();if(!payload.name)throw Error("Dê um nome ao workflow.");
    const response=await api(state.flowId?"/api/automation/workflows/"+state.flowId:"/api/automation/workflows",{method:state.flowId?"PUT":"POST",body:JSON.stringify(payload)});
    state.flowId=response.id;$("#workflowStatus").textContent=response.active?"ATIVO · SALVO":"SALVO";render();toast("Workflow salvo localmente.");return response;
  }
  async function run(){
    if(state.nodes.some(n=>["javascript","python"].includes(n.type))&&!state.allowCodeExecution){}
    const saved=await save();
    if(state.nodes.some(n=>["javascript","python"].includes(n.type))&&!confirm("Este fluxo contém código escrito por você. Ele será executado com as permissões da sua conta local. Continuar?"))return;
    let input={};try{input=JSON.parse($("#workflowInput").value||"{}")}catch{throw Error("A entrada de teste precisa ser JSON válido.")}
    $("#workflowStatus").textContent="EXECUTANDO…";
    const result=await api("/api/automation/workflows/"+saved.id+"/run",{method:"POST",body:JSON.stringify({input})});
    $("#workflowStatus").textContent=result.status==="success"?"EXECUÇÃO CONCLUÍDA":"FALHA NA EXECUÇÃO";
    $("#workflowRunList").insertAdjacentHTML("afterbegin",'<pre class="run-details">'+escapeHtml(JSON.stringify(result,null,2))+'</pre>');
    await loadRuns();toast(result.status==="success"?"Workflow executado.":"Execução falhou: "+(result.error||"consulte os detalhes."));
  }
  function bind(){
    document.querySelectorAll("[data-node-type]").forEach(btn=>btn.onclick=()=>addNode(btn.dataset.nodeType));
    $("#newWorkflow").onclick=()=>{state.loaded=true;blankFlow()};
    $("#saveWorkflow").onclick=()=>save().catch(e=>toast(e.message));
    $("#runWorkflow").onclick=()=>run().catch(e=>toast(e.message));
    $("#deleteWorkflow").onclick=async()=>{if(!state.flowId)return blankFlow();if(!confirm("Excluir este workflow e manter o restante dos dados?"))return;await api("/api/automation/workflows/"+state.flowId,{method:"DELETE"});blankFlow();toast("Workflow excluído.")};
    $("#reloadWorkflowRuns").onclick=()=>loadRuns().catch(e=>toast(e.message));
    $("#integrationSearch").oninput=renderIntegrations;
    $("#importOpenApi").onclick=async()=>{try{const spec=JSON.parse($("#openApiSpec").value);const result=await api("/api/automation/integrations/import",{method:"POST",body:JSON.stringify({name:$("#openApiName").value,baseUrl:$("#openApiBase").value,spec})});await loadIntegrations();toast(result.added+" operações OpenAPI importadas.");}catch(error){toast("Não foi possível importar: "+error.message)}};
    $("#automationAiForm").onsubmit=async e=>{e.preventDefault();try{const body={ai:{baseUrl:$("#automationAiBase").value,model:$("#automationAiModel").value,apiKey:$("#automationAiKey").value}};const res=await api("/api/automation/settings/ai",{method:"PUT",body:JSON.stringify(body)});$("#automationAiKey").value="";$("#automationAiState").textContent=res.settings.configured?"Chave salva e criptografada localmente.":"Não configurado";toast("Provedor de IA salvo.")}catch(error){toast(error.message)}};
  }
  bind();window.KamyAutomation={load,refresh:async()=>{state.loaded=false;await load()}};
})();