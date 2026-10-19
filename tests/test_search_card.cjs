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
  const hass={states,user:{is_admin:true},callWS:async request=>{calls.push(JSON.parse(JSON.stringify(request)));return {};}};
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
 card.shadowRoot.querySelector('form input').value='Film';await card._search();assert.equal(calls.at(-1).entity_id,b);
 await card._play({title:'Film',media_content_id:'film-id'});assert.equal(calls.at(-1).target.entity_id,b);
 card.shadowRoot.querySelector('#currentSubtitle').value='';await card._switchTrack('subtitle');
 assert.equal(calls.at(-1).target.entity_id,b);assert.equal(calls.at(-1).service_data.session_id,'session-1');
});

test('curtain toggle follows selected player, confirmed state and capability',async()=>{
 const {card,calls,hass,select}=fixture();
 for (const entity of [a,b]) {
  hass.states[entity].attributes.status='idle';
  hass.states[entity].attributes.capabilities=['show_curtain'];
  hass.states[entity].attributes.curtain_state='hidden';
  select(entity);await card._showCurtain();
  assert.deepEqual(calls.at(-1),{type:'call_service',domain:'cinemaseat',service:'show_curtain',target:{entity_id:entity},service_data:{show:true}});
  assert.equal(card.shadowRoot.querySelector('#showCurtain').getAttribute('aria-pressed'),'false');
  hass.states[entity].attributes.curtain_state='closed';card.hass=hass;
  assert.equal(card.shadowRoot.querySelector('#showCurtain').getAttribute('aria-pressed'),'true');
  await card._showCurtain();assert.equal(calls.at(-1).service_data.show,false);
 }
 hass.states[b].attributes.status='playing';card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('#showCurtain').disabled,true);
 hass.states[b].attributes.status='idle';hass.states[b].attributes.capabilities=[];card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('#showCurtain').disabled,true);
 assert.equal(card.shadowRoot.querySelector('#showCurtain').hidden,true);
 const count=calls.length;await card._showCurtain();assert.equal(calls.length,count);
});

function movieChoices(card) {
 card._selection={id:'movie-123',title:'Film <2026>',boot_id:'old-boot',audio:[{id:'audio-nl',name:'Dutch'}],subtitles:[{id:'sub-en',name:'English'}]};
 card._renderSelection();card._update();
 card.shadowRoot.querySelector('#startAudio').value='audio-nl';
 card.shadowRoot.querySelector('#startSubtitle').value='sub-en';
}
test('automation saves current player and choices, curtain then ten-second delay, with no boot ID or immediate playback',async()=>{
 const {card,hass,select,calls}=fixture();select(b);movieChoices(card);
 hass.states[b].attributes.curtain_state='closed';hass.states[b].attributes.capabilities=['show_curtain'];card.hass=hass;
 const saved=[];hass.callApi=async(...args)=>saved.push(JSON.parse(JSON.stringify(args)));
 await card._makeAutomation();
 assert.equal(saved[0][0],'POST');assert.match(saved[0][1],/^config\/automation\/config\/cinemaseat_[a-f0-9]{32}$/);
 const config=saved[0][2];assert.equal(config.alias,'CinemaSeat - Film <2026>');
 assert.deepEqual(config.triggers,[]);assert.deepEqual(config.conditions,[]);
 assert.deepEqual(config.actions,[{action:'cinemaseat.show_curtain',target:{entity_id:b},data:{show:true}},{delay:{seconds:10}},
  {action:'media_player.play_media',target:{entity_id:b},data:{media_content_type:'movie',media_content_id:'movie-123',extra:{audio_id:'audio-nl',subtitle_id:'sub-en',subtitles_off:false}}}]);
 assert.equal(JSON.stringify(config).includes('boot'),false);assert.equal(calls.length,0);
 assert.match(card.shadowRoot.querySelector('#message a').getAttribute('href'),/^\/config\/automation\/edit\/cinemaseat_/);
 await card._makeAutomation();assert.notEqual(saved[0][1],saved[1][1]);
});
test('without curtain capability, stale curtain state cannot add a curtain to automations',async()=>{
 const {card,hass}=fixture();movieChoices(card);
 hass.states[a].attributes.curtain_state='closed';card.hass=hass;
 card.shadowRoot.querySelector('#startAudio').value='';card.shadowRoot.querySelector('#startSubtitle').value='';
 let saved;hass.callApi=async(method,path,config)=>saved=JSON.parse(JSON.stringify(config));
 await card._makeAutomation();assert.equal(saved.actions.length,1);
 assert.deepEqual(saved.actions[0].data.extra,{audio_id:null,subtitle_id:null,subtitles_off:true});
 assert.equal(saved.actions[0].target.entity_id,a);
});
test('automation creation locks selection, prevents duplicate clicks, and restores controls after permission/storage errors',async()=>{
 const {card,hass}=fixture();movieChoices(card);
 let writes=0,reject;hass.callApi=()=>{writes++;return new Promise((_,r)=>reject=r);};
 const pending=card._makeAutomation();assert.equal(card.shadowRoot.querySelector('#player').disabled,true);
 await card._makeAutomation();assert.equal(writes,1);
 reject(new Error('Storage unavailable'));await pending;
 assert.equal(card.shadowRoot.querySelector('#player').disabled,false);
 assert.equal(card.shadowRoot.querySelector('#makeAutomation').disabled,false);
 assert.equal(card.shadowRoot.querySelector('#message').textContent,'Storage unavailable');
 hass.user.is_admin=false;card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('#makeAutomation').disabled,true);
 await card._makeAutomation();assert.equal(writes,1);
 assert.match(card.shadowRoot.querySelector('#message').textContent,/administrator/);
});

