/* All library and track requests go through the paired tvOS player. */
class CinemaSeatSearchCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._results=[]; this._busy=false; this._selection=null;
    this._nativeRegistry={};this._registryReads=new Set();this._eventCounter=0;
    this._page="control"; this._events=[]; this._eventGeneration=0; this._listening=false;
    this._browseHistory=[]; this._nextPage=null; this._marker=null;
    this.shadowRoot.innerHTML=`
      <style>
        :host{display:block;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;--cs-line:var(--divider-color,#354152);--cs-soft:var(--secondary-background-color,#18222f)}
        *{box-sizing:border-box}ha-card{display:block;padding:24px;max-width:1500px;margin:0 auto;color:var(--primary-text-color,#e8edf5)}
        h2{margin:0;font-size:26px;letter-spacing:-.5px}h3{margin:0 0 16px;font-size:18px}h4{margin:14px 0 8px}p{line-height:1.5}
        .header,.controls,.tabs,.row{display:flex;align-items:center;flex-wrap:wrap;gap:10px}.header{justify-content:space-between;margin-bottom:22px}.header small{letter-spacing:2px;text-transform:uppercase}
        label{display:block;margin:8px 0 6px;font-size:14px}input,select,button,textarea{font:inherit}select,input,textarea{width:100%;padding:11px;color:var(--primary-text-color,#e8edf5);background:var(--card-background-color,#111923);border:1px solid var(--cs-line);border-radius:9px}
        button{cursor:pointer;padding:11px 15px;border:1px solid transparent;border-radius:9px;background:var(--primary-color,#1689c5);color:var(--text-primary-color,#fff)}button.secondary,.tabs button{background:var(--cs-soft);color:inherit;border-color:var(--cs-line)}button:disabled{opacity:.4;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--primary-color);outline-offset:3px}button[aria-pressed="true"],.tabs button[aria-selected="true"]{border-color:var(--primary-color);box-shadow:inset 0 -2px var(--primary-color)}
        .player-picker{width:min(100%,320px)}.player-picker select{margin:0}.now{display:grid;grid-template-columns:88px minmax(0,1fr);gap:20px;padding:20px;background:var(--cs-soft);border-radius:14px;margin-bottom:16px}.poster{width:88px;height:132px;object-fit:cover;border-radius:8px;background:var(--card-background-color)}.poster[hidden]+div{grid-column:1/-1}.now h3{font-size:23px;margin:6px 0}.chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.chip{font-size:12px;padding:5px 9px;border:1px solid var(--cs-line);border-radius:20px}.chip.good{color:var(--success-color,#7ad4aa)}.chip.warn{color:var(--warning-color,#e6bd70)}
        .tabs{gap:6px;margin:20px 0}.tabs button{flex:1;min-width:110px}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}.panel{padding:20px;border:1px solid var(--cs-line);border-radius:12px;min-width:0}.wide{grid-column:1/-1}.hint,small{font-size:13px;color:var(--secondary-text-color,#a4afbf)}small{display:block;margin-top:4px}.hint{margin:10px 0}.controls{margin:12px 0}.controls input{flex:1;min-width:150px}.controls select{flex:1;min-width:150px}.controls button{flex-shrink:0}form{display:flex;gap:8px}form input{flex:1;min-width:0}.facts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.fact{min-width:0}.fact span{font-size:12px;display:block;color:var(--secondary-text-color)}.fact strong{font-size:14px;overflow-wrap:anywhere;display:block;margin-top:4px;font-weight:500}
        progress{width:100%;height:8px;accent-color:var(--primary-color)}.time{display:flex;justify-content:space-between;font-variant-numeric:tabular-nums;font-size:13px;margin-top:6px}#message{min-height:20px;line-height:1.5;margin:14px 0}#message.error{color:var(--error-color,#ef9c9c)}.result{display:flex;align-items:center;flex-wrap:wrap;gap:8px;border-top:1px solid var(--cs-line);padding:12px 0}.name{flex:1;min-width:140px;overflow-wrap:anywhere}.thumb{width:42px;height:63px;object-fit:cover;border-radius:4px}.tracks{margin-top:16px;padding-top:16px;border-top:1px solid var(--cs-line)}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:var(--cs-soft);padding:14px;border-radius:8px;max-height:440px;overflow:auto}summary{cursor:pointer;padding:10px 0}.event{padding:10px 0;border-top:1px solid var(--cs-line)}.event summary{font-size:13px}.event time{color:var(--secondary-text-color);margin-right:8px}#eventLog{max-height:520px;overflow:auto}#eventLog details[open] pre{max-height:240px}.checklist li{margin:10px 0;line-height:1.45}[hidden]{display:none!important}
        @media(max-width:720px){ha-card{padding:14px}.grid{grid-template-columns:1fr}.wide{grid-column:auto}.now{padding:14px;gap:12px;grid-template-columns:64px minmax(0,1fr)}.poster{width:64px;height:96px}.panel{padding:15px}.facts{grid-template-columns:1fr 1fr}.now h3{font-size:19px}.tabs button{font-size:13px;min-width:90px}.controls button{flex-grow:1}.player-picker{width:100%}}
      </style>
      <ha-card>
        <header class="header"><div><small>CinemaSeat · Home Assistant</small><h2>Cinema control & test dashboard</h2></div><div class="player-picker"><label for="player">Player</label><select id="player"></select></div></header>
        <div class="now"><img id="poster" class="poster" alt="Current film poster" hidden><div><small id="featureLabel">CURRENT PRESENTATION</small><h3 id="nowTitle">No active film</h3><div id="playbackState" role="status" aria-live="polite"></div><div id="statusChips" class="chips"></div><progress id="progress" max="100" value="0" aria-label="Playback progress"></progress><div class="time"><span id="positionText">00:00:00</span><span id="durationText">00:00:00</span></div></div></div>
        <nav class="tabs" role="tablist" aria-label="Dashboard sections"><button data-page="control" role="tab">Control</button><button data-page="library" role="tab">Library</button><button data-page="events" role="tab">Events & tests</button><button data-page="diagnostics" role="tab">Diagnostics</button></nav>
        <div id="message" role="status" aria-live="polite"></div>
        <div class="page grid" data-section="control">
          <section class="panel" aria-label="Selected player controls"><h3>Playback</h3><div class="controls"><button data-service="media_play">Play / resume</button><button data-service="media_pause">Pause</button><button data-service="media_stop">Stop presentation</button><button data-service="media_previous_track">Previous chapter</button><button data-service="media_next_track">Next chapter / step</button></div><label for="timecode">Move feature to timecode</label><div class="controls"><input id="timecode" aria-label="Move to Timecode" placeholder="HH:MM:SS" inputmode="numeric"><button id="moveTimecode">Move to Timecode</button></div><p class="hint">Chapter and seek commands apply to the feature. Both HA and the ATV remote remain usable. Current chapter: <strong id="chapterText">—</strong></p></section>
          <section class="panel"><h3>Sequence & curtain</h3><div id="sequenceFacts" class="facts"></div><div class="controls"><button id="releaseSequence">Release this presentation</button><button id="skipSequence">Skip sequence step</button><button id="showCurtain" aria-pressed="false">Show curtain</button></div><p class="hint">Release uses the exact presentation ID shown here. It does not enable automatic release of later presentations. On current apps the curtain belongs to Play Sequence.</p><label for="commandRoute">Sequence preparation route</label><select id="commandRoute"><option value="standard">Standard media_player.play_media</option><option value="custom">CinemaSeat prepare_sequence action</option></select><p class="hint">Choose a NAS film under Library. Both routes prepare the same sequence and wait for explicit release.</p></section>
          <section class="panel"><h3>Film audio & subtitles</h3><div id="currentTracks" hidden><h4 id="currentTitle">Current film tracks</h4><label for="currentAudio">Audio via CinemaSeat action</label><select id="currentAudio"></select><label for="currentSubtitle">Subtitles via CinemaSeat action</label><select id="currentSubtitle"></select></div><p class="hint">Track choices follow confirmed player feedback. Session IDs protect against a film change.</p></section>
          <section class="panel"><h3>Native HA selectors</h3><label for="nativeAudio">Audio via select.select_option</label><select id="nativeAudio"></select><label for="nativeSubtitle">Subtitles via select.select_option</label><select id="nativeSubtitle"></select><p id="nativeStatus" class="hint"></p></section>
        </div>
        <div class="page grid" data-section="library" hidden>
          <section class="panel wide"><h3>Search or browse your library</h3><label for="source">Search source</label><select id="source"><option value="all">Plex and NAS</option><option value="nas">NAS</option><option value="plex">Plex</option></select><form><input aria-label="Film title" placeholder="Search for a film…" maxlength="128" required><button type="submit">Search</button></form><div class="controls"><button id="browseRoot" class="secondary">Browse sources</button><button id="browsePlex" class="secondary">Browse Plex</button><button id="browseNAS" class="secondary">Browse NAS</button><button id="browseBack" class="secondary">Back</button></div><p id="browsePath" class="hint">Search up to 50 matches, or browse all indexed films in pages of 30.</p><div id="results"></div><div class="controls"><button id="nextPage" hidden>Next page</button></div></section>
          <section id="selection" class="panel" hidden><h3 id="selectionTitle"></h3><label for="startAudio">Audio before start</label><select id="startAudio"></select><label for="startSubtitle">Subtitles before start</label><select id="startSubtitle"></select><label for="automationPlayback">Saved automation playback</label><select id="automationPlayback"><option value="direct">Direct Play</option><option value="sequence">Play Sequence (separate release automation)</option></select><div class="controls"><button id="startSelected">Start with these choices</button><button id="sequenceSelected">Play Sequence with these choices</button><button id="makeAutomation" class="secondary">Make automation with these choices</button></div><p class="hint">Direct Start plays without sequence events or a release wait. Play Sequence waits for HA or a manual release. Saved start automations are run manually until you add a trigger.</p><details><summary>Selected movie details</summary><pre id="movieDetails"></pre></details></section>
          <section class="panel"><h3>Film ID test</h3><label for="manualMovie">Exact indexed movie ID</label><input id="manualMovie" placeholder="nas:… or Plex movie ID" maxlength="128"><div class="controls"><button id="loadMovieDetails" class="secondary">Load details / tracks</button></div><p class="hint">Use an ID from search, browse or feature_movie_id. This reads details only; use the selected film buttons to start.</p></section>
        </div>
        <div class="page grid" data-section="events" hidden>
          <section class="panel wide"><h3>Live CinemaSeat events</h3><div class="controls"><button id="listenEvents">Start listening</button><button id="clearEvents" class="secondary">Clear log</button><button id="exportEvents" class="secondary">Download event log</button><select id="eventFilter" aria-label="Event filter"><option value="all">All events</option><option value="sequence">Sequence & curtain</option><option value="playback">Playback & tracks</option><option value="timecode">Timecodes</option></select></div><p id="eventStatus" class="hint">Not listening. Events are live only; nothing is replayed.</p><p class="hint">Sequence events require Play Sequence. Direct Play has no presentation events. Event subscription may require an HA administrator.</p><div id="eventLog"></div></section>
          <section class="panel"><h3>Timecode crossing test</h3><label for="markerTimecode">Feature timecode</label><input id="markerTimecode" placeholder="HH:MM:SS" inputmode="numeric"><div class="controls"><button id="armMarker">Arm for current feature version</button><button id="resetMarker" class="secondary">Reset</button></div><p id="markerStatus" class="hint">Observe a timecode crossing without executing room scripts.</p><p class="hint">Uses actual timecode events, not estimated HA progress. Paused/buffering samples and skipped ranges do not trigger the marker. It fires once for the captured film version and presentation.</p></section>
          <section class="panel"><h3>Integration test checklist</h3><ol class="checklist"><li>Open CS with control disabled: library/status available, playback disabled.</li><li>Enable HA control on ATV; browse/search Plex and NAS and inspect tracks/posters.</li><li>Play directly: test pause, resume, seek, chapters and both track-control routes.</li><li>Start a NAS sequence from HA; inspect Prepare, release it and skip preroll.</li><li>Start Play Sequence on ATV; repeat HA controls and ATV remote controls.</li><li>Arm a marker; cross it normally, then test seeking over it and rewinding.</li><li>Disable HA control during playback; confirm ATV playback continues.</li><li>Background/reopen CS; confirm reconnect without replaying events.</li></ol></section>
        </div>
        <div class="page grid" data-section="diagnostics" hidden>
          <section class="panel"><h3>Connection & permission</h3><div id="connectionFacts" class="facts"></div><div class="controls"><button id="moreInfo" class="secondary">HA entity details</button><button id="refreshState" class="secondary">Refresh HA state</button><button id="exportState" class="secondary">Download diagnostics</button></div><p class="hint">Playback permission is changed on ATV in Settings → Home Assistant. Pairing and permission are separate. Refresh requests HA's current entity state; it does not start playback.</p></section>
          <section class="panel"><h3>Capabilities & attributes</h3><div id="capabilities" class="chips"></div><details open><summary>Complete media-player state</summary><pre id="rawState"></pre></details><p class="hint">Unsupported commands stay disabled. No volume, power or shuffle controls are exposed by the current integration.</p></section>
        </div>
      </ha-card>
`;
    this.shadowRoot.querySelector("form").addEventListener("submit",e=>{e.preventDefault();this._search();});
    this.shadowRoot.querySelector("#player").addEventListener("change",()=>{
      this._results=[];this._selection=null;this._browseHistory=[];this._nextPage=null;this._marker=null;this._markerMessage("Marker reset on player change.");this._message("");this._renderResults();this._renderSelection();this._update();
    });
    this.shadowRoot.querySelector("#startSelected").addEventListener("click",()=>{
      if (!this._selection) return;
      const audio=this.shadowRoot.querySelector("#startAudio").value;
      const subtitle=this.shadowRoot.querySelector("#startSubtitle").value;
      this._play({title:this._selection.title,media_content_id:this._selection.id},
        {audio_id:audio||null,subtitle_id:subtitle||null,subtitles_off:!subtitle,boot_id:this._selection.boot_id});
    });
    this.shadowRoot.querySelector("#sequenceSelected").addEventListener("click",()=>{
      if (!this._selection) return;
      const audio=this.shadowRoot.querySelector("#startAudio").value;
      const subtitle=this.shadowRoot.querySelector("#startSubtitle").value;
      this._prepareSequence({title:this._selection.title,media_content_id:this._selection.id},
        {audio_id:audio||undefined,subtitle_id:subtitle||undefined,subtitles_off:!subtitle});
    });
    this.shadowRoot.querySelector("#skipSequence").addEventListener("click",()=>this._sequenceAction("advance_sequence"));
    this.shadowRoot.querySelector("#moveTimecode").addEventListener("click",()=>this._moveTimecode());
    this.shadowRoot.querySelector("#makeAutomation").addEventListener("click",()=>this._makeAutomation());
    this.shadowRoot.querySelector("#showCurtain").addEventListener("click",()=>this._showCurtain());
    for (const button of this.shadowRoot.querySelectorAll("button[data-service]")) {
      button.addEventListener("click",()=>this._transport(button.dataset.service));
    }
    this.shadowRoot.querySelector("#currentAudio").addEventListener("change",()=>this._switchTrack("audio"));
    this.shadowRoot.querySelector("#currentSubtitle").addEventListener("change",()=>this._switchTrack("subtitle"));
    for (const button of this.shadowRoot.querySelectorAll("button[data-page]")) button.addEventListener("click",()=>this._showPage(button.dataset.page));
    for (const [id,type,content] of [["browseRoot",null,null],["browsePlex","cinemaseat_library","plex:0"],["browseNAS","cinemaseat_library","nas:0"]])
      this.shadowRoot.querySelector("#"+id).addEventListener("click",()=>this._browse(type,content));
    this.shadowRoot.querySelector("#browseBack").addEventListener("click",()=>this._browseBack());
    this.shadowRoot.querySelector("#nextPage").addEventListener("click",()=>{if(this._nextPage)this._browse(this._nextPage.media_content_type,this._nextPage.media_content_id);});
    this.shadowRoot.querySelector("#loadMovieDetails").addEventListener("click",()=>{const id=this.shadowRoot.querySelector("#manualMovie").value.trim();if(id)this._details({media_content_id:id,title:id});});
    this.shadowRoot.querySelector("#releaseSequence").addEventListener("click",()=>this._releaseSequence());
    this.shadowRoot.querySelector("#nativeAudio").addEventListener("change",()=>this._nativeTrack("audio"));
    this.shadowRoot.querySelector("#nativeSubtitle").addEventListener("change",()=>this._nativeTrack("subtitle"));
    this.shadowRoot.querySelector("#listenEvents").addEventListener("click",()=>this._toggleEvents());
    this.shadowRoot.querySelector("#eventFilter").addEventListener("change",()=>this._renderEvents());
    this.shadowRoot.querySelector("#clearEvents").addEventListener("click",()=>{this._events=[];this._renderEvents();});
    this.shadowRoot.querySelector("#exportEvents").addEventListener("click",()=>this._download("events",this._events.filter(e=>e.data.entity_id===this._entity())));
    this.shadowRoot.querySelector("#exportState").addEventListener("click",()=>this._download("diagnostics",this._hass.states[this._entity()]));
    this.shadowRoot.querySelector("#armMarker").addEventListener("click",()=>this._armMarker());
    this.shadowRoot.querySelector("#resetMarker").addEventListener("click",()=>{this._marker=null;this._markerMessage("Marker reset.");});
    this.shadowRoot.querySelector("#moreInfo").addEventListener("click",()=>this.dispatchEvent(new CustomEvent("hass-more-info",{detail:{entityId:this._entity()},bubbles:true,composed:true})));
    this.shadowRoot.querySelector("#refreshState").addEventListener("click",()=>this._refreshState());
  }
  setConfig(config) {
    if (!config.entity) throw new Error("Configure a CinemaSeat media_player as entity");
    if(config.section&&!["control","library","events","diagnostics"].includes(config.section))throw new Error("Unknown CinemaSeat dashboard section");
    this._config=config;
    this._page=config.section||this._page;
    this.shadowRoot.querySelector("h2").textContent=config.title||"Cinema control & test dashboard";
    this._update();
  }
  set hass(hass) {
    if(this._eventsConnection&&this._eventsConnection!==hass.connection)this._stopEvents();
    if(this._registryConnection!==hass.connection){this._nativeRegistry={};this._registryReads.clear();this._registryConnection=hass.connection;}
    this._hass=hass;this._update();
  }
  getCardSize() {return 14;}
  getGridOptions() {return {columns:12,min_columns:12,rows:"auto"};}
  _entity() {return this.shadowRoot.querySelector("#player").value||this._config.entity;}
  _update() {
    if (!this._hass||!this._config) return;
    const select=this.shadowRoot.querySelector("#player");
    const entities=this._config.entities ? [...this._config.entities] : Object.keys(this._hass.states).filter(id=>
      id.startsWith("media_player.")&&this._hass.states[id].attributes.player_id);
    if (!entities.includes(this._config.entity)) entities.unshift(this._config.entity);
    const signature=entities.map(id=>[id,this._hass.states[id]?.attributes.friendly_name||id]);
    if (JSON.stringify(signature)!==this._optionsSignature) {
      const old=select.value||this._config.entity;
      select.replaceChildren(...signature.map(([id,name])=>this._option(id,name)));
      select.value=entities.includes(old)?old:this._config.entity;this._optionsSignature=JSON.stringify(signature);
    }
    const state=this._hass.states[this._entity()];
    const unavailable=!state||["unavailable","unknown"].includes(state.state);
    const attributes=state?.attributes||{};
    const canBrowse=attributes.can_browse_library??attributes.ha_mode;
    const canStart=attributes.can_start_playback??attributes.ha_mode;
    if (this._selection&&attributes.boot_id&&this._selection.boot_id!==attributes.boot_id) {
      this._selection=null;this._renderSelection();
    }
    this.shadowRoot.querySelector("form input").disabled=this._busy||unavailable||canBrowse===false;
    this.shadowRoot.querySelector("form button").disabled=this._busy||unavailable||canBrowse===false;
    this.shadowRoot.querySelector("#source").disabled=this._busy||unavailable||canBrowse===false;
    select.disabled=this._busy;
    const active=!!attributes.presentation||!["idle","stopped","ended","error"].includes(attributes.status);
    for (const button of this.shadowRoot.querySelectorAll("button.play")) button.disabled=this._busy||unavailable||active||canStart===false;
    for (const button of this.shadowRoot.querySelectorAll("button.details")) button.disabled=this._busy||unavailable;
    this.shadowRoot.querySelector("#startSelected").disabled=this._busy||unavailable||active||canStart===false;
    const sequence=this.shadowRoot.querySelector("#sequenceSelected");
    sequence.hidden=!this._selection?.id?.startsWith("nas:")||!(attributes.capabilities||[]).includes("prepare_sequence");
    sequence.disabled=this._busy||unavailable||active||canStart===false;
    for (const button of this.shadowRoot.querySelectorAll("button.sequence")) button.disabled=this._busy||unavailable||active||canStart===false;
    const automation=this.shadowRoot.querySelector("#makeAutomation");
    automation.disabled=this._busy||unavailable||!this._selection||!this._hass.user?.is_admin;
    automation.title=this._hass.user?.is_admin ? "Save these choices as a reusable automation" : "A Home Assistant administrator is required to create automations";
    for (const id of ["startAudio","startSubtitle"]) this.shadowRoot.querySelector("#"+id).disabled=this._busy||unavailable;
    this._renderPlayback(state,unavailable);
    this._renderCurrent(attributes,unavailable);
    if (!this._busy&&unavailable) this._message(attributes.pairing_required ? "Pair CinemaSeat in its HA settings, then use Reconfigure in Home Assistant." : "CinemaSeat disconnected. Open the paired CinemaSeat app.");
    else if (!this._busy&&this._offline) this._message("");
    this._offline=unavailable;
    this._renderDashboard(state,unavailable);
  }
  _renderPlayback(state,unavailable) {
    const attributes=state?.attributes||{}, status=attributes.status||state?.state||"unavailable";
    this.shadowRoot.querySelector("#playbackState").textContent=
      [attributes.media_title,status].filter(Boolean).join(" · ");
    const curtain=this.shadowRoot.querySelector("#showCurtain");
    curtain.hidden=!(attributes.capabilities||[]).includes("show_curtain");
    curtain.setAttribute("aria-pressed",String(attributes.curtain_state==="closed"));
    curtain.disabled=this._busy||unavailable||!["idle","stopped","ended","error"].includes(status)||
      !(attributes.capabilities||[]).includes("show_curtain");
    curtain.title=(attributes.capabilities||[]).includes("show_curtain") ?
      "Show or hide the closed curtain before starting a film" : "Standalone curtain is retired; use Play Sequence";
    const presentation=attributes.presentation;
    const preroll=!!presentation&&presentation.phase!=="movie";
    this.shadowRoot.querySelector("#skipSequence").hidden=!preroll;
    this.shadowRoot.querySelector("#skipSequence").disabled=this._busy||unavailable||(attributes.can_control_playback??attributes.ha_mode)===false||!!presentation?.waiting_for_ha;
    this.shadowRoot.querySelector("#moveTimecode").disabled=this._busy||unavailable||(attributes.can_control_playback??attributes.ha_mode)===false||preroll||!["playing","paused"].includes(status)||!(attributes.capabilities||[]).includes("seek_current");
    if (presentation) this.shadowRoot.querySelector("#playbackState").textContent += ` · ${(presentation.lead||"cs").toUpperCase()} · ${presentation.phase}${presentation.waiting_for_ha?" · Waiting for HA release":""}`;
    const current=!!attributes.session_id&&!['idle','stopped','ended','error'].includes(status);
    for (const button of this.shadowRoot.querySelectorAll("button[data-service]")) {
      const service=button.dataset.service;
      let allowed=current||service==="media_stop"&&!!presentation;
      if (service==="media_play") allowed=!!presentation?.waiting_for_ha||current&&["ready","paused"].includes(status);
      else if (service==="media_pause") allowed=current&&status==="playing";
      else if (service!=="media_stop") allowed=current&&["playing","paused"].includes(status);
      if (preroll && service!=="media_stop") allowed=service==="media_play"&&!!presentation.waiting_for_ha || service==="media_next_track"&&!presentation.waiting_for_ha;
      const caps=attributes.capabilities||[],capability={media_play:status==="ready"?"start_current":"resume_current",media_pause:"pause_current",media_stop:"stop_current",media_next_track:preroll?"advance_sequence":"next_chapter_current",media_previous_track:"previous_chapter_current"}[service];
      if(service==="media_play"&&presentation?.waiting_for_ha){if(caps.length&&!caps.includes("start_sequence"))allowed=false;}
      else if(caps.length&&!caps.includes(capability))allowed=false;
      button.disabled=this._busy||unavailable||!allowed||(attributes.can_control_playback??attributes.ha_mode)===false;
    }
  }
  async _showCurtain() {
    if (this._busy||this.shadowRoot.querySelector("#showCurtain").disabled) return;
    const entity=this._entity(),show=this._hass.states[entity]?.attributes.curtain_state!=="closed";
    this._busy=true;this._update();this._message("Sending curtain command…");
    try {
      await this._hass.callWS({type:"call_service",domain:"cinemaseat",service:"show_curtain",
        target:{entity_id:entity},service_data:{show}});
      this._message("Curtain command sent. The player confirms its state.");
    } catch (err) {this._message(err.message||String(err),true);}
    finally {this._busy=false;this._update();}
  }
  async _transport(service) {
    const button=this.shadowRoot.querySelector(`button[data-service="${service}"]`);
    if (this._busy||!button||button.disabled) return;
    const entity=this._entity();
    this._busy=true;this._update();this._message("Sending playback command…");
    try {
      await this._hass.callWS({type:"call_service",domain:"media_player",service,
        target:{entity_id:entity},service_data:{}});
      this._message("Playback command sent. Actual playback is confirmed by player state.");
    } catch (err) {this._message(err.message||String(err),true);}
    finally {this._busy=false;this._update();}
  }
  _option(value,text) {const option=document.createElement("option");option.value=value;option.textContent=text;return option;}
  _fillSelect(select,tracks,value,defaultLabel) {
    const signature=JSON.stringify([tracks,defaultLabel]);
    if (select.dataset.signature!==signature) {
      select.replaceChildren(this._option("",defaultLabel),...tracks.map(track=>this._option(track.id,`${track.name} · ${track.id}`)));
      select.dataset.signature=signature;
    }
    select.value=value||"";
  }
  _renderSelection() {
    const section=this.shadowRoot.querySelector("#selection");section.hidden=!this._selection;
    if (!this._selection) return;
    this.shadowRoot.querySelector("#selectionTitle").textContent=this._selection.title;
    this.shadowRoot.querySelector("#movieDetails").textContent=JSON.stringify(this._selection,null,2);
    const automationMode=this.shadowRoot.querySelector("#automationPlayback");
    automationMode.options[1].disabled=!this._selection.id.startsWith("nas:");
    if(automationMode.options[1].disabled)automationMode.value="direct";
    this._fillSelect(this.shadowRoot.querySelector("#startAudio"),this._selection.audio||[],"","Default audio");
    this._fillSelect(this.shadowRoot.querySelector("#startSubtitle"),this._selection.subtitles||[],"","Off");
  }
  _renderCurrent(attributes,unavailable) {
    const section=this.shadowRoot.querySelector("#currentTracks");
    const current=["playing","paused"].includes(attributes.status)&&(!attributes.presentation||attributes.presentation.phase==="movie");
    section.hidden=!current;
    if (!current) return;
    this.shadowRoot.querySelector("#currentTitle").textContent="Tracks: "+(attributes.media_title||"current film");
    const audio=this.shadowRoot.querySelector("#currentAudio"),subtitle=this.shadowRoot.querySelector("#currentSubtitle");
    if (!this._busy) {
      this._fillSelect(audio,attributes.audio_tracks||[],attributes.selected_audio_id,"Current audio");
      audio.options[0].disabled=true;
      this._fillSelect(subtitle,attributes.subtitle_tracks||[],attributes.subtitles_off?"":attributes.selected_subtitle_id,"Off");
    }
    audio.disabled=this._busy||unavailable||(attributes.can_control_playback??attributes.ha_mode)===false||attributes.owner!=="local"||!(attributes.audio_tracks||[]).length;
    subtitle.disabled=this._busy||unavailable||(attributes.can_control_playback??attributes.ha_mode)===false||attributes.owner!=="local"||!Array.isArray(attributes.subtitle_tracks);
  }
  _message(text,error=false) {const el=this.shadowRoot.querySelector("#message");el.textContent=text;el.classList.toggle("error",error);}
  _renderResults() {
    this.shadowRoot.querySelector("#results").replaceChildren(...this._results.map(movie=>{
      const row=document.createElement("div");row.className="result";
      if(movie.thumbnail){const img=document.createElement("img");img.className="thumb";img.alt="";img.loading="lazy";const url=this._imageURL(movie.thumbnail);if(url){img.src=url;row.append(img);}}
      if(movie.can_expand&&!movie.can_play&&movie.media_class!=="movie") {
        const open=document.createElement("button");open.className="browse-folder secondary";open.textContent=movie.title;
        open.addEventListener("click",()=>this._browse(movie.media_content_type,movie.media_content_id));row.append(open);return row;
      }
      const name=document.createElement("div");name.className="name";name.textContent=movie.title;
      const detail=document.createElement("small");detail.textContent=(movie.media_content_id.startsWith("nas:")?"NAS":"Plex")+" · Film ID: "+movie.media_content_id;name.append(detail);
      const options=document.createElement("button");options.className="details";options.textContent="Options";
      options.setAttribute("aria-label","Options "+movie.title);options.addEventListener("click",()=>this._details(movie));
      const start=document.createElement("button");start.className="play";start.textContent="Start";
      start.setAttribute("aria-label","Start "+movie.title);start.addEventListener("click",()=>movie.media_content_type==="cinemaseat_sequence"?this._prepareSequence(movie):this._play(movie));
      if(movie.media_content_type==="cinemaseat_sequence")start.textContent="Play Sequence";
      row.append(name,options,start);
      if(movie.can_expand){const choices=document.createElement("button");choices.className="browse-choice secondary";choices.textContent="Browse choices";choices.addEventListener("click",()=>this._browse(movie.media_content_type,movie.media_content_id));row.append(choices);}
      if (movie.media_content_id.startsWith("nas:")&&movie.media_content_type!=="cinemaseat_sequence") {
        const sequence=document.createElement("button");sequence.className="sequence";sequence.textContent="Play Sequence";
        sequence.addEventListener("click",()=>this._prepareSequence(movie));row.append(sequence);
      }
      return row;
    }));
  }
  async _search() {
    const query=this.shadowRoot.querySelector("form input").value.trim();if (this._busy||!query) return;
    this._nextPage=null;this._browseHistory=[];
    this._busy=true;this._results=[];this._selection=null;this._renderResults();this._renderSelection();this._update();this._message("Search…");
    try {
      const source=this.shadowRoot.querySelector("#source").value;
      const response=await this._hass.callWS({type:"media_player/search_media",entity_id:this._entity(),search_query:query,
        ...(source!=="all"?{media_content_type:"cinemaseat_"+source}:{})});
      this._results=response.result||[];this._renderResults();
      this._message(this._results.length?`${this._results.length} film(s) found.${this._results.length===50?" Maximum 50 results; refine your search.":""}`:"No films found.");
    } catch (err) {this._message(err.message||String(err),true);}
    finally {this._busy=false;this._update();}
  }
  async _details(movie) {
    if (this._busy) return;this._busy=true;this._update();this._message("Loading audio and subtitles…");
    const entity=this._entity();
    try {
      const response=await this._hass.callWS({type:"call_service",domain:"cinemaseat",service:"movie_details",
        target:{entity_id:entity},service_data:{movie_id:movie.media_content_id},return_response:true});
      const data=response.response?.[entity];
      if (!data?.movie) throw new Error("The player returned no film details.");
      this._selection={...data.movie,title:data.movie.title||movie.title,boot_id:data.boot_id};this._renderSelection();this._message("Choose audio and subtitles, then start the film.");
    } catch (err) {this._message(err.message||String(err),true);}
    finally {this._busy=false;this._update();}
  }
  _automationConfig() {
    const entity=this._entity(),audio=this.shadowRoot.querySelector("#startAudio").value;
    const subtitle=this.shadowRoot.querySelector("#startSubtitle").value;
    const actions=[];
    if ((this._hass.states[entity]?.attributes.capabilities||[]).includes("show_curtain") &&
        this._hass.states[entity]?.attributes.curtain_state==="closed") {
      actions.push({action:"cinemaseat.show_curtain",target:{entity_id:entity},data:{show:true}});
      actions.push({delay:{seconds:10}});
    }
    actions.push({action:"media_player.play_media",target:{entity_id:entity},data:{
      media_content_type:"movie",media_content_id:this._selection.id,
      extra:{audio_id:audio||null,subtitle_id:subtitle||null,subtitles_off:!subtitle,
        ...(this.shadowRoot.querySelector("#automationPlayback").value==="sequence"?{playback_mode:"sequence"}:{})}}});
    return {alias:"CinemaSeat - "+this._selection.title,
      description:"Start the selected CinemaSeat film with saved audio/subtitle choices. Run manually or add a trigger in Home Assistant.",
      triggers:[],conditions:[],actions,mode:"single"};
  }
  async _makeAutomation() {
    if (this._busy||!this._selection) return;
    if (!this._hass.user?.is_admin) {this._message("A Home Assistant administrator is required to create automations.",true);return;}
    if (this.shadowRoot.querySelector("#makeAutomation").disabled) return;
    // Capture the selection now; no boot/session IDs belong in a saved automation.
    const config=this._automationConfig();
    // getRandomValues also works on local HTTP HA instances.
    const id="cinemaseat_"+Array.from(crypto.getRandomValues(new Uint32Array(4)),n=>n.toString(16).padStart(8,"0")).join("");
    this._busy=true;this._update();this._message("Creating automation…");
    try {
      await this._hass.callApi("POST",`config/automation/config/${id}`,config);
      this._message("Automation created: "+config.alias+". Run it manually or add a trigger.");
      const link=document.createElement("a");link.href=`/config/automation/edit/${id}`;link.textContent="Open automation";
      this.shadowRoot.querySelector("#message").append(" ",link);
    } catch (err) {this._message(err.message||err.body?.message||String(err),true);}
    finally {this._busy=false;this._update();}
  }
  async _sequenceAction(service, data={}) {
    if (this._busy) return;
    this._busy=true;this._update();
    try {
      await this._hass.callWS({type:"call_service",domain:"cinemaseat",service,
        target:{entity_id:this._entity()},service_data:data});
      this._message(service==="prepare_sequence"?"Sequence requested. The HA script releases its start.":"Sequence command sent.");
    } catch(err) {this._message(err.message||String(err),true);}
    finally {this._busy=false;this._update();}
  }
  async _prepareSequence(movie, tracks={}) {
    if (this.shadowRoot.querySelector("#commandRoute").value==="custom") {
      const attrs=this._hass.states[this._entity()]?.attributes||{};
      if ((attrs.can_start_playback??attrs.ha_mode)===false||this._busy) return;
      await this._sequenceAction("prepare_sequence",{movie_id:movie.media_content_id,...tracks});
    } else await this._play(movie,{...tracks,playback_mode:"sequence"});
  }
  async _moveTimecode() {
    if (this._busy||this.shadowRoot.querySelector("#moveTimecode").disabled) return;
    const value=this.shadowRoot.querySelector("#timecode").value.trim();
    if (!/^\d+:([0-5]\d):([0-5]\d)$/.test(value)) {this._message("Use HH:MM:SS.",true);return;}
    const [h,m,s]=value.split(":").map(Number),position=h*3600+m*60+s;
    if (!Number.isFinite(position)) return;
    this._busy=true;this._update();
    try {
      await this._hass.callWS({type:"call_service",domain:"media_player",service:"media_seek",
        target:{entity_id:this._entity()},service_data:{seek_position:position}});
      this._message("Timecode requested. The player confirms its position.");
    } catch(err) {this._message(err.message||String(err),true);}
    finally {this._busy=false;this._update();}
  }
  async _play(movie,extra={}) {
    const attributes=this._hass.states[this._entity()]?.attributes||{};
    if ((attributes.can_start_playback??attributes.ha_mode)===false) {
      this._message("Enable Allow control from Home Assistant in CinemaSeat's HA settings and stop the current film before starting another.");return;
    }
    if (this._busy) return;this._busy=true;this._update();this._message("Preparing and starting the film…");
    try {
      await this._hass.callWS({type:"call_service",domain:"media_player",service:"play_media",target:{entity_id:this._entity()},
        service_data:{media_content_type:"movie",media_content_id:movie.media_content_id,extra}});
      this._message(extra.playback_mode==="sequence"?"Sequence requested. HA or Play releases its start.":"Film started: "+movie.title);
    } catch (err) {this._message(err.message||String(err),true);}
    finally {this._busy=false;this._update();}
  }
  async _switchTrack(kind) {
    if (this._busy) return;
    const state=this._hass.states[this._entity()],select=this.shadowRoot.querySelector(kind==="audio"?"#currentAudio":"#currentSubtitle");
    const value=select.value;
    if (!state?.attributes.session_id||kind==="audio"&&!value) return;
    this._busy=true;this._update();this._message("Sending track selection…");
    const data={session_id:state.attributes.session_id};
    if (kind==="audio"||value) data.track_id=value;
    if (kind==="subtitle") data.off=!value;
    try {
      await this._hass.callWS({type:"call_service",domain:"cinemaseat",service:kind==="audio"?"select_audio":"select_subtitle",
        target:{entity_id:this._entity()},service_data:data});
      this._message("Track selection requested. Actual selection is confirmed by player state.");
    } catch (err) {this._message(err.message||String(err),true);}
    finally {this._busy=false;this._update();}
  }
  connectedCallback() {
    if(!this._clock)this._clock=setInterval(()=>this._renderOverview(),1000);
    if(this._hass&&this._config)this._discoverNative();
  }
  disconnectedCallback() {
    clearInterval(this._clock);this._clock=null;this._stopEvents();
  }
  _showPage(page) {
    if(!["control","library","events","diagnostics"].includes(page))return;
    this._page=page;
    for(const button of this.shadowRoot.querySelectorAll("button[data-page]")){button.id="tab-"+button.dataset.page;button.setAttribute("aria-controls","page-"+button.dataset.page);button.setAttribute("aria-selected",String(button.dataset.page===page));}
    for(const section of this.shadowRoot.querySelectorAll(".page")){section.id="page-"+section.dataset.section;section.setAttribute("aria-labelledby","tab-"+section.dataset.section);section.hidden=section.dataset.section!==page;section.setAttribute("role","tabpanel");}
  }
  _imageURL(value) {
    if(typeof value!=="string"||!value.startsWith("/api/media_player_proxy/"))return null;
    return this._hass?.hassUrl?this._hass.hassUrl(value):value;
  }
  _time(value) {
    const seconds=Math.max(0,Math.floor(Number(value)||0));
    return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(v=>String(v).padStart(2,"0")).join(":");
  }
  _seconds(value) {
    if(!/^\d+:([0-5]\d):([0-5]\d)$/.test(value))return null;
    const [h,m,s]=value.split(":").map(Number),result=h*3600+m*60+s;
    return Number.isSafeInteger(result)?result:null;
  }
  _renderOverview() {
    if(!this._hass||!this._config)return;
    const state=this._hass.states[this._entity()],a=state?.attributes||{};
    let position=Number(a.media_position)||0;const duration=Number(a.media_duration)||0;
    const anchor=Date.parse(a.media_position_updated_at);
    if(state?.state==="playing"&&!a.buffering&&Number.isFinite(anchor))position+=Math.max(0,(Date.now()-anchor)/1000);
    if(duration>0)position=Math.min(position,duration);
    this.shadowRoot.querySelector("#positionText").textContent=this._time(position);
    this.shadowRoot.querySelector("#durationText").textContent=this._time(duration);
    this.shadowRoot.querySelector("#progress").value=duration>0?position/duration*100:0;
  }
  _facts(id,values) {
    this.shadowRoot.querySelector("#"+id).replaceChildren(...values.map(([label,value])=>{
      const div=document.createElement("div");div.className="fact";const key=document.createElement("span"),text=document.createElement("strong");
      key.textContent=label;text.textContent=value===undefined||value===null?"—":typeof value==="boolean"?(value?"Yes":"No"):String(value);div.append(key,text);return div;
    }));
  }
  _renderDashboard(state,unavailable) {
    const a=state?.attributes||{},p=a.presentation||{},caps=a.capabilities||[],currentControl=(a.can_control_playback??a.ha_mode)!==false;
    this._showPage(this._page);
    this.shadowRoot.querySelector("#nowTitle").textContent=a.feature_title||p.title||a.media_title||"No active film";
    this.shadowRoot.querySelector("#featureLabel").textContent=p.id?"FEATURE · "+(a.library_source||"NAS").toUpperCase():"CURRENT FILM";
    const img=this.shadowRoot.querySelector("#poster"),url=this._imageURL(a.entity_picture);img.hidden=!url;if(url&&img.getAttribute("src")!==url)img.src=url;if(!url)img.removeAttribute("src");
    this.shadowRoot.querySelector("#chapterText").textContent=a.chapter_id??"—";
    const chips=[[unavailable?"Disconnected":"Connected",unavailable?"warn":"good"],[a.remote_control_allowed===false?"Control disabled":"Control "+(currentControl?"available":"idle"),a.remote_control_allowed===false?"warn":""],[p.waiting_for_ha?"Waiting for HA":p.phase||"No sequence",p.waiting_for_ha?"warn":""],["Curtain: "+(a.curtain_state||"hidden"),""]];
    this.shadowRoot.querySelector("#statusChips").replaceChildren(...chips.map(([text,style])=>{const span=document.createElement("span");span.className="chip "+style;span.textContent=text;return span;}));
    this._facts("sequenceFacts",[["Lead",p.lead],["Phase",p.phase],["Waiting for HA",!!p.waiting_for_ha],["Released",!!p.released],["Curtain",a.curtain_state],["Presentation ID",p.id]]);
    const release=this.shadowRoot.querySelector("#releaseSequence");release.dataset.presentation=p.id||"";
    release.disabled=this._busy||unavailable||!currentControl||!p.waiting_for_ha||!caps.includes("start_sequence");
    for(const id of ["browseRoot","browsePlex","browseNAS","browseBack","nextPage"])this.shadowRoot.querySelector("#"+id).disabled=this._busy||unavailable||(a.can_browse_library??a.ha_mode)===false||!caps.includes("browse_movies");
    this.shadowRoot.querySelector("#browseBack").disabled ||= this._browseHistory.length<2;
    this.shadowRoot.querySelector("#nextPage").hidden=!this._nextPage;
    this.shadowRoot.querySelector("#loadMovieDetails").disabled=this._busy||unavailable||!caps.includes("get_movie_details");
    this.shadowRoot.querySelector("#commandRoute").disabled=this._busy;
    this.shadowRoot.querySelector("#automationPlayback").disabled=this._busy;
    this._facts("connectionFacts",[["Entity",this._entity()],["Player ID",a.player_id],["Available",!unavailable],["Pairing required",a.pairing_required],["Remote control allowed",a.remote_control_allowed],["Library access",a.can_browse_library],["Can start",a.can_start_playback],["Can control current film",a.can_control_playback],["Source",a.library_source],["Owner",a.owner],["HA state",state?.state],["App status",a.status],["Buffering",a.buffering],["Error",a.error_code],["Boot ID",a.boot_id],["Clip session ID",a.session_id],["State updated",state?.last_updated],["Supported features",a.supported_features]]);
    this.shadowRoot.querySelector("#rawState").textContent=JSON.stringify(state||{error:"Entity not found"},null,2);
    this.shadowRoot.querySelector("#capabilities").replaceChildren(...caps.map(value=>{const span=document.createElement("span");span.className="chip";span.textContent=value;return span;}));
    this.shadowRoot.querySelector("#refreshState").disabled=this._busy;
    this._renderNative();this._renderEvents();this._renderOverview();
    if(this.isConnected)this._discoverNative();
  }
  _nativeEntity(kind) {
    const player=this._hass.states[this._entity()]?.attributes.player_id;
    const explicit=this._entity()===this._config.entity?this._config[kind+"_entity"]:null;
    if(explicit&&this._hass.states[explicit]?.attributes.player_id&&this._hass.states[explicit].attributes.player_id!==player)return undefined;
    return explicit||this._nativeRegistry[this._entity()]?.[kind]||Object.keys(this._hass.states).find(id=>id.startsWith("select.")&&this._hass.states[id].attributes.player_id===player&&this._hass.states[id].attributes.track_type===kind);
  }
  async _discoverNative() {
    const entity=this._entity(),player=this._hass?.states[entity]?.attributes.player_id;
    if(!player||this._registryReads.has(entity)||this._nativeEntity("audio")&&this._nativeEntity("subtitle"))return;
    this._registryReads.add(entity);const connection=this._hass.connection;
    try {
      const entries=await this._hass.callWS({type:"config/entity_registry/list"});
      if(connection!==this._hass.connection)return;
      const device=entries.find(e=>e.entity_id===entity)?.device_id;
      if(!device)return;
      const tracks={};
      for(const kind of ["audio","subtitle"]){const match=entries.find(e=>e.device_id===device&&e.platform==="cinemaseat"&&e.entity_id.startsWith("select.")&&e.unique_id===player+"_"+kind);if(match)tracks[kind]=match.entity_id;}
      this._nativeRegistry[entity]=tracks;
      if(this._entity()===entity)this._renderNative();
    }catch(_err){/* Explicit entity config and new selector attributes remain available. */}
  }
  _renderNative() {
    const names=[];
    for(const [kind,id] of [["audio","nativeAudio"],["subtitle","nativeSubtitle"]]) {
      const entity=this._nativeEntity(kind),state=this._hass.states[entity],select=this.shadowRoot.querySelector("#"+id),options=state?.attributes.options||[];
      const signature=JSON.stringify([entity,options]);
      if(select.dataset.signature!==signature){select.replaceChildren(...(options.length?options.map(v=>this._option(v,v)):[this._option("","Unavailable")]));select.dataset.signature=signature;}
      select.dataset.entity=entity||"";select.value=state?.state||"";select.disabled=this._busy||!state||["unavailable","unknown"].includes(state.state)||!options.length;
      if(entity)names.push(entity);
    }
    this.shadowRoot.querySelector("#nativeStatus").textContent=names.length?names.join(" · "):"Update the integration for automatic selector discovery, or configure audio_entity and subtitle_entity for this player.";
  }
  async _nativeTrack(kind) {
    const select=this.shadowRoot.querySelector(kind==="audio"?"#nativeAudio":"#nativeSubtitle"),entity=this._nativeEntity(kind),option=select.value;
    if(this._busy||select.disabled||entity!==select.dataset.entity||!this._hass.states[entity]?.attributes.options?.includes(option))return;
    this._busy=true;this._update();
    try{await this._hass.callWS({type:"call_service",domain:"select",service:"select_option",target:{entity_id:entity},service_data:{option}});this._message("Native track selection requested; waiting for confirmed feedback.");}
    catch(err){this._message(err.message||String(err),true);}finally{this._busy=false;this._update();}
  }
  async _releaseSequence() {
    const button=this.shadowRoot.querySelector("#releaseSequence"),id=button.dataset.presentation;
    if(this._busy||button.disabled||!id)return;
    await this._sequenceAction("start_sequence",{presentation_id:id});
  }
  async _browse(type=null,id=null,record=true) {
    if(this._busy||this.shadowRoot.querySelector("#browseRoot").disabled)return;
    this._browseFailed=false;this._busy=true;this._update();this._message("Browsing library…");
    try {
      const response=await this._hass.callWS({type:"media_player/browse_media",entity_id:this._entity(),...(type&&id?{media_content_type:type,media_content_id:id}:{})});
      if(record)this._browseHistory.push({type,id});
      const children=response.children||[];
      this._nextPage=children.find(movie=>movie.media_content_type==="cinemaseat_library"&&movie.title==="Next page")||null;
      this._results=children.filter(movie=>movie!==this._nextPage);
      this.shadowRoot.querySelector("#browsePath").textContent=response.title||"CinemaSeat library";
      this._renderResults();this._message(`${this._results.length} item(s). Expand or select a film to inspect tracks and playback choices.`);
    }catch(err){this._browseFailed=true;this._message(err.message||String(err),true);}finally{this._busy=false;this._update();}
  }
  async _browseBack() {
    if(this._busy||this._browseHistory.length<2)return;
    const current=this._browseHistory.pop(),previous=this._browseHistory.at(-1);
    const before=this._browseHistory.length;await this._browse(previous.type,previous.id,false);
    // A failed request must not lose the return path.
    if(this._browseFailed)this._browseHistory.splice(before,0,current);
  }
  async _refreshState() {
    if(this._busy)return;this._busy=true;this._update();
    try{await this._hass.callWS({type:"call_service",domain:"homeassistant",service:"update_entity",target:{entity_id:this._entity()},service_data:{}});this._message("HA state refresh requested. Live app telemetry remains the source of truth.");}
    catch(err){this._message(err.message||String(err),true);}finally{this._busy=false;this._update();}
  }
  _stopEvents() {
    this._listening=false;this._eventGeneration++;
    const stop=this._unsubscribe;this._unsubscribe=null;this._eventsConnection=null;
    if(stop)Promise.resolve().then(()=>stop()).catch(()=>{});
    this.shadowRoot.querySelector("#listenEvents").textContent="Start listening";
    this.shadowRoot.querySelector("#eventStatus").textContent="Not listening. Events are live only; nothing is replayed.";
  }
  async _toggleEvents() {
    if(this._listening){this._stopEvents();return;}
    const connection=this._hass?.connection;
    if(!connection?.subscribeEvents){this.shadowRoot.querySelector("#eventStatus").textContent="HA event subscription is unavailable.";return;}
    const generation=++this._eventGeneration;this._eventsConnection=connection;this._listening=true;
    this.shadowRoot.querySelector("#listenEvents").textContent="Stop listening";
    this.shadowRoot.querySelector("#eventStatus").textContent="Connecting to cinemaseat_event…";
    try {
      const stop=await connection.subscribeEvents(event=>{if(this._listening&&generation===this._eventGeneration&&connection===this._hass.connection)this._receiveEvent(event);},"cinemaseat_event");
      if(!this._listening||generation!==this._eventGeneration){await stop();return;}
      this._unsubscribe=stop;this.shadowRoot.querySelector("#eventStatus").textContent="Listening to cinemaseat_event · selected player only · last 150 events retained in this browser.";
    }catch(err){if(generation!==this._eventGeneration)return;this._stopEvents();this.shadowRoot.querySelector("#eventStatus").textContent="Cannot subscribe: "+(err.message||String(err));}
  }
  _receiveEvent(event) {
    const d=event?.data;
    if(!d||d.entity_id!==this._entity()||typeof d.event!=="string")return;
    this._events.push({id:++this._eventCounter,time_fired:event.time_fired||new Date().toISOString(),data:JSON.parse(JSON.stringify(d))});
    if(this._events.length>150)this._events.shift();
    const m=this._marker;
    if(m&&m.entity===d.entity_id&&d.event==="timecode"&&!m.fired&&m.presentation===d.presentation_id&&m.movie===d.movie_id&&m.boot===d.boot_id) {
      if(d.status==="playing"&&!d.buffering&&d.discontinuity===false&&Number.isFinite(d.previous_position)&&Number.isFinite(d.position)&&d.previous_position<m.position&&m.position<=d.position){
        m.fired=true;this._markerMessage("Crossed "+this._time(m.position)+" at "+this._time(d.position)+". Test passed; no room action was executed.");
      }
    }
    this._renderEvents();
  }
  _renderEvents() {
    if(!this._config)return;
    const filter=this.shadowRoot.querySelector("#eventFilter").value;
    const events=this._events.filter(e=>e.data.entity_id===this._entity()).filter(e=>filter==="all"||filter==="timecode"&&e.data.event==="timecode"||filter==="sequence"&&/sequence|curtain|intro|trailer|rating|^audio_|step_/.test(e.data.event)||filter==="playback"&&/movie|chapter|change_audio|change_subtitle|playback_error/.test(e.data.event));
    const log=this.shadowRoot.querySelector("#eventLog"),open=new Set([...log.querySelectorAll("details[open]")].map(el=>el.dataset.event));
    const scroll=log.scrollTop,height=log.scrollHeight;
    log.replaceChildren(...events.slice().reverse().map(event=>{
      const detail=document.createElement("details");detail.className="event";detail.dataset.event=String(event.id);detail.open=open.has(String(event.id));const summary=document.createElement("summary"),time=document.createElement("time"),pre=document.createElement("pre");
      time.textContent=new Date(event.time_fired).toLocaleTimeString();summary.append(time,document.createTextNode(event.data.event+" · "+this._time(event.data.position)));
      pre.textContent=JSON.stringify(event.data,null,2);detail.append(summary,pre);return detail;
    }));
    if(scroll>0)log.scrollTop=scroll+log.scrollHeight-height;
    if(!events.length){const hint=document.createElement("p");hint.className="hint";hint.textContent="No events captured for this player/filter. Start listening before the sequence begins.";log.append(hint);}
  }
  _markerMessage(text){this.shadowRoot.querySelector("#markerStatus").textContent=text;}
  async _armMarker() {
    const a=this._hass.states[this._entity()]?.attributes||{},p=a.presentation||{},position=this._seconds(this.shadowRoot.querySelector("#markerTimecode").value.trim());
    if(position===null){this._markerMessage("Use HH:MM:SS.");return;}
    if(position===0){this._markerMessage("Choose a time after 00:00:00; use start_movie to inspect the feature start.");return;}
    if(!p.id||!p.movie_id||!a.boot_id){this._markerMessage("Start a sequence to capture its presentation and feature version first.");return;}
    this._marker={entity:this._entity(),presentation:p.id,movie:p.movie_id,boot:a.boot_id,position,fired:false};
    this._markerMessage("Armed at "+this._time(position)+" for "+(p.title||p.movie_id)+" · "+p.id+". A new presentation needs a new marker.");
    if(!this._listening)await this._toggleEvents();
  }
  _download(kind,data) {
    const blob=new Blob([JSON.stringify({exported_at:new Date().toISOString(),entity_id:this._entity(),[kind]:data},null,2)],{type:"application/json"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="cinemaseat-"+kind+".json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
}
if (!customElements.get("cinemaseat-dashboard-card")) customElements.define("cinemaseat-dashboard-card",class extends CinemaSeatSearchCard {});
if (!customElements.get("cinemaseat-search-card")) customElements.define("cinemaseat-search-card",CinemaSeatSearchCard);
window.customCards=window.customCards||[];
window.customCards.push({type:"cinemaseat-search-card",name:"CinemaSeat film search",description:"Search, start, control playback, and choose audio/subtitles on the selected tvOS player."});

window.customCards.push({type:"cinemaseat-dashboard-card",name:"CinemaSeat dashboard",description:"Complete CinemaSeat control, library, event monitor and integration diagnostics."});
