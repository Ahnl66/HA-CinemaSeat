/* All library and track requests go through the paired tvOS player. */
class CinemaSeatSearchCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({mode:"open"});
    this._results=[]; this._busy=false; this._selection=null;
    this.shadowRoot.innerHTML=`
      <style>
        ha-card {display:block;padding:20px} h2 {margin:0 0 16px;font-size:20px} h3 {margin:16px 0 12px;font-size:17px}
        label {display:block;margin-bottom:6px} input,select,button {font:inherit}
        select,input {box-sizing:border-box;width:100%;padding:12px;color:var(--primary-text-color);background:var(--card-background-color);border:1px solid var(--divider-color);border-radius:8px}
        select {margin-bottom:16px} form {display:flex;gap:8px} form input {flex:1;min-width:0}
        button {cursor:pointer;padding:10px 16px;border:0;border-radius:8px;background:var(--primary-color);color:var(--text-primary-color,#fff)}
        button[aria-pressed="true"] {box-shadow:inset 0 0 0 3px var(--primary-text-color)}
        button:disabled {opacity:.45;cursor:default} button:focus-visible,input:focus-visible,select:focus-visible {outline:2px solid var(--primary-color);outline-offset:3px}
        .hint {font-size:13px;color:var(--secondary-text-color);margin:12px 0}
        #message {min-height:22px;margin:12px 0} #message.error {color:var(--error-color)}
        .result {display:flex;align-items:center;flex-wrap:wrap;gap:8px;border-top:1px solid var(--divider-color);padding:12px 0}
        .name {flex:1;min-width:120px;overflow-wrap:anywhere} small {display:block;color:var(--secondary-text-color);margin-top:4px}
        .controls {display:flex;flex-wrap:wrap;gap:8px;margin:12px 0} #playbackState {overflow-wrap:anywhere}
        .tracks {border-top:1px solid var(--divider-color);margin-top:12px;padding-top:4px} [hidden] {display:none!important}
      </style>
      <ha-card>
        <h2>Search and start a film</h2><label for="player">Player</label><select id="player"></select>
        <section class="tracks" aria-label="Selected player controls">
          <h3>Playback</h3><div id="playbackState" role="status" aria-live="polite"></div>
          <div class="controls">
            <button id="showCurtain" aria-pressed="false">Show curtain</button>
            <button data-service="media_play">Play / resume</button>
            <button data-service="media_pause">Pause</button>
            <button data-service="media_stop">Stop</button>
            <button data-service="media_previous_track">Previous chapter</button>
            <button data-service="media_next_track">Next chapter</button>
            <button id="skipSequence">Skip sequence step</button>
          </div>
        </section>

        <label for="source">Library source</label><select id="source"><option value="all">Plex and NAS</option><option value="nas">NAS</option><option value="plex">Plex</option></select>
        <form><input aria-label="Film title" placeholder="Search for a film…" maxlength="128" required><button type="submit">Search</button></form>
        <div class="controls"><input id="timecode" aria-label="Move to Timecode" placeholder="HH:MM:SS" inputmode="numeric"><button id="moveTimecode">Move to Timecode</button></div>
        <p class="hint">Open CinemaSeat. Enable Allow control from Home Assistant in its HA settings to start films. Stop the current film before starting another. Use Options to choose audio and subtitles before starting.</p>
        <div id="message" role="status" aria-live="polite"></div><div id="results"></div>
        <section id="selection" class="tracks" hidden>
          <h3 id="selectionTitle"></h3>
          <label for="startAudio">Audio before start</label><select id="startAudio"></select>
          <label for="startSubtitle">Subtitles before start</label><select id="startSubtitle"></select>
          <div class="controls">
            <button id="startSelected">Start with these choices</button>
            <button id="sequenceSelected">Play Sequence with these choices</button>
            <button id="makeAutomation">Make automation with these choices</button>
          </div>
          <p class="hint">Run the automation manually or add a trigger in Home Assistant. Play Sequence waits for the HA script to release the presentation with Start Sequence.</p>
        </section>
        <section id="currentTracks" class="tracks" hidden>
          <h3 id="currentTitle">Current film tracks</h3>
          <label for="currentAudio">Current film audio</label><select id="currentAudio"></select>
          <label for="currentSubtitle">Current film subtitles</label><select id="currentSubtitle"></select>
          <p class="hint">Choose a track for the current film. Actual selection is confirmed by player state.</p>
        </section>
      </ha-card>`;
    this.shadowRoot.querySelector("form").addEventListener("submit",e=>{e.preventDefault();this._search();});
    this.shadowRoot.querySelector("#player").addEventListener("change",()=>{
      this._results=[];this._selection=null;this._message("");this._renderResults();this._renderSelection();this._update();
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
  }
  setConfig(config) {
    if (!config.entity) throw new Error("Configure a CinemaSeat media_player as entity");
    this._config=config;
    this.shadowRoot.querySelector("h2").textContent=config.title||"Search and start a film";
    this._update();
  }
  set hass(hass) {this._hass=hass;this._update();}
  getCardSize() {return 9;}
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
    else if (!this._busy&&attributes.remote_control_allowed===false) this._message("Library available. Enable Allow control from Home Assistant in CinemaSeat's HA settings to start or control films.");
    else if (!this._busy&&this._offline) this._message("");
    this._offline=unavailable;
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
    if (presentation) this.shadowRoot.querySelector("#playbackState").textContent += ` · ${presentation.lead.toUpperCase()} · ${presentation.phase}${presentation.waiting_for_ha?" · Waiting for HA release":""}`;
    const current=!!attributes.session_id&&!['idle','stopped','ended','error'].includes(status);
    for (const button of this.shadowRoot.querySelectorAll("button[data-service]")) {
      const service=button.dataset.service;
      let allowed=current||service==="media_stop"&&!!presentation;
      if (service==="media_play") allowed=!!presentation?.waiting_for_ha||current&&["ready","paused"].includes(status);
      else if (service==="media_pause") allowed=current&&status==="playing";
      else if (service!=="media_stop") allowed=current&&["playing","paused"].includes(status);
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
      const name=document.createElement("div");name.className="name";name.textContent=movie.title;
      const detail=document.createElement("small");detail.textContent=(movie.media_content_id.startsWith("nas:")?"NAS":"Plex")+" · Film ID: "+movie.media_content_id;name.append(detail);
      const options=document.createElement("button");options.className="details";options.textContent="Options";
      options.setAttribute("aria-label","Options "+movie.title);options.addEventListener("click",()=>this._details(movie));
      const start=document.createElement("button");start.className="play";start.textContent="Start";
      start.setAttribute("aria-label","Start "+movie.title);start.addEventListener("click",()=>this._play(movie));
      row.append(name,options,start);
      if (movie.media_content_id.startsWith("nas:")) {
        const sequence=document.createElement("button");sequence.className="sequence";sequence.textContent="Play Sequence";
        sequence.addEventListener("click",()=>this._prepareSequence(movie));row.append(sequence);
      }
      return row;
    }));
  }
  async _search() {
    const query=this.shadowRoot.querySelector("form input").value.trim();if (this._busy||!query) return;
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
      this._selection={...data.movie,title:movie.title,boot_id:data.boot_id};this._renderSelection();this._message("Choose audio and subtitles, then start the film.");
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
      extra:{audio_id:audio||null,subtitle_id:subtitle||null,subtitles_off:!subtitle}}});
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
    await this._play(movie,{...tracks,playback_mode:"sequence"});
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
}
if (!customElements.get("cinemaseat-search-card")) customElements.define("cinemaseat-search-card",CinemaSeatSearchCard);
window.customCards=window.customCards||[];
window.customCards.push({type:"cinemaseat-search-card",name:"CinemaSeat film search",description:"Search, start, control playback, and choose audio/subtitles on the selected tvOS player."});