test('NAS source, sequence with tracks and timecode commands follow the chosen player',async()=>{
 const {card,calls,hass,select}=fixture();select(b);
 const attributes=hass.states[b].attributes;
 attributes.capabilities=['prepare_sequence','seek_current'];attributes.ha_mode=true;
 attributes.status='idle';card.hass=hass;
 card.shadowRoot.querySelector('#source').value='nas';card.shadowRoot.querySelector('form input').value='Film';
 await card._search();assert.equal(calls.at(-1).media_content_type,'cinemaseat_nas');
 await card._prepareSequence({media_content_id:'nas:feature'}, {audio_id:'audio-nl',subtitles_off:true});
 assert.equal(calls.at(-1).service,'play_media');assert.equal(calls.at(-1).target.entity_id,b);
 assert.equal(calls.at(-1).service_data.extra.audio_id,'audio-nl');
 assert.equal(calls.at(-1).service_data.extra.playback_mode,'sequence');
 attributes.status='playing';attributes.presentation={id:'show',lead:'ha',phase:'movie',waiting_for_ha:false};card.hass=hass;
 card.shadowRoot.querySelector('#timecode').value='01:02:03';await card._moveTimecode();
 assert.equal(calls.at(-1).service,'media_seek');assert.equal(calls.at(-1).service_data.seek_position,3723);
 const count=calls.length;card.shadowRoot.querySelector('#timecode').value='01:99:01';await card._moveTimecode();
 assert.equal(calls.length,count);
 attributes.presentation.phase='trailer';card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('#moveTimecode').disabled,true);
 attributes.ha_mode=false;card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('#skipSequence').disabled,true);
 assert.equal(card.shadowRoot.querySelector('[data-service="media_stop"]').disabled,true);
});


test('locally started sequence allows transport while new film starts still require HA mode',async()=>{
 const {card,calls,hass}=fixture();const attributes=hass.states[a].attributes;
 attributes.ha_mode=false;attributes.can_control_playback=true;
 attributes.capabilities=['prepare_sequence','seek_current','pause_current','resume_current','stop_current','select_audio_current'];
 attributes.presentation={id:'local-show',lead:'cs',phase:'movie',waiting_for_ha:false};
 card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('[data-service="media_pause"]').disabled,false);
 assert.equal(card.shadowRoot.querySelector('[data-service="media_stop"]').disabled,false);
 assert.equal(card.shadowRoot.querySelector('#moveTimecode').disabled,false);
 assert.equal(card.shadowRoot.querySelector('#currentAudio').disabled,false);
 assert.equal(card.shadowRoot.querySelector('form input').disabled,true);
 assert.equal(card.shadowRoot.querySelector('#startSelected').disabled,true);
 await card._transport('media_pause');assert.equal(calls.at(-1).service,'media_pause');
 attributes.status='paused';card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('[data-service="media_play"]').disabled,false);
 attributes.can_control_playback=false;card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('[data-service="media_play"]').disabled,true);
});


