// Run with jsdom installed: node --test tests/test_search_card.cjs
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('jsdom');
const source=readFileSync(require('node:path').join(__dirname,'../custom_components/cinemaseat/cinema-search-card.js'),'utf8');
const a='media_player.tv27',b='media_player.tv26_5';
function fixture() {
  const dom=new JSDOM('',{runScripts:'outside-only'});dom.window.eval(source);
  const card=dom.window.document.createElement('cinemaseat-search-card');
  const calls=[];
  const states=Object.fromEntries([a,b].map((id,i)=>[id,{state:'playing',attributes:{player_id:id,friendly_name:`TV ${i}`,status:'playing',session_id:`session-${i}`,owner:'local',media_title:`Film ${i}`,audio_tracks:[{id:'audio',name:'English'}],subtitle_tracks:[],selected_audio_id:'audio'}}]));
  const hass={states,callWS:async request=>{calls.push(JSON.parse(JSON.stringify(request)));return {};}};
  card.setConfig({entity:a});card.hass=hass;
  const select=entity=>{card.shadowRoot.querySelector('#player').value=entity;card.shadowRoot.querySelector('#player').dispatchEvent(new dom.window.Event('change'));};
  return {dom,card,calls,hass,select};
}
test('all playback controls follow the selected player and its state',async()=>{
 const {card,calls,hass,select}=fixture();
 for (const entity of [b,a,b]) {
  select(entity);
  for (const service of ['media_play','media_pause','media_stop','media_previous_track','media_next_track']) {
   hass.states[entity].attributes.status=service==='media_play'?'paused':'playing';card.hass=hass;
   await card._transport(service);
   assert.deepEqual(calls.at(-1),{type:'call_service',domain:'media_player',service,target:{entity_id:entity},service_data:{}});
  }
  assert.match(card.shadowRoot.querySelector('#playbackState').textContent,new RegExp(hass.states[entity].attributes.media_title));
 }
 hass.states[b].attributes.status='idle';card.hass=hass;
 assert.ok([...card.shadowRoot.querySelectorAll('button[data-service]')].every(button=>button.disabled));
 select(a);assert.equal(card.shadowRoot.querySelector('[data-service="media_pause"]').disabled,false);
 hass.states[a].state='unavailable';card.hass=hass;
 assert.ok([...card.shadowRoot.querySelectorAll('button[data-service]')].every(button=>button.disabled));
});
test('pending requests lock the player selector; failures restore controls',async()=>{
 const {card,calls,hass,select}=fixture();select(b);
 let reject;hass.callWS=request=>{calls.push(request);return new Promise((_,r)=>{reject=r;});};
 const pending=card._transport('media_pause');
 assert.equal(card.shadowRoot.querySelector('#player').disabled,true);
 await card._transport('media_stop');assert.equal(calls.length,1);
 assert.equal(calls[0].target.entity_id,b);
 reject(new Error('Player disconnected'));await pending;
 assert.equal(card.shadowRoot.querySelector('#player').disabled,false);
 assert.equal(card._busy,false);
 assert.equal(card.shadowRoot.querySelector('#message').textContent,'Player disconnected');
});
test('search, film start and track changes share the same player selector',async()=>{
 const {card,calls,select}=fixture();select(b);
 card.shadowRoot.querySelector('input').value='Film';await card._search();assert.equal(calls.at(-1).entity_id,b);
 await card._play({title:'Film',media_content_id:'film-id'});assert.equal(calls.at(-1).target.entity_id,b);
 card.shadowRoot.querySelector('#currentSubtitle').value='';await card._switchTrack('subtitle');
 assert.equal(calls.at(-1).target.entity_id,b);assert.equal(calls.at(-1).service_data.session_id,'session-1');
});