test('paired library stays readable without a mode; persistent permission gates all start buttons',async()=>{
 const {card,calls,hass}=fixture();const attributes=hass.states[a].attributes;
 attributes.ha_mode=false;attributes.remote_control_allowed=false;attributes.can_browse_library=true;
 attributes.can_start_playback=false;attributes.can_control_playback=false;attributes.status='idle';
 attributes.capabilities=['prepare_sequence','pause_current'];card.hass=hass;
 card._results=[{media_content_id:'nas:film',title:'Film'}];card._renderResults();card._update();
 assert.equal(card.shadowRoot.querySelector('form input').disabled,false);
 assert.equal(card.shadowRoot.querySelector('button.play').disabled,true);
 assert.equal(card.shadowRoot.querySelector('button.details').disabled,false);
 assert.equal(card.shadowRoot.querySelector('#startSelected').disabled,true);
 await card._play({media_content_id:'nas:film',title:'Film'});assert.equal(calls.length,0);
 attributes.ha_mode=true;attributes.remote_control_allowed=true;attributes.can_start_playback=true;card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('button.play').disabled,false);
 attributes.status='playing';attributes.can_start_playback=false;attributes.can_control_playback=true;card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('button.play').disabled,true);
 assert.equal(card.shadowRoot.querySelector('[data-service="media_pause"]').disabled,false);
});

test('dashboard tabs, overview and diagnostics follow the selected player without injecting metadata',()=>{
 const {card,hass,select}=fixture();
 const attrs=hass.states[b].attributes;attrs.feature_title='<img onerror=alert(1)>';attrs.presentation={id:'show-b',lead:'cs',phase:'trailer',title:'Feature B'};
 attrs.media_position=12;attrs.media_duration=100;attrs.boot_id='boot-b';attrs.curtain_state='opening';
 select(b);card._showPage('diagnostics');
 assert.equal(card.shadowRoot.querySelector('[data-section="diagnostics"]').hidden,false);
 assert.equal(card.shadowRoot.querySelector('[data-section="control"]').hidden,true);
 assert.equal(card.shadowRoot.querySelector('#nowTitle').textContent,'<img onerror=alert(1)>');
 assert.equal(card.shadowRoot.querySelector('#nowTitle img'),null);
 assert.match(card.shadowRoot.querySelector('#rawState').textContent,/boot-b/);
 assert.equal(card.shadowRoot.querySelector('#positionText').textContent,'00:00:12');
 assert.equal(card._imageURL('https://untrusted.invalid/image'),null);
 assert.equal(card._imageURL('/api/media_player_proxy/test'),'/api/media_player_proxy/test');
});
test('browse uses native HA API, paginates and keeps failed back navigation recoverable',async()=>{
 const {card,calls,hass}=fixture();hass.states[a].attributes.capabilities=['browse_movies'];card.hass=hass;
 hass.callWS=async req=>{calls.push(req);return {title:req.media_content_id||'Sources',children:[
  {title:'Film',media_class:'movie',media_content_type:'movie',media_content_id:'nas:film',can_play:true,can_expand:true},
  {title:'Next page',media_class:'directory',media_content_type:'cinemaseat_library',media_content_id:'nas:30',can_expand:true,can_play:false}]};};
 await card._browse('cinemaseat_library','nas:0');
 assert.equal(calls.at(-1).type,'media_player/browse_media');assert.equal(calls.at(-1).entity_id,a);
 assert.equal(card.shadowRoot.querySelector('#nextPage').hidden,false);
 assert.equal(card._nextPage.media_content_id,'nas:30');
 await card._browse('cinemaseat_library','nas:30');
 assert.equal(card._browseHistory.length,2);
 hass.callWS=async()=>{throw new Error('Browse failed');};await card._browseBack();
 assert.equal(card._browseHistory.length,2);assert.match(card.shadowRoot.querySelector('#message').textContent,/Browse failed/);
});
test('explicit release captures presentation identity and preroll disables feature-only controls',async()=>{
 const {card,calls,hass}=fixture();const attrs=hass.states[a].attributes;
 attrs.capabilities=['start_sequence','advance_sequence'];attrs.can_control_playback=true;
 attrs.presentation={id:'show-1',lead:'cs',phase:'preparing',waiting_for_ha:true};card.hass=hass;
 await card._releaseSequence();assert.equal(calls.at(-1).service,'start_sequence');
 assert.deepEqual(calls.at(-1).service_data,{presentation_id:'show-1'});
 attrs.presentation={id:'show-2',lead:'ha',phase:'trailer',waiting_for_ha:false};card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('#releaseSequence').disabled,true);
 assert.equal(card.shadowRoot.querySelector('[data-service="media_pause"]').disabled,true);
 assert.equal(card.shadowRoot.querySelector('[data-service="media_previous_track"]').disabled,true);
 assert.equal(card.shadowRoot.querySelector('[data-service="media_next_track"]').disabled,false);
});
test('native selectors bind by player identity and never fall through to another player',async()=>{
 const {card,calls,hass,select}=fixture();
 for(const [player,id] of [[a,'select.a_audio'],[b,'select.b_audio']])hass.states[id]={state:'English',attributes:{player_id:player,track_type:'audio',options:['English','Dutch']}};
 card.hass=hass;select(b);
 const audio=card.shadowRoot.querySelector('#nativeAudio');assert.equal(audio.dataset.entity,'select.b_audio');
 audio.value='Dutch';await card._nativeTrack('audio');
 assert.equal(calls.at(-1).target.entity_id,'select.b_audio');assert.equal(calls.at(-1).domain,'select');assert.deepEqual(calls.at(-1).service_data,{option:'Dutch'});
 delete hass.states['select.b_audio'];card.hass=hass;assert.equal(audio.disabled,true);
});
test('event subscriptions filter players, cap memory, stop on removal and clean up a late subscription',async()=>{
 const {card,hass}=fixture();let receive,stopped=0;
 hass.connection={subscribeEvents:async(callback,type)=>{assert.equal(type,'cinemaseat_event');receive=callback;return()=>{stopped++;};}};card.hass=hass;
 await card._toggleEvents();
 receive({data:{entity_id:b,event:'pause_movie'}});assert.equal(card._events.length,0);
 for(let i=0;i<160;i++)receive({data:{entity_id:a,event:'timecode',position:i}});
 assert.equal(card._events.length,150);assert.equal(card._events[0].data.position,10);
 card.disconnectedCallback();await Promise.resolve();await Promise.resolve();assert.equal(stopped,1);
 receive({data:{entity_id:a,event:'pause_movie'}});assert.equal(card._events.length,150);
 let resolve;hass.connection={subscribeEvents:()=>new Promise(r=>{resolve=r;})};card.hass=hass;
 const pending=card._toggleEvents();card.disconnectedCallback();resolve(()=>{stopped++;});await pending;assert.equal(stopped,2);
});
test('timecode marker ignores paused, skipped and wrong-version samples and fires once without a service call',async()=>{
 const {card,calls,hass}=fixture();hass.states[a].attributes.boot_id='boot';hass.states[a].attributes.presentation={id:'show',movie_id:'nas:version',title:'Feature',phase:'movie'};
 hass.connection={subscribeEvents:async()=>()=>{}};card.hass=hass;
 card.shadowRoot.querySelector('#markerTimecode').value='00:00:10';await card._armMarker();
 const sample={entity_id:a,event:'timecode',presentation_id:'show',movie_id:'nas:version',boot_id:'boot',status:'playing',buffering:false,discontinuity:false,previous_position:9,position:10};
 for(const delta of [{status:'paused'},{buffering:true},{discontinuity:true},{movie_id:'nas:other'},{presentation_id:'old'},{boot_id:'old'}])card._receiveEvent({data:{...sample,...delta}});
 assert.equal(card._marker.fired,false);card._receiveEvent({data:sample});assert.equal(card._marker.fired,true);
 assert.match(card.shadowRoot.querySelector('#markerStatus').textContent,/Test passed/);assert.equal(calls.length,0);
 card.disconnectedCallback();
});
test('custom sequence route and saved sequence automation retain the same wait-and-release contract',async()=>{
 const {card,calls,hass}=fixture();const attrs=hass.states[a].attributes;attrs.status='idle';attrs.can_start_playback=true;attrs.capabilities=['prepare_sequence'];card.hass=hass;
 card.shadowRoot.querySelector('#commandRoute').value='custom';await card._prepareSequence({media_content_id:'nas:film',title:'Film'},{audio_id:'audio'});
 assert.equal(calls.at(-1).domain,'cinemaseat');assert.equal(calls.at(-1).service,'prepare_sequence');assert.deepEqual(calls.at(-1).service_data,{movie_id:'nas:film',audio_id:'audio'});
 card._selection={id:'nas:film',title:'Film',audio:[],subtitles:[]};card._renderSelection();card.shadowRoot.querySelector('#automationPlayback').value='sequence';
 const config=card._automationConfig();assert.equal(config.actions.at(-1).data.extra.playback_mode,'sequence');
 assert.equal(config.actions.length,1);assert.equal(JSON.stringify(config).includes('presentation_id'),false);
});
test('native selector discovery resolves registry device siblings and preserves player scope',async()=>{
 const {card,hass,select}=fixture();hass.states[a].attributes.player_id='stable-a';
 hass.states['select.renamed_audio']={state:'English',attributes:{options:['English']}};
 hass.callWS=async req=>{assert.equal(req.type,'config/entity_registry/list');return [{entity_id:a,device_id:'device-a'},
  {entity_id:'select.renamed_audio',device_id:'device-a',platform:'cinemaseat',unique_id:'stable-a_audio'},
  {entity_id:'select.other_audio',device_id:'device-b',platform:'cinemaseat',unique_id:'stable-a_audio'}];};
 card.hass=hass;await card._discoverNative();assert.equal(card.shadowRoot.querySelector('#nativeAudio').dataset.entity,'select.renamed_audio');
 select(b);assert.equal(card.shadowRoot.querySelector('#nativeAudio').dataset.entity,'');
});
test('live events keep an expanded payload open while new timecodes arrive',()=>{
 const {card}=fixture();card._receiveEvent({data:{entity_id:a,event:'start_movie'}});
 card.shadowRoot.querySelector('#eventLog details').open=true;
 card._receiveEvent({data:{entity_id:a,event:'timecode',position:1}});
 assert.equal(card.shadowRoot.querySelectorAll('#eventLog details[open]').length,1);
 assert.match(card.shadowRoot.querySelector('#eventLog details[open]').textContent,/start_movie/);
});
test('native browse is disabled for a legacy app outside its permitted mode',()=>{
 const {card,hass}=fixture();hass.states[a].attributes.capabilities=['browse_movies'];hass.states[a].attributes.ha_mode=false;hass.states[a].attributes.can_browse_library=null;card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('#browseNAS').disabled,true);
 hass.states[a].attributes.can_browse_library=true;card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('#browseNAS').disabled,false);
});

test('disabled sources remove old search selections, browse buttons and source options without losing remaining films',()=>{
 const {card,hass}=fixture();const attrs=hass.states[a].attributes;
 card._results=[{media_content_id:'123',title:'Plex film'},{media_content_id:'nas:film',title:'NAS film'}];
 card._selection={id:'123',title:'Plex film',boot_id:attrs.boot_id};card._renderSelection();
 attrs.enabled_sources=['nas'];card.hass=hass;
 assert.deepEqual(card._results.map(movie=>movie.media_content_id),['nas:film']);
 assert.equal(card._selection,null);assert.equal(card.shadowRoot.querySelector('#selection').hidden,true);
 assert.equal(card.shadowRoot.querySelector('#source option[value="plex"]').hidden,true);
 assert.equal(card.shadowRoot.querySelector('#browsePlex').hidden,true);assert.equal(card.shadowRoot.querySelector('#browseNAS').hidden,false);
 // A delayed search response cannot restore a disabled source after its status update.
 card._results=[{media_content_id:'123',title:'Late Plex film'}];card.hass=hass;assert.equal(card._results.length,0);
 attrs.enabled_sources=[];attrs.can_browse_library=false;attrs.can_start_playback=false;card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('form button').disabled,true);
 attrs.enabled_sources=['plex','nas'];attrs.can_browse_library=true;attrs.can_start_playback=true;card.hass=hass;
 assert.equal(card.shadowRoot.querySelector('#browsePlex').hidden,false);
 assert.equal(card.shadowRoot.querySelector('#source option[value="plex"]').hidden,false);
});
